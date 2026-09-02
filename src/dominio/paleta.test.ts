import { describe, expect, it } from 'vitest';

import { CORES, corDaCategoria, corDoSlot, hexValido, slotDisponivel } from './paleta';

describe('corDoSlot', () => {
  it('devolve a cor do slot pedido', () => {
    expect(corDoSlot(1)).toBe(CORES[0]);
    expect(corDoSlot(6)).toBe(CORES[5]);
  });

  it('cai em cinza para null ou fora de 1..6', () => {
    expect(corDoSlot(null)).toBe('#9ca3af');
    expect(corDoSlot(0)).toBe('#9ca3af');
    expect(corDoSlot(7)).toBe('#9ca3af');
  });
});

describe('hexValido', () => {
  it('aceita #rrggbb maiúsculo ou minúsculo', () => {
    expect(hexValido('#2a78d6')).toBe(true);
    expect(hexValido('#2A78D6')).toBe(true);
  });

  it('rejeita formato errado', () => {
    expect(hexValido('2a78d6')).toBe(false);
    expect(hexValido('#2a78')).toBe(false);
    expect(hexValido('#2a78d6ff')).toBe(false);
    expect(hexValido('#gggggg')).toBe(false);
    expect(hexValido('')).toBe(false);
  });
});

describe('corDaCategoria', () => {
  it('usa corPersonalizada quando presente, ignorando corSlot', () => {
    expect(corDaCategoria({ corSlot: 2, corPersonalizada: '#123456' })).toBe('#123456');
  });

  it('cai para corDoSlot quando corPersonalizada é nulo', () => {
    expect(corDaCategoria({ corSlot: 3, corPersonalizada: null })).toBe(CORES[2]);
  });

  it('cai para corDoSlot quando corPersonalizada é omitido', () => {
    expect(corDaCategoria({ corSlot: 3 })).toBe(CORES[2]);
  });

  it('cai em cinza quando não há slot nem personalizada', () => {
    expect(corDaCategoria({ corSlot: null, corPersonalizada: null })).toBe('#9ca3af');
  });
});

describe('slotDisponivel', () => {
  it('está livre quando nenhum ocupante usa o slot', () => {
    expect(slotDisponivel([1, 3, 5], 2)).toBe(true);
  });

  it('está ocupado quando algum ocupante usa o slot', () => {
    expect(slotDisponivel([1, 2, 3], 2)).toBe(false);
  });

  it('lista vazia deixa todo slot livre', () => {
    expect(slotDisponivel([], 1)).toBe(true);
  });
});
