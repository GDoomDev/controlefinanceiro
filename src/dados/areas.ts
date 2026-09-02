import {
  type CreditoAgregavel,
  type DespesaAgregavel,
  estatisticasPorSubcategoria,
  gastoPorCategoria,
} from '@/dominio/agregacao';
import {
  type Composicao,
  type EntradaDoRanking,
  type GastoDeOrcamento,
  type Ranking,
  composicaoPorOrcamento,
  rankearSubcategorias,
} from '@/dominio/areas';
import type { Competencia } from '@/dominio/data';

import { prisma } from './prisma';
import type { ClientePrisma } from './tipos';

export interface AreasDoMes {
  competencia: Competencia;
  /** O 100% da barra: soma dos gastos positivos por categoria. */
  totalCentavos: number;
  composicao: Composicao;
  ranking: Ranking;
  filtro: { categoriaId: string; nome: string } | null;
}

function validarCompetencia(c: Competencia): void {
  if (!/^\d{4}-\d{2}$/.test(c)) {
    throw new Error(`Competência inválida, esperado "YYYY-MM": ${c}`);
  }
}

/**
 * As duas camadas da tela de Áreas. Busca as linhas e entrega ao domínio —
 * nenhuma aritmética de dinheiro acontece neste arquivo.
 *
 * `categoriaId` restringe apenas o ranking: a composição continua inteira,
 * porque é ela que oferece o próximo clique.
 */
export async function areasDoMes(
  mes: Competencia,
  categoriaId: string | null,
  cliente: ClientePrisma = prisma,
): Promise<AreasDoMes> {
  validarCompetencia(mes);

  const [transacoes, creditos, categorias, subcategorias] = await Promise.all([
    cliente.transaction.findMany({
      where: { competencia: mes, tipo: 'DESPESA' },
      select: {
        competencia: true,
        budgetCategoryId: true,
        subcategoryId: true,
        valorCentavos: true,
        status: true,
      },
    }),
    cliente.credito.findMany({
      // Um crédito cuja transação-pai virou CANCELADA (estorno de uma despesa
      // que já tinha reembolso recebido) não pode continuar reduzindo o mês —
      // a despesa já some da agregação (`cancelada`), então o crédito também
      // tem de sumir junto (spec, seção 13: nenhuma agregação inclui CANCELADA).
      where: { competenciaCredito: mes, transaction: { status: 'ATIVA' } },
      select: {
        competenciaCredito: true,
        valorCentavos: true,
        transaction: { select: { budgetCategoryId: true, subcategoryId: true } },
      },
    }),
    // Sem filtro de `arquivada`: uma categoria arquivada que ainda teve gasto
    // no mês precisa de nome e cor (spec, seção 7).
    cliente.budgetCategory.findMany({
      select: { id: true, nome: true, corSlot: true },
    }),
    cliente.subcategory.findMany({
      select: { id: true, nome: true, budgetCategoryId: true },
    }),
  ]);

  const despesas: DespesaAgregavel[] = transacoes.map((t) => ({
    competencia: t.competencia,
    categoriaId: t.budgetCategoryId ?? '',
    subcategoriaId: t.subcategoryId ?? undefined,
    valorCentavos: t.valorCentavos,
    cancelada: t.status === 'CANCELADA',
  }));

  const creditosAgregaveis: CreditoAgregavel[] = creditos.map((c) => ({
    competenciaCredito: c.competenciaCredito,
    categoriaId: c.transaction.budgetCategoryId ?? '',
    subcategoriaId: c.transaction.subcategoryId ?? undefined,
    valorCentavos: c.valorCentavos,
  }));

  const porCategoria = gastoPorCategoria(despesas, creditosAgregaveis, mes);
  const porSubcategoria = estatisticasPorSubcategoria(despesas, creditosAgregaveis, mes);

  const nomeDaCategoria = new Map(categorias.map((c) => [c.id, c]));

  const gastos: GastoDeOrcamento[] = [];
  for (const [id, gastoCentavos] of porCategoria) {
    const categoria = nomeDaCategoria.get(id);
    if (!categoria) continue;
    gastos.push({
      categoriaId: id,
      nome: categoria.nome,
      corSlot: categoria.corSlot,
      gastoCentavos,
    });
  }

  const composicao = composicaoPorOrcamento(gastos);

  const entradas: EntradaDoRanking[] = [];
  for (const sub of subcategorias) {
    const stats = porSubcategoria.get(sub.id);
    if (!stats) continue;
    if (categoriaId && sub.budgetCategoryId !== categoriaId) continue;

    const pai = nomeDaCategoria.get(sub.budgetCategoryId);
    if (!pai) continue;

    entradas.push({
      subcategoriaId: sub.id,
      nome: sub.nome,
      categoriaId: sub.budgetCategoryId,
      nomeDoOrcamento: pai.nome,
      corSlot: pai.corSlot,
      gastoCentavos: stats.gastoCentavos,
      quantidade: stats.quantidade,
      maiorLancamentoCentavos: stats.maiorLancamentoCentavos,
    });
  }

  const filtrada = categoriaId ? nomeDaCategoria.get(categoriaId) : undefined;

  return {
    competencia: mes,
    totalCentavos: composicao.totalCentavos,
    composicao,
    // O denominador é sempre o mês inteiro, mesmo com filtro ativo: o spec
    // (seção 8.2) define o número principal como "o peso da subcategoria no
    // total do mês".
    ranking: rankearSubcategorias(entradas, composicao.totalCentavos, porCategoria),
    filtro: filtrada ? { categoriaId: filtrada.id, nome: filtrada.nome } : null,
  };
}
