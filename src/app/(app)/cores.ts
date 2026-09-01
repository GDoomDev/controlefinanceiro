/**
 * Paleta do spec, seção 9 — validada para daltonismo nos dois temas.
 *
 * Seis slots, atribuídos por ENTIDADE (`BudgetCategory.corSlot`), nunca por
 * posição num ranking: filtrar não pode repintar as categorias remanescentes.
 * O que passa de seis cai em cinza.
 *
 * Três destes slots ficam abaixo de 3:1 de contraste no tema claro, o que
 * obriga rótulo textual visível em toda marca colorida.
 */
export const CORES: string[] = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
];

/** Cor do que não recebe cor própria: "Outras". */
export const CINZA = '#9ca3af';

/**
 * `null` é o balde "Outras". Slot fora de 1..6 também cai em cinza — o banco
 * garante a faixa, mas a tela não deve quebrar se algum dia não garantir.
 *
 * A checagem de faixa é explícita em vez de `?? CINZA` porque, sem
 * `noUncheckedIndexedAccess`, o TypeScript considera o índice sempre definido
 * e o `??` viraria código morto que ninguém percebe.
 */
export function corDoSlot(slot: number | null): string {
  if (slot === null || slot < 1 || slot > CORES.length) return CINZA;
  return CORES[slot - 1];
}
