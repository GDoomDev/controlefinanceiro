/**
 * Regras do painel central (spec, seção 8.1).
 *
 * Não é apresentação: em que estado um orçamento está, em que ordem os cards
 * aparecem, e como a barra do herói se divide são decisões de negócio. A
 * interface só desenha o que este módulo decide.
 */

import type { Centavos } from './dinheiro';

export interface OrcamentoDoPainel {
  categoriaId: string;
  nome: string;
  corSlot: number;
  orcadoCentavos: Centavos;
  gastoCentavos: Centavos;
}

export type EstadoOrcamento = 'ESTOURADO' | 'ATIVO' | 'CONCLUIDO';

export function estadoDoOrcamento(o: OrcamentoDoPainel): EstadoOrcamento {
  if (o.gastoCentavos > o.orcadoCentavos) return 'ESTOURADO';
  if (o.gastoCentavos < o.orcadoCentavos) return 'ATIVO';
  return 'CONCLUIDO';
}

/** O que ainda cabe no orçamento. Negativo quando estourou. */
export function restanteDoOrcamento(o: OrcamentoDoPainel): Centavos {
  return o.orcadoCentavos - o.gastoCentavos;
}

const PESO_DO_ESTADO: Record<EstadoOrcamento, number> = {
  ESTOURADO: 0,
  ATIVO: 1,
  CONCLUIDO: 2,
};

/**
 * Estourados primeiro (maior excesso na frente), depois os ativos por
 * percentual consumido decrescente, e por último os concluídos — sobre os
 * quais não há mais nenhuma decisão a tomar.
 *
 * Devolve um array novo; não modifica o recebido.
 */
export function ordenarPorCriticidade(
  orcamentos: OrcamentoDoPainel[],
): OrcamentoDoPainel[] {
  return [...orcamentos].sort((a, b) => {
    const estadoA = estadoDoOrcamento(a);
    const estadoB = estadoDoOrcamento(b);

    if (estadoA !== estadoB) {
      return PESO_DO_ESTADO[estadoA] - PESO_DO_ESTADO[estadoB];
    }

    if (estadoA === 'ESTOURADO') {
      // Maior excesso primeiro.
      return (
        b.gastoCentavos - b.orcadoCentavos - (a.gastoCentavos - a.orcadoCentavos)
      );
    }

    if (estadoA === 'ATIVO') {
      // Maior percentual consumido primeiro. Dentro de ATIVO o orçado é sempre
      // maior que o gasto, logo maior que zero — não há divisão por zero aqui.
      return b.gastoCentavos / b.orcadoCentavos - a.gastoCentavos / a.orcadoCentavos;
    }

    // Concluídos: maior orçamento primeiro, só para dar uma ordem estável.
    return b.orcadoCentavos - a.orcadoCentavos;
  });
}

export interface FaixasDoHeroi {
  /** O que já saiu. */
  gastoCentavos: Centavos;
  /** O que ainda está reservado dentro dos orçamentos. */
  comprometidoCentavos: Centavos;
  /** O que sobra depois de honrar todos os orçamentos. Pode ser negativo. */
  livreCentavos: Centavos;
}

/**
 * Divide a receita considerada nas três faixas da barra do herói.
 *
 * As três somam exatamente a receita — é essa invariante que torna a barra
 * legível como uma linha só. `comprometido` usa o mesmo máx(orçado, gasto) da
 * fórmula da sobra (spec, seção 7), então nunca conta uma parcela duas vezes.
 */
export function faixasDoHeroi(
  receitaConsiderada: Centavos,
  orcamentos: OrcamentoDoPainel[],
): FaixasDoHeroi {
  let gastoCentavos = 0;
  let reservado = 0;

  for (const o of orcamentos) {
    gastoCentavos += o.gastoCentavos;
    reservado += Math.max(o.orcadoCentavos, o.gastoCentavos);
  }

  return {
    gastoCentavos,
    comprometidoCentavos: reservado - gastoCentavos,
    livreCentavos: receitaConsiderada - reservado,
  };
}
