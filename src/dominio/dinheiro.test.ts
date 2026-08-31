import { describe, expect, it } from 'vitest';
import { dividirParcelas, emCentavos, formatarBRL } from './dinheiro';

describe('emCentavos', () => {
  it('converte reais para centavos inteiros', () => {
    expect(emCentavos(20)).toBe(2000);
    expect(emCentavos(20.5)).toBe(2050);
    expect(emCentavos(100.05)).toBe(10005);
  });

  it('arredonda o terceiro decimal em vez de truncar', () => {
    // 0.1 + 0.2 = 0.30000000000000004 em ponto flutuante.
    expect(emCentavos(0.1 + 0.2)).toBe(30);
  });
});

describe('formatarBRL', () => {
  it('formata com separador de milhar e dois decimais', () => {
    expect(formatarBRL(2000)).toBe('R$ 20,00');
    expect(formatarBRL(10005)).toBe('R$ 100,05');
    expect(formatarBRL(220000)).toBe('R$ 2.200,00');
  });

  it('formata zero e negativo', () => {
    expect(formatarBRL(0)).toBe('R$ 0,00');
    expect(formatarBRL(-12000)).toBe('-R$ 120,00');
  });
});

describe('dividirParcelas', () => {
  it('divide exato quando não há resto', () => {
    expect(dividirParcelas(200000, 10)).toEqual(Array(10).fill(20000));
  });

  it('joga os centavos de resto na primeira parcela', () => {
    const parcelas = dividirParcelas(10005, 10);
    expect(parcelas[0]).toBe(1005);
    expect(parcelas.slice(1)).toEqual(Array(9).fill(1000));
  });

  it('sempre soma exatamente o total', () => {
    for (const total of [10005, 99999, 1, 733, 123457]) {
      for (const n of [2, 3, 7, 10, 12]) {
        const soma = dividirParcelas(total, n).reduce((a, b) => a + b, 0);
        expect(soma).toBe(total);
      }
    }
  });

  it('devolve uma única parcela quando quantidade é 1', () => {
    expect(dividirParcelas(10005, 1)).toEqual([10005]);
  });

  it('rejeita quantidade menor que 1', () => {
    expect(() => dividirParcelas(1000, 0)).toThrow();
  });

  it('rejeita total negativo', () => {
    expect(() => dividirParcelas(-1000, 2)).toThrow();
  });

  it('rejeita total não inteiro', () => {
    expect(() => dividirParcelas(100.5, 2)).toThrow();
  });
});
