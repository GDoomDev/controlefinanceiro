/**
 * Motor de competência de cartão de crédito.
 *
 * A competência de uma compra no crédito é o MÊS DO VENCIMENTO da fatura em que
 * ela cai — não o mês da compra. Ver spec, seção 4.
 */

import {
  type Competencia,
  type DataCivil,
  criarCompetencia,
  diaSeguro,
  partesDaCompetencia,
  somarMeses,
} from './data';
import type { Centavos } from './dinheiro';

export interface RegraCartao {
  /** Dia do mês em que a fatura fecha. 1..31 */
  diaFechamento: number;
  /** Dia do mês em que a fatura vence. 1..31 */
  diaVencimento: number;
}

export interface Fatura {
  /** Mês do vencimento — é esta a competência do lançamento. */
  competencia: Competencia;
  fechamento: DataCivil;
  vencimento: DataCivil;
}

/**
 * O vencimento cai no mesmo mês do fechamento quando o dia de vencimento é
 * maior que o de fechamento; caso contrário, no mês seguinte. A comparação usa
 * os dias configurados, não os encurtados.
 */
function vencimentoNoMesmoMes(regra: RegraCartao): boolean {
  return regra.diaVencimento > regra.diaFechamento;
}

function montarFatura(competenciaFechamento: Competencia, regra: RegraCartao): Fatura {
  const competenciaVencimento = vencimentoNoMesmoMes(regra)
    ? competenciaFechamento
    : somarMeses(competenciaFechamento, 1);

  const f = partesDaCompetencia(competenciaFechamento);
  const v = partesDaCompetencia(competenciaVencimento);

  return {
    competencia: competenciaVencimento,
    fechamento: { ano: f.ano, mes: f.mes, dia: diaSeguro(regra.diaFechamento, f.ano, f.mes) },
    vencimento: { ano: v.ano, mes: v.mes, dia: diaSeguro(regra.diaVencimento, v.ano, v.mes) },
  };
}

export function faturaDaCompra(compra: DataCivil, regra: RegraCartao): Fatura {
  const fechamentoDesteMes = diaSeguro(regra.diaFechamento, compra.ano, compra.mes);
  const competenciaDaCompra = criarCompetencia(compra.ano, compra.mes);

  // Comprou depois do fechamento? Entra na fatura do mês seguinte.
  const competenciaFechamento =
    compra.dia > fechamentoDesteMes
      ? somarMeses(competenciaDaCompra, 1)
      : competenciaDaCompra;

  return montarFatura(competenciaFechamento, regra);
}

/** Reconstrói a fatura a partir da competência (mês do vencimento). */
export function faturaDaCompetencia(c: Competencia, regra: RegraCartao): Fatura {
  const competenciaFechamento = vencimentoNoMesmoMes(regra) ? c : somarMeses(c, -1);
  return montarFatura(competenciaFechamento, regra);
}

/**
 * Faturas das parcelas de uma compra: a parcela k cai na competência da
 * primeira somada de (k−1) meses.
 */
export function faturasDasParcelas(
  compra: DataCivil,
  regra: RegraCartao,
  quantidade: number,
): Fatura[] {
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    throw new Error(`Quantidade de parcelas deve ser inteiro >= 1: ${quantidade}`);
  }

  const primeira = faturaDaCompra(compra, regra);
  return Array.from({ length: quantidade }, (_, k) =>
    faturaDaCompetencia(somarMeses(primeira.competencia, k), regra),
  );
}

export interface TransacaoDaFatura {
  ativa: boolean;
  valorCentavos: Centavos;
}

export interface CreditoDaFatura {
  origem: 'REEMBOLSO' | 'ESTORNO';
  valorCentavos: Centavos;
}

/**
 * Total de uma fatura (spec, seção 4): soma das transações ativas vinculadas
 * a ela, menos os créditos de origem ESTORNO. Créditos de REEMBOLSO NÃO
 * abatem a fatura — aquele dinheiro veio por fora do cartão, nunca passou
 * por ela. É essa definição que faz o total bater com o aplicativo do banco.
 */
export function totalFatura(
  transacoes: TransacaoDaFatura[],
  creditos: CreditoDaFatura[],
): Centavos {
  const somaTransacoes = transacoes
    .filter((t) => t.ativa)
    .reduce((total, t) => total + t.valorCentavos, 0);

  const somaEstornos = creditos
    .filter((c) => c.origem === 'ESTORNO')
    .reduce((total, c) => total + c.valorCentavos, 0);

  return somaTransacoes - somaEstornos;
}

/**
 * A janela que `/cartoes` mostra por padrão. Mais espaço para a frente do que
 * para trás porque é para a frente que o parcelamento empurra faturas: uma
 * compra em 18x cria dezoito competências futuras de uma vez.
 */
export const MESES_DE_FATURA_PARA_TRAS = 3;
export const MESES_DE_FATURA_PARA_FRENTE = 6;

/**
 * Separa as faturas visíveis das que ficam de fora da janela. Preserva a
 * ordem recebida e não modifica o array de entrada.
 */
export function janelaDeFaturas<T extends { competencia: Competencia }>(
  faturas: T[],
  mesCorrente: Competencia,
): { visiveis: T[]; ocultas: number } {
  const inicio = somarMeses(mesCorrente, -MESES_DE_FATURA_PARA_TRAS);
  const fim = somarMeses(mesCorrente, MESES_DE_FATURA_PARA_FRENTE);

  // "YYYY-MM" compara lexicograficamente na mesma ordem que cronologicamente.
  const visiveis = faturas.filter(
    (f) => f.competencia >= inicio && f.competencia <= fim,
  );

  return { visiveis, ocultas: faturas.length - visiveis.length };
}
