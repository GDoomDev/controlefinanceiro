/**
 * Regras da tela de Áreas (spec, seção 8.2).
 *
 * Duas camadas sobre o gasto do mês: a composição por orçamento (barra 100%
 * empilhada) e o ranking de subcategorias. Quem decide o que entra na barra,
 * em que ordem, e o que colapsa em "Outras" é este módulo — a tela só desenha.
 *
 * Sobre percentuais: são os únicos números em ponto flutuante daqui, e existem
 * só para desenhar largura de barra e escrever rótulo. Nenhuma ordenação e
 * nenhum limiar usa percentual — comparação é sempre inteira, em centavos.
 */

import type { Centavos } from './dinheiro';

/** Spec, seção 9: só seis orçamentos recebem cor própria. */
export const MAXIMO_SEGMENTOS_COLORIDOS = 6;

/** Spec, seção 8.2: "As 10 maiores aparecem; o resto colapsa em 'Outras N'". */
export const MAXIMO_LINHAS_DO_RANKING = 10;

/** Divisão só para desenho, com guarda. Nunca usada para ordenar ou decidir. */
function percentual(parte: Centavos, total: Centavos): number {
  if (total <= 0) return 0;
  return (parte / total) * 100;
}

export interface GastoDeOrcamento {
  categoriaId: string;
  nome: string;
  corSlot: number | null;
  corPersonalizada?: string | null;
  /** Líquido do mês. Pode ser negativo depois de um estorno. */
  gastoCentavos: Centavos;
}

export interface SegmentoDaComposicao {
  /** Vazio no segmento "Outras", que não é uma categoria. */
  categoriaId: string;
  nome: string;
  /** `null` marca o segmento cinza "Outras". */
  corSlot: number | null;
  corPersonalizada?: string | null;
  gastoCentavos: Centavos;
  percentual: number;
}

export interface Composicao {
  /** Soma só dos gastos positivos — é o 100% da barra. */
  totalCentavos: Centavos;
  segmentos: SegmentoDaComposicao[];
  /**
   * Categorias com gasto líquido <= 0, que não podem ocupar fatia de uma barra
   * de 100%. Não somem da tela: aparecem à parte, com o valor negativo visível.
   */
  creditados: GastoDeOrcamento[];
}

export function composicaoPorOrcamento(gastos: GastoDeOrcamento[]): Composicao {
  const positivos = gastos.filter((g) => g.gastoCentavos > 0);
  const creditados = gastos.filter((g) => g.gastoCentavos <= 0);

  // Ordenação inteira, em centavos. Desempate por nome para ficar determinística.
  const ordenados = [...positivos].sort(
    (a, b) => b.gastoCentavos - a.gastoCentavos || a.nome.localeCompare(b.nome),
  );

  const totalCentavos = ordenados.reduce((soma, g) => soma + g.gastoCentavos, 0);

  const coloridos = ordenados.slice(0, MAXIMO_SEGMENTOS_COLORIDOS);
  const excedentes = ordenados.slice(MAXIMO_SEGMENTOS_COLORIDOS);

  const segmentos: SegmentoDaComposicao[] = coloridos.map((g) => ({
    categoriaId: g.categoriaId,
    nome: g.nome,
    corSlot: g.corSlot,
    corPersonalizada: g.corPersonalizada,
    gastoCentavos: g.gastoCentavos,
    percentual: percentual(g.gastoCentavos, totalCentavos),
  }));

  if (excedentes.length > 0) {
    const soma = excedentes.reduce((s, g) => s + g.gastoCentavos, 0);
    segmentos.push({
      categoriaId: '',
      nome: `Outras ${excedentes.length}`,
      corSlot: null,
      corPersonalizada: null,
      gastoCentavos: soma,
      percentual: percentual(soma, totalCentavos),
    });
  }

  return { totalCentavos, segmentos, creditados };
}

export interface EntradaDoRanking {
  subcategoriaId: string;
  nome: string;
  categoriaId: string;
  nomeDoOrcamento: string;
  /** Herdado do orçamento-pai — o spec (seção 9) proíbe cor nova para subcategoria. */
  corSlot: number | null;
  corPersonalizada?: string | null;
  gastoCentavos: Centavos;
  quantidade: number;
  maiorLancamentoCentavos: Centavos;
}

export interface LinhaDoRanking extends EntradaDoRanking {
  percentualDoMes: number;
  percentualDoOrcamento: number;
}

export interface Outras {
  quantidade: number;
  gastoCentavos: Centavos;
  percentualDoMes: number;
}

export interface Ranking {
  linhas: LinhaDoRanking[];
  /** `null` quando cabe tudo nas dez primeiras. */
  outras: Outras | null;
}

/**
 * As dez maiores subcategorias, e o resto somado em "Outras N".
 *
 * Subcategoria com gasto negativo NÃO é filtrada: a ordenação decrescente já a
 * joga para o fim, e a tela desenha barra de largura zero com o valor negativo
 * escrito. Filtrar sumiria com dinheiro real.
 */
export function rankearSubcategorias(
  entradas: EntradaDoRanking[],
  totalDoMes: Centavos,
  gastoPorOrcamento: Map<string, Centavos>,
): Ranking {
  const ordenadas = [...entradas].sort(
    (a, b) => b.gastoCentavos - a.gastoCentavos || a.nome.localeCompare(b.nome),
  );

  const linhas: LinhaDoRanking[] = ordenadas
    .slice(0, MAXIMO_LINHAS_DO_RANKING)
    .map((e) => ({
      ...e,
      percentualDoMes: percentual(e.gastoCentavos, totalDoMes),
      percentualDoOrcamento: percentual(
        e.gastoCentavos,
        gastoPorOrcamento.get(e.categoriaId) ?? 0,
      ),
    }));

  const excedentes = ordenadas.slice(MAXIMO_LINHAS_DO_RANKING);
  if (excedentes.length === 0) {
    return { linhas, outras: null };
  }

  const soma = excedentes.reduce((s, e) => s + e.gastoCentavos, 0);
  return {
    linhas,
    outras: {
      quantidade: excedentes.length,
      gastoCentavos: soma,
      percentualDoMes: percentual(soma, totalDoMes),
    },
  };
}
