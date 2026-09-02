/**
 * Pendência de reembolso e planejamento de estorno (spec, seção 6).
 *
 * O reembolso não é um interruptor: é um alvo menos o que já foi recebido. O
 * estado (pendente, parcial, quitado) é sempre DERIVADO, nunca armazenado.
 */

import type { Competencia } from './data';
import type { Centavos } from './dinheiro';

export interface Recebimento {
  valorCentavos: Centavos;
}

export function recebido(recebimentos: Recebimento[]): Centavos {
  return recebimentos.reduce((total, r) => total + r.valorCentavos, 0);
}

export function pendente(alvoCentavos: Centavos, recebimentos: Recebimento[]): Centavos {
  return alvoCentavos - recebido(recebimentos);
}

export function validarRecebimento(
  valorCentavos: Centavos,
  alvoCentavos: Centavos,
  recebimentos: Recebimento[],
): void {
  if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) {
    throw new Error(`Recebimento deve ser inteiro positivo em centavos: ${valorCentavos}`);
  }
  const restante = pendente(alvoCentavos, recebimentos);
  if (valorCentavos > restante) {
    throw new Error(`Recebimento de ${valorCentavos} excede o pendente de ${restante}`);
  }
}

export type StatusFaturaParcela = 'ABERTA' | 'FECHADA' | 'PAGA';

export interface ParcelaEstornavel {
  id: string;
  competencia: Competencia;
  valorCentavos: Centavos;
  statusFatura: StatusFaturaParcela;
}

/** Como a operadora devolveu: tudo numa fatura só, ou parcela a parcela. */
export type ModoCredito = 'UNICO' | 'POR_FATURA';

export interface PlanoEstorno {
  /** Ids das parcelas que viram CANCELADA — nunca chegaram a ser cobradas. */
  canceladas: string[];
  creditos: Array<{
    transactionId: string;
    valorCentavos: Centavos;
    competenciaCredito: Competencia;
  }>;
}

/**
 * O que decide o tratamento de cada parcela não é a operadora, é se aquele
 * dinheiro já foi cobrado. A operadora só decide ONDE os créditos aparecem.
 */
export function planejarEstorno(
  parcelas: ParcelaEstornavel[],
  modo: ModoCredito,
  competenciaDoCredito: Competencia,
): PlanoEstorno {
  const plano: PlanoEstorno = { canceladas: [], creditos: [] };

  for (const parcela of parcelas) {
    if (parcela.statusFatura === 'ABERTA') {
      plano.canceladas.push(parcela.id);
      continue;
    }
    plano.creditos.push({
      transactionId: parcela.id,
      valorCentavos: parcela.valorCentavos,
      competenciaCredito: modo === 'UNICO' ? competenciaDoCredito : parcela.competencia,
    });
  }

  return plano;
}

/**
 * Estorno parcial em valor (spec, seção 6.2): nenhuma parcela é cancelada, o
 * valor estornado vira crédito na competência informada. Use quando parte de
 * uma compra maior foi devolvida, não a compra inteira — as parcelas seguem
 * sendo cobradas normalmente.
 */
export function planejarEstornoParcial(
  transactionId: string,
  valorCentavos: Centavos,
  competenciaCredito: Competencia,
): { transactionId: string; valorCentavos: Centavos; competenciaCredito: Competencia } {
  if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) {
    throw new Error(`Estorno parcial deve ser inteiro positivo em centavos: ${valorCentavos}`);
  }
  return { transactionId, valorCentavos, competenciaCredito };
}

/**
 * Os quatro estados do spec (seção 6.1). Sempre DERIVADO do alvo e dos
 * recebimentos — nunca há um campo de status no banco que possa divergir.
 */
export type EstadoReembolso = 'NAO_REEMBOLSAVEL' | 'PENDENTE' | 'PARCIAL' | 'QUITADO';

export function estadoDoReembolso(
  alvoCentavos: Centavos,
  recebimentos: Recebimento[],
): EstadoReembolso {
  if (alvoCentavos <= 0) return 'NAO_REEMBOLSAVEL';

  const total = recebido(recebimentos);
  if (total <= 0) return 'PENDENTE';
  if (total >= alvoCentavos) return 'QUITADO';
  return 'PARCIAL';
}

