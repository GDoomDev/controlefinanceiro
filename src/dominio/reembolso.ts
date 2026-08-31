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
