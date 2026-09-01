import {
  type CreditoAgregavel,
  type DespesaAgregavel,
  despesaLiquida,
  gastoPorCategoria,
  receitaConsiderada,
  sobraProjetada,
  sobraRealizada,
} from '@/dominio/agregacao';
import { type Competencia, competenciaDe, dataCivilEm } from '@/dominio/data';
import {
  type EstadoOrcamento,
  type OrcamentoDoPainel,
  estadoDoOrcamento,
  faixasDoHeroi,
  ordenarPorCriticidade,
  restanteDoOrcamento,
} from '@/dominio/painel';

import { orcamentosDoMes } from './orcamentos';
import { prisma } from './prisma';
import { receitaPrevistaDoMes, receitaRealizadaDoMes } from './receitas';
import type { ClientePrisma } from './tipos';

export interface CardDoPainel {
  categoriaId: string;
  nome: string;
  corSlot: number;
  orcadoCentavos: number;
  gastoCentavos: number;
  restanteCentavos: number;
  estado: EstadoOrcamento;
}

export interface ResumoDoMes {
  competencia: Competencia;
  ehMesPassado: boolean;
  receitaRealizada: number;
  receitaPrevista: number;
  receitaConsiderada: number;
  despesaLiquida: number;
  sobraRealizada: number;
  sobraProjetada: number;
  faixas: {
    gastoCentavos: number;
    comprometidoCentavos: number;
    livreCentavos: number;
  };
  cards: CardDoPainel[];
}

function validarCompetencia(c: Competencia): void {
  if (!/^\d{4}-\d{2}$/.test(c)) {
    throw new Error(`Competência inválida, esperado "YYYY-MM": ${c}`);
  }
}

/**
 * Resumo do mês para o painel. Busca as linhas e entrega ao domínio — nenhuma
 * aritmética de dinheiro acontece neste arquivo.
 */
export async function resumoDoMes(
  mes: Competencia,
  cliente: ClientePrisma = prisma,
): Promise<ResumoDoMes> {
  validarCompetencia(mes);

  // "YYYY-MM" compara lexicograficamente na mesma ordem que cronologicamente.
  const mesCorrente = competenciaDe(dataCivilEm(new Date()));
  const ehMesPassado = mes < mesCorrente;

  const [orcamentos, realizada, prevista, transacoes, creditos] = await Promise.all([
    orcamentosDoMes(mes, cliente),
    receitaRealizadaDoMes(mes, cliente),
    receitaPrevistaDoMes(mes, cliente),
    cliente.transaction.findMany({
      where: { competencia: mes, tipo: 'DESPESA' },
      select: {
        competencia: true,
        budgetCategoryId: true,
        valorCentavos: true,
        status: true,
      },
    }),
    cliente.credito.findMany({
      where: { competenciaCredito: mes },
      select: {
        competenciaCredito: true,
        valorCentavos: true,
        transaction: { select: { budgetCategoryId: true } },
      },
    }),
  ]);

  const despesas: DespesaAgregavel[] = transacoes.map((t) => ({
    competencia: t.competencia,
    categoriaId: t.budgetCategoryId ?? '',
    valorCentavos: t.valorCentavos,
    cancelada: t.status === 'CANCELADA',
  }));

  const creditosAgregaveis: CreditoAgregavel[] = creditos.map((c) => ({
    competenciaCredito: c.competenciaCredito,
    categoriaId: c.transaction.budgetCategoryId ?? '',
    valorCentavos: c.valorCentavos,
  }));

  const gastos = gastoPorCategoria(despesas, creditosAgregaveis, mes);

  const doPainel: OrcamentoDoPainel[] = orcamentos.map((o) => ({
    categoriaId: o.categoriaId,
    nome: o.nome,
    corSlot: o.corSlot,
    orcadoCentavos: o.valorCentavos,
    gastoCentavos: gastos.get(o.categoriaId) ?? 0,
  }));

  const considerada = receitaConsiderada(prevista, realizada, ehMesPassado);
  const liquida = despesaLiquida(despesas, creditosAgregaveis, mes);

  const orcamentosParaFormula = new Map(
    doPainel.map((o) => [o.categoriaId, o.orcadoCentavos]),
  );

  return {
    competencia: mes,
    ehMesPassado,
    receitaRealizada: realizada,
    receitaPrevista: prevista,
    receitaConsiderada: considerada,
    despesaLiquida: liquida,
    sobraRealizada: sobraRealizada(realizada, liquida),
    sobraProjetada: sobraProjetada(considerada, orcamentosParaFormula, gastos),
    faixas: faixasDoHeroi(considerada, doPainel),
    cards: ordenarPorCriticidade(doPainel).map((o) => ({
      categoriaId: o.categoriaId,
      nome: o.nome,
      corSlot: o.corSlot,
      orcadoCentavos: o.orcadoCentavos,
      gastoCentavos: o.gastoCentavos,
      restanteCentavos: restanteDoOrcamento(o),
      estado: estadoDoOrcamento(o),
    })),
  };
}
