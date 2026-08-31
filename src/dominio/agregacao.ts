/**
 * Agregação mensal e fórmula da sobra (spec, seção 7).
 *
 * Duas regras não óbvias moram aqui:
 *  1. Créditos são somados pela SUA competência, não pela da despesa. No
 *     reembolso as duas coincidem; no estorno com crédito único, não.
 *  2. A projeção usa máx(orçamento, comprometido) por categoria — somar os dois
 *     contaria a parcela já lançada duas vezes.
 */

import type { Competencia } from './data';
import type { Centavos } from './dinheiro';

export interface DespesaAgregavel {
  competencia: Competencia;
  categoriaId: string;
  valorCentavos: Centavos;
  cancelada: boolean;
}

export interface CreditoAgregavel {
  competenciaCredito: Competencia;
  categoriaId: string;
  valorCentavos: Centavos;
}

function somarNoMapa(mapa: Map<string, Centavos>, chave: string, valor: Centavos): void {
  mapa.set(chave, (mapa.get(chave) ?? 0) + valor);
}

/**
 * Gasto líquido por categoria na competência: despesas ativas menos créditos.
 * O resultado pode ser negativo quando um estorno cai num mês de pouco gasto.
 */
export function gastoPorCategoria(
  despesas: DespesaAgregavel[],
  creditos: CreditoAgregavel[],
  mes: Competencia,
): Map<string, Centavos> {
  const gastos = new Map<string, Centavos>();

  for (const d of despesas) {
    if (d.cancelada || d.competencia !== mes) continue;
    somarNoMapa(gastos, d.categoriaId, d.valorCentavos);
  }

  for (const c of creditos) {
    if (c.competenciaCredito !== mes) continue;
    somarNoMapa(gastos, c.categoriaId, -c.valorCentavos);
  }

  return gastos;
}

export function despesaLiquida(
  despesas: DespesaAgregavel[],
  creditos: CreditoAgregavel[],
  mes: Competencia,
): Centavos {
  let total = 0;
  for (const valor of gastoPorCategoria(despesas, creditos, mes).values()) {
    total += valor;
  }
  return total;
}

/**
 * Mês passado usa o que de fato entrou. Mês corrente e futuros usam o maior
 * entre previsto e realizado — cobre receita ainda não recebida, já recebida,
 * e bônus acima do previsto.
 */
export function receitaConsiderada(
  prevista: Centavos,
  realizada: Centavos,
  ehMesPassado: boolean,
): Centavos {
  return ehMesPassado ? realizada : Math.max(prevista, realizada);
}

export function sobraRealizada(
  receitaRealizada: Centavos,
  despesaLiquidaDoMes: Centavos,
): Centavos {
  return receitaRealizada - despesaLiquidaDoMes;
}

/**
 * Sobra projetada: receita menos o somatório de máx(orçamento, comprometido)
 * sobre a união das categorias com orçamento e das categorias com gasto.
 */
export function sobraProjetada(
  receita: Centavos,
  orcamentos: Map<string, Centavos>,
  gastos: Map<string, Centavos>,
): Centavos {
  const categorias = new Set([...orcamentos.keys(), ...gastos.keys()]);

  let comprometido = 0;
  for (const categoriaId of categorias) {
    comprometido += Math.max(orcamentos.get(categoriaId) ?? 0, gastos.get(categoriaId) ?? 0);
  }

  return receita - comprometido;
}
