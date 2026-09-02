import { describe, expect, it } from 'vitest';

import { type VigenciaDaRecorrencia, vigenteNoMes } from './recorrencia';

function recorrencia(overrides: Partial<VigenciaDaRecorrencia> = {}): VigenciaDaRecorrencia {
  return { ativa: true, inicio: '2026-01', fim: null, ...overrides };
}

describe('vigenteNoMes', () => {
  it('vale no mês do início', () => {
    expect(vigenteNoMes(recorrencia({ inicio: '2026-05' }), '2026-05')).toBe(true);
  });

  it('não vale antes do início', () => {
    expect(vigenteNoMes(recorrencia({ inicio: '2026-05' }), '2026-04')).toBe(false);
  });

  it('vale em qualquer mês depois do início quando não há fim', () => {
    expect(vigenteNoMes(recorrencia({ inicio: '2026-05', fim: null }), '2030-01')).toBe(true);
  });

  it('vale exatamente no mês do fim', () => {
    expect(
      vigenteNoMes(recorrencia({ inicio: '2026-01', fim: '2026-06' }), '2026-06'),
    ).toBe(true);
  });

  it('não vale depois do fim', () => {
    expect(
      vigenteNoMes(recorrencia({ inicio: '2026-01', fim: '2026-06' }), '2026-07'),
    ).toBe(false);
  });

  it('não vale quando está pausada, mesmo dentro da janela início/fim', () => {
    expect(
      vigenteNoMes(recorrencia({ ativa: false, inicio: '2026-01', fim: '2026-12' }), '2026-06'),
    ).toBe(false);
  });

  it('atravessa a virada de ano corretamente', () => {
    expect(
      vigenteNoMes(recorrencia({ inicio: '2026-11', fim: '2027-02' }), '2027-01'),
    ).toBe(true);
    expect(
      vigenteNoMes(recorrencia({ inicio: '2026-11', fim: '2027-02' }), '2027-03'),
    ).toBe(false);
  });
});
