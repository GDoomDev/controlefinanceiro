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
  type PontoDoFluxo,
  escalaDoFluxo,
  janelaDeMeses,
  momentoDoMes,
} from '@/dominio/fluxo';
import { alocacaoVigente } from '@/dominio/orcamento';

import { prisma } from './prisma';
import type { ClientePrisma } from './tipos';

export interface FluxoDeMeses {
  central: Competencia;
  escalaCentavos: number;
  pontos: PontoDoFluxo[];
}

function validarCompetencia(c: Competencia): void {
  if (!/^\d{4}-\d{2}$/.test(c)) {
    throw new Error(`Competência inválida, esperado "YYYY-MM": ${c}`);
  }
}

function somar<T>(linhas: T[], valor: (linha: T) => number): number {
  return linhas.reduce((total, linha) => total + valor(linha), 0);
}

/**
 * Treze meses de sobra, em cinco consultas.
 *
 * Chamar `resumoDoMes` treze vezes daria sessenta e cinco consultas para uma
 * tela só; aqui a janela inteira é buscada de uma vez e agrupada em memória.
 * O cálculo é o mesmo — as funções de domínio são as mesmas — e os testes de
 * equivalência com `resumoDoMes` existem justamente para garantir que os dois
 * caminhos nunca divirjam.
 */
export async function fluxoDeMeses(
  central: Competencia,
  cliente: ClientePrisma = prisma,
): Promise<FluxoDeMeses> {
  validarCompetencia(central);

  const meses = janelaDeMeses(central);
  const mesCorrente = competenciaDe(dataCivilEm(new Date()));

  const [transacoes, creditos, receitas, previstas, categorias] = await Promise.all([
    cliente.transaction.findMany({
      where: { competencia: { in: meses }, tipo: 'DESPESA' },
      select: {
        competencia: true,
        budgetCategoryId: true,
        valorCentavos: true,
        status: true,
      },
    }),
    cliente.credito.findMany({
      where: { competenciaCredito: { in: meses } },
      select: {
        competenciaCredito: true,
        valorCentavos: true,
        transaction: { select: { budgetCategoryId: true } },
      },
    }),
    cliente.transaction.findMany({
      where: { competencia: { in: meses }, tipo: 'RECEITA', status: 'ATIVA' },
      select: { competencia: true, valorCentavos: true },
    }),
    cliente.expectedIncome.findMany({
      where: { competencia: { in: meses } },
      select: { competencia: true, valorCentavos: true },
    }),
    // A união com as categorias arquivadas que ainda têm gasto acontece dentro
    // de `sobraProjetada`, que percorre as chaves dos dois mapas (spec, seção 7).
    cliente.budgetCategory.findMany({
      where: { arquivada: false },
      select: {
        id: true,
        alocacoes: { select: { vigenteDe: true, valorCentavos: true } },
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

  const pontos: PontoDoFluxo[] = meses.map((mes) => {
    const momento = momentoDoMes(mes, mesCorrente);
    const ehMesPassado = momento === 'PASSADO';

    const gastos = gastoPorCategoria(despesas, creditosAgregaveis, mes);
    const liquida = despesaLiquida(despesas, creditosAgregaveis, mes);

    const realizada = somar(
      receitas.filter((r) => r.competencia === mes),
      (r) => r.valorCentavos,
    );
    const prevista = somar(
      previstas.filter((p) => p.competencia === mes),
      (p) => p.valorCentavos,
    );

    const orcamentos = new Map(
      categorias.map((c) => [c.id, alocacaoVigente(c.alocacoes, mes)]),
    );

    const considerada = receitaConsiderada(prevista, realizada, ehMesPassado);

    const receitaCentavos = ehMesPassado ? realizada : considerada;
    const sobraCentavos = ehMesPassado
      ? sobraRealizada(realizada, liquida)
      : sobraProjetada(considerada, orcamentos, gastos);

    return {
      competencia: mes,
      momento,
      receitaCentavos,
      // Sempre a diferença, para que receita − despesa = sobra feche em toda
      // linha da tabela. Num mês passado é a despesa líquida; num mês futuro é
      // o comprometido, Σ máx(orçado, gasto).
      despesaCentavos: receitaCentavos - sobraCentavos,
      sobraCentavos,
    };
  });

  return { central, escalaCentavos: escalaDoFluxo(pontos), pontos };
}
