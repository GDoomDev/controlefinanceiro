/**
 * Vigência de uma despesa fixa (spec, seção 13): materializada sob demanda,
 * mês a mês, enquanto a recorrência estiver ativa e dentro da janela
 * início/fim. Esta é a única decisão de negócio do recurso — o resto é
 * busca e gravação.
 */

import type { Competencia } from './data';

export interface VigenciaDaRecorrencia {
  ativa: boolean;
  /** "YYYY-MM" — primeiro mês em que a despesa vale. */
  inicio: Competencia;
  /** "YYYY-MM" — último mês em que a despesa vale, inclusive. `null` = sem fim marcado. */
  fim: Competencia | null;
}

/** "YYYY-MM" compara lexicograficamente na mesma ordem que cronologicamente. */
export function vigenteNoMes(r: VigenciaDaRecorrencia, mes: Competencia): boolean {
  if (!r.ativa) return false;
  if (mes < r.inicio) return false;
  if (r.fim !== null && mes > r.fim) return false;
  return true;
}
