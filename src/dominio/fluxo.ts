/**
 * Regras da tela de Fluxo (spec, seção 8.3).
 *
 * A janela de meses, o que cada mês é em relação a hoje, e o tamanho de cada
 * coluna. A direção da coluna (acima ou abaixo da linha do zero) é decisão de
 * desenho e fica na tela; o tamanho é decisão de dado e fica aqui.
 */

import { type Competencia, somarMeses } from './data';
import type { Centavos } from './dinheiro';

/** Spec, seção 8.3: "Seis meses para trás e seis para frente". */
export const MESES_PARA_TRAS = 6;
export const MESES_PARA_FRENTE = 6;

export type MomentoDoMes = 'PASSADO' | 'CORRENTE' | 'FUTURO';

export interface PontoDoFluxo {
  competencia: Competencia;
  momento: MomentoDoMes;
  /** Realizada num mês passado, considerada no corrente e nos futuros. */
  receitaCentavos: Centavos;
  /** Sempre `receitaCentavos - sobraCentavos`, para a tabela fechar. */
  despesaCentavos: Centavos;
  /** Realizada num mês passado, projetada no corrente e nos futuros. */
  sobraCentavos: Centavos;
}

export function janelaDeMeses(central: Competencia): Competencia[] {
  const meses: Competencia[] = [];
  for (let n = -MESES_PARA_TRAS; n <= MESES_PARA_FRENTE; n += 1) {
    meses.push(somarMeses(central, n));
  }
  return meses;
}

/** "YYYY-MM" compara lexicograficamente na mesma ordem que cronologicamente. */
export function momentoDoMes(
  mes: Competencia,
  mesCorrente: Competencia,
): MomentoDoMes {
  if (mes < mesCorrente) return 'PASSADO';
  if (mes > mesCorrente) return 'FUTURO';
  return 'CORRENTE';
}

/**
 * O maior módulo de sobra da janela — é o que define 100% de altura. O piso de
 * 1 existe só para que uma janela toda zerada não vire divisão por zero.
 */
export function escalaDoFluxo(pontos: PontoDoFluxo[]): Centavos {
  let maior = 0;
  for (const p of pontos) {
    maior = Math.max(maior, Math.abs(p.sobraCentavos));
  }
  return maior > 0 ? maior : 1;
}

/** Altura da coluna em 0..100. Só desenho: nunca ordena nem decide nada. */
export function alturaDaColuna(valor: Centavos, escala: Centavos): number {
  if (escala <= 0) return 0;
  return Math.min(100, (Math.abs(valor) / escala) * 100);
}