export interface ReembolsoOrdenavel {
  diasParado: number;
  pendenteCentavos: Centavos;
}

/**
 * Mais parado primeiro; empate vai para o maior pendente.
 *
 * A tela responde "quem me deve?", e o sinal de risco que o app já elegeu
 * para o assunto é a idade — o aviso azul do Painel dispara por dias parados,
 * não por valor (spec, seção 8.1). Quem está há mais tempo sem pagar é quem
 * precisa ser cobrado.
 *
 * Devolve um array novo; não modifica o recebido.
 */
export function ordenarPorAntiguidade<T extends ReembolsoOrdenavel>(itens: T[]): T[] {
  return [...itens].sort(
    (a, b) => b.diasParado - a.diasParado || b.pendenteCentavos - a.pendenteCentavos,
  );
}

export interface GrupoDeParcelas {
  quantidade: number;
  valorCentavos: Centavos;
  /** Competências das próprias parcelas, ordenadas. */
  competencias: Competencia[];
}

export interface ResumoDoEstorno {
  /** Parcelas que ainda não foram cobradas e por isso somem. */
  canceladas: GrupoDeParcelas;
  /** Parcelas já cobradas, que permanecem e viram crédito. */
  creditadas: GrupoDeParcelas;
  /**
   * Onde os créditos aparecem: uma competência só no modo UNICO, uma por
   * parcela no POR_FATURA. Ordenada e sem repetição.
   */
  competenciasDeCredito: Competencia[];
  /** Quanto o estorno move ao todo. */
  totalCentavos: Centavos;
}

function agrupar(parcelas: ParcelaEstornavel[]): GrupoDeParcelas {
  return {
    quantidade: parcelas.length,
    valorCentavos: parcelas.reduce((total, p) => total + p.valorCentavos, 0),
    competencias: parcelas.map((p) => p.competencia).sort(),
  };
}

export interface ParcelaProcessadaPeloEstorno {
  /** A transação da parcela já virou CANCELADA (nunca chegou a ser cobrada). */
  cancelada: boolean;
  /** A parcela já tem ao menos um crédito de ESTORNO lançado (já foi cobrada
   *  e devolvida). */
  temCreditoEstorno: boolean;
}

/**
 * Uma compra já foi estornada por inteiro quando TODA parcela do grupo está
 * CANCELADA ou já tem crédito de ESTORNO — os dois destinos que `planejarEstorno`
 * dá a cada parcela. Reaplicar o estorno nesse estado mintaria um segundo
 * crédito para o mesmo dinheiro (spec, seção 6.2: a ação existe uma vez por
 * compra, não uma vez por clique).
 */
export function estornoJaAplicado(parcelas: ParcelaProcessadaPeloEstorno[]): boolean {
  return parcelas.length > 0 && parcelas.every((p) => p.cancelada || p.temCreditoEstorno);
}

/**
 * Traduz o plano do estorno nos números que a prévia mostra (spec, seção 8.5).
 * Contar, somar e achar a faixa de meses é decisão de dado — a tela só formata
 * o que sai daqui.
 */
export function resumirPlanoEstorno(
  plano: PlanoEstorno,
  parcelas: ParcelaEstornavel[],
): ResumoDoEstorno {
  const porId = new Map(parcelas.map((p) => [p.id, p]));

  // Um id que não está na lista é ignorado: nunca inventa valor.
  const achar = (ids: string[]): ParcelaEstornavel[] =>
    ids.map((id) => porId.get(id)).filter((p): p is ParcelaEstornavel => p !== undefined);

  const canceladas = agrupar(achar(plano.canceladas));
  const creditadas = agrupar(achar(plano.creditos.map((c) => c.transactionId)));

  const competenciasDeCredito = [
    ...new Set(plano.creditos.map((c) => c.competenciaCredito)),
  ].sort();

  return {
    canceladas,
    creditadas,
    competenciasDeCredito,
    totalCentavos: canceladas.valorCentavos + creditadas.valorCentavos,
  };
}
