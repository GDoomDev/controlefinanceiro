/**
 * Orçamento versionado por vigência (spec, seção 5).
 *
 * Guardamos uma linha por MUDANÇA, não uma por mês. O valor vigente em um mês é
 * o da última mudança com vigência menor ou igual a ele — é isso que faz alterar
 * dezembro não mexer em outubro.
 */

import type { Competencia } from './data';
import type { Centavos } from './dinheiro';

export interface Alocacao {
  vigenteDe: Competencia;
  valorCentavos: Centavos;
}

/**
 * A competência é `"YYYY-MM"` com mês de dois dígitos, então comparação
 * lexicográfica de string equivale a comparação cronológica.
 */
function vigenteEm(alocacoes: Alocacao[], mes: Competencia): Alocacao | null {
  let escolhida: Alocacao | null = null;
  for (const a of alocacoes) {
    if (a.vigenteDe <= mes && (escolhida === null || a.vigenteDe > escolhida.vigenteDe)) {
      escolhida = a;
    }
  }
  return escolhida;
}

export function alocacaoVigente(alocacoes: Alocacao[], mes: Competencia): Centavos {
  return vigenteEm(alocacoes, mes)?.valorCentavos ?? 0;
}

/** Competência da linha que está valendo — para a interface distinguir herdado de definido. */
export function origemDaAlocacao(
  alocacoes: Alocacao[],
  mes: Competencia,
): Competencia | null {
  return vigenteEm(alocacoes, mes)?.vigenteDe ?? null;
}
