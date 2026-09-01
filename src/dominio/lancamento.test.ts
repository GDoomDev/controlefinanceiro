import { describe, expect, it } from 'vitest';
import { type EntradaLancamento, planejarLancamento } from './lancamento';

const FECHA_25_VENCE_5 = { diaFechamento: 25, diaVencimento: 5 };

const entrada = (over: Partial<EntradaLancamento> = {}): EntradaLancamento => ({
  valorCentavos: 20000,
  data: { ano: 2026, mes: 8, dia: 20 },
  metodo: 'PIX',
  parcelas: 1,
  ...over,
});

describe('planejarLancamento — métodos à vista', () => {
  it('pix cai no mês da própria data, sem fatura', () => {
    const plano = planejarLancamento(entrada({ metodo: 'PIX' }), null);
    expect(plano).toEqual([
      {
        parcelaNum: 1,
        parcelaTotal: 1,
        valorCentavos: 20000,
        competencia: '2026-08',
        fatura: null,
      },
    ]);
  });

  it('débito, dinheiro e boleto seguem a mesma regra do pix', () => {
    for (const metodo of ['DEBITO', 'DINHEIRO', 'BOLETO'] as const) {
      const plano = planejarLancamento(entrada({ metodo }), null);
      expect(plano).toHaveLength(1);
      expect(plano[0].competencia).toBe('2026-08');
      expect(plano[0].fatura).toBeNull();
    }
  });

  it('ignora a regra do cartão quando o método não é crédito', () => {
    const plano = planejarLancamento(entrada({ metodo: 'PIX' }), FECHA_25_VENCE_5);
    expect(plano[0].competencia).toBe('2026-08');
    expect(plano[0].fatura).toBeNull();
  });
});

describe('planejarLancamento — crédito', () => {
  it('à vista no crédito usa a competência da fatura, não a da compra', () => {
    const plano = planejarLancamento(
      entrada({ metodo: 'CREDITO' }),
      FECHA_25_VENCE_5,
    );
    expect(plano).toHaveLength(1);
    // Compra em 20/ago, fatura fecha 25/ago e vence 05/set.
    expect(plano[0].competencia).toBe('2026-09');
    expect(plano[0].fatura?.vencimento).toEqual({ ano: 2026, mes: 9, dia: 5 });
  });

  it('distribui as parcelas em competências consecutivas', () => {
    const plano = planejarLancamento(
      entrada({ metodo: 'CREDITO', valorCentavos: 200000, parcelas: 10 }),
      FECHA_25_VENCE_5,
    );
    expect(plano.map((p) => p.competencia)).toEqual([
      '2026-09', '2026-10', '2026-11', '2026-12',
      '2027-01', '2027-02', '2027-03', '2027-04',
      '2027-05', '2027-06',
    ]);
  });

  it('numera as parcelas de 1 a N', () => {
    const plano = planejarLancamento(
      entrada({ metodo: 'CREDITO', valorCentavos: 200000, parcelas: 10 }),
      FECHA_25_VENCE_5,
    );
    expect(plano.map((p) => p.parcelaNum)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(plano.every((p) => p.parcelaTotal === 10)).toBe(true);
  });

  it('as parcelas somam exatamente o valor total', () => {
    const plano = planejarLancamento(
      entrada({ metodo: 'CREDITO', valorCentavos: 10005, parcelas: 10 }),
      FECHA_25_VENCE_5,
    );
    const soma = plano.reduce((a, p) => a + p.valorCentavos, 0);
    expect(soma).toBe(10005);
    // O resto de centavos vai para a primeira parcela.
    expect(plano[0].valorCentavos).toBe(1005);
    expect(plano[1].valorCentavos).toBe(1000);
  });

  it('cada parcela carrega a fatura da sua própria competência', () => {
    const plano = planejarLancamento(
      entrada({ metodo: 'CREDITO', valorCentavos: 60000, parcelas: 3 }),
      FECHA_25_VENCE_5,
    );
    expect(plano[0].fatura?.competencia).toBe('2026-09');
    expect(plano[2].fatura?.competencia).toBe('2026-11');
    expect(plano[2].fatura?.vencimento).toEqual({ ano: 2026, mes: 11, dia: 5 });
  });
});

describe('planejarLancamento — validação', () => {
  it('rejeita crédito sem regra de cartão', () => {
    expect(() => planejarLancamento(entrada({ metodo: 'CREDITO' }), null)).toThrow();
  });

  it('rejeita parcelamento fora do crédito', () => {
    expect(() =>
      planejarLancamento(entrada({ metodo: 'PIX', parcelas: 3 }), null),
    ).toThrow();
  });

  it('rejeita quantidade de parcelas menor que 1', () => {
    expect(() =>
      planejarLancamento(
        entrada({ metodo: 'CREDITO', parcelas: 0 }),
        FECHA_25_VENCE_5,
      ),
    ).toThrow();
  });

  it('rejeita valor negativo', () => {
    expect(() =>
      planejarLancamento(entrada({ valorCentavos: -100 }), null),
    ).toThrow();
  });
});
