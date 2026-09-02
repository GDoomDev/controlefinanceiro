/**
 * Paleta do spec, seção 9 — validada para daltonismo nos dois temas.
 *
 * Seis slots, atribuídos por ENTIDADE (`BudgetCategory.corSlot`), nunca por
 * posição num ranking: filtrar não pode repintar as categorias remanescentes.
 * O que passa de seis cai em cinza.
 *
 * Três destes slots ficam abaixo de 3:1 de contraste no tema claro, o que
 * obriga rótulo textual visível em toda marca colorida.
 *
 * Cor personalizada (v2): uma categoria pode trocar o slot validado por
 * qualquer hex escolhido livremente. Essa cor não passa pela validação de
 * daltonismo do script — a garantia que resta é a mesma que já vale para toda
 * cor deste app: o nome da categoria sempre aparece em texto ao lado dela.
 */

export const CORES: string[] = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
];

/** Cor do que não recebe cor própria: "Outras", ou uma categoria sem cor definida. */
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

/** "#rrggbb", maiúsculo ou minúsculo — o formato que `<input type="color">` sempre produz. */
export function hexValido(valor: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(valor);
}

export interface CategoriaComCor {
  corSlot: number | null;
  corPersonalizada?: string | null;
}

/**
 * A cor final de uma categoria: personalizada tem prioridade sobre o slot.
 * `criarCategoria` (src/dados/categorias.ts) garante que uma categoria nunca
 * tem as duas coisas ao mesmo tempo, mas se algum dado legado tivesse,
 * personalizada vence — é a intenção mais recente do usuário.
 */
export function corDaCategoria(categoria: CategoriaComCor): string {
  return categoria.corPersonalizada ?? corDoSlot(categoria.corSlot);
}

/** Um slot está livre quando nenhuma categoria ativa (sem cor personalizada) já o usa. */
export function slotDisponivel(ocupados: number[], slot: number): boolean {
  return !ocupados.includes(slot);
}
