import { describe, expect, it } from 'vitest';
import {
  type CreditoDaFatura,
  type TransacaoDaFatura,
  faturaDaCompetencia,
  faturaDaCompra,
  faturasDasParcelas,
  totalFatura,
} from './fatura';

// Cartão do exemplo do spec: fecha 25, vence 5 (vencimento no mês seguinte).
const FECHA_25_VENCE_5 = { diaFechamento: 25, diaVencimento: 5 };
// Cartão em que o vencimento cai no mesmo mês do fechamento.
const FECHA_5_VENCE_15 = { diaFechamento: 5, diaVencimento: 15 };

describe('faturaDaCompra', () => {
  it('compra antes do fechamento vence no mês seguinte', () => {
    const f = faturaDaCompra({ ano: 2026, mes: 8, dia: 20 }, FECHA_25_VENCE_5);
    expect(f.fechamento).toEqual({ ano: 2026, mes: 8, dia: 25 });
    expect(f.vencimento).toEqual({ ano: 2026, mes: 9, dia: 5 });
    expect(f.competencia).toBe('2026-09');
  });

  it('compra depois do fechamento pula uma fatura', () => {
    const f = faturaDaCompra({ ano: 2026, mes: 8, dia: 28 }, FECHA_25_VENCE_5);
    expect(f.fechamento).toEqual({ ano: 2026, mes: 9, dia: 25 });
    expect(f.vencimento).toEqual({ ano: 2026, mes: 10, dia: 5 });
    expect(f.competencia).toBe('2026-10');
  });

  it('compra exatamente no dia do fechamento entra na fatura que fecha', () => {
    const f = faturaDaCompra({ ano: 2026, mes: 8, dia: 25 }, FECHA_25_VENCE_5);
    expect(f.competencia).toBe('2026-09');
  });

  it('vence no mesmo mês quando o dia de vencimento é maior que o de fechamento', () => {
    const f = faturaDaCompra({ ano: 2026, mes: 8, dia: 3 }, FECHA_5_VENCE_15);
    expect(f.fechamento).toEqual({ ano: 2026, mes: 8, dia: 5 });
    expect(f.vencimento).toEqual({ ano: 2026, mes: 8, dia: 15 });
    expect(f.competencia).toBe('2026-08');
  });

  it('vira o ano corretamente', () => {
    const f = faturaDaCompra({ ano: 2026, mes: 12, dia: 28 }, FECHA_25_VENCE_5);
    expect(f.fechamento).toEqual({ ano: 2027, mes: 1, dia: 25 });
    expect(f.competencia).toBe('2027-02');
  });

  it('encurta o fechamento do dia 31 em fevereiro', () => {
    const regra = { diaFechamento: 31, diaVencimento: 10 };
    const f = faturaDaCompra({ ano: 2026, mes: 2, dia: 27 }, regra);
    expect(f.fechamento).toEqual({ ano: 2026, mes: 2, dia: 28 });
    expect(f.vencimento).toEqual({ ano: 2026, mes: 3, dia: 10 });
    expect(f.competencia).toBe('2026-03');
  });

  it('encurta o vencimento do dia 31 em fevereiro', () => {
    const regra = { diaFechamento: 20, diaVencimento: 31 };
    const f = faturaDaCompra({ ano: 2026, mes: 2, dia: 10 }, regra);
    // 31 > 20, então vence no mesmo mês do fechamento — encurtado para 28.
    expect(f.vencimento).toEqual({ ano: 2026, mes: 2, dia: 28 });
    expect(f.competencia).toBe('2026-02');
  });
});

describe('faturaDaCompetencia', () => {
  it('é o inverso de faturaDaCompra', () => {
    const compra = { ano: 2026, mes: 8, dia: 20 };
    const daCompra = faturaDaCompra(compra, FECHA_25_VENCE_5);
    const daCompetencia = faturaDaCompetencia(daCompra.competencia, FECHA_25_VENCE_5);
    expect(daCompetencia).toEqual(daCompra);
  });

  it('é o inverso também quando o vencimento é no mesmo mês', () => {
    const compra = { ano: 2026, mes: 8, dia: 3 };
    const daCompra = faturaDaCompra(compra, FECHA_5_VENCE_15);
    const daCompetencia = faturaDaCompetencia(daCompra.competencia, FECHA_5_VENCE_15);
    expect(daCompetencia).toEqual(daCompra);
  });
});

describe('faturasDasParcelas', () => {
  it('distribui as parcelas em meses consecutivos', () => {
    const faturas = faturasDasParcelas(
      { ano: 2026, mes: 8, dia: 20 },
      FECHA_25_VENCE_5,
      10,
    );
    expect(faturas).toHaveLength(10);
    expect(faturas.map((f) => f.competencia)).toEqual([
      '2026-09', '2026-10', '2026-11', '2026-12',
      '2027-01', '2027-02', '2027-03', '2027-04',
      '2027-05', '2027-06',
    ]);
  });

  it('mantém fechamento e vencimento coerentes em cada parcela', () => {
    const faturas = faturasDasParcelas(
      { ano: 2026, mes: 12, dia: 28 },
      FECHA_25_VENCE_5,
      3,
    );
    expect(faturas[0].vencimento).toEqual({ ano: 2027, mes: 2, dia: 5 });
    expect(faturas[2].vencimento).toEqual({ ano: 2027, mes: 4, dia: 5 });
  });

  it('à vista devolve uma fatura só', () => {
    const faturas = faturasDasParcelas(
      { ano: 2026, mes: 8, dia: 20 },
      FECHA_25_VENCE_5,
      1,
    );
    expect(faturas).toHaveLength(1);
    expect(faturas[0].competencia).toBe('2026-09');
  });

  it('rejeita quantidade menor que 1', () => {
    expect(() =>
      faturasDasParcelas({ ano: 2026, mes: 8, dia: 20 }, FECHA_25_VENCE_5, 0),
    ).toThrow();
  });
});

describe('totalFatura', () => {
  it('soma só as transações ativas quando não há crédito', () => {
    const transacoes: TransacaoDaFatura[] = [
      { ativa: true, valorCentavos: 10000 },
      { ativa: true, valorCentavos: 5000 },
    ];
    expect(totalFatura(transacoes, [])).toBe(15000);
  });

  it('abate o estorno parcial de uma transação da fatura', () => {
    // Compra de R$300, devolveram um item de R$50: a fatura fecha em R$250.
    const transacoes: TransacaoDaFatura[] = [{ ativa: true, valorCentavos: 30000 }];
    const creditos: CreditoDaFatura[] = [{ origem: 'ESTORNO', valorCentavos: 5000 }];
    expect(totalFatura(transacoes, creditos)).toBe(25000);
  });

  it('NÃO abate crédito de reembolso — esse dinheiro não passou pelo cartão', () => {
    const transacoes: TransacaoDaFatura[] = [{ ativa: true, valorCentavos: 30000 }];
    const creditos: CreditoDaFatura[] = [{ origem: 'REEMBOLSO', valorCentavos: 30000 }];
    expect(totalFatura(transacoes, creditos)).toBe(30000);
  });

  it('mistura estorno (abate) e reembolso (não abate) na mesma fatura', () => {
    const transacoes: TransacaoDaFatura[] = [
      { ativa: true, valorCentavos: 30000 },
      { ativa: true, valorCentavos: 8000 },
    ];
    const creditos: CreditoDaFatura[] = [
      { origem: 'ESTORNO', valorCentavos: 5000 },
      { origem: 'REEMBOLSO', valorCentavos: 8000 },
    ];
    // 30000 + 8000 - 5000 (só o estorno abate) = 33000
    expect(totalFatura(transacoes, creditos)).toBe(33000);
  });

  it('transação cancelada (ativa: false) não entra na soma', () => {
    const transacoes: TransacaoDaFatura[] = [
      { ativa: true, valorCentavos: 10000 },
      { ativa: false, valorCentavos: 99999 },
    ];
    expect(totalFatura(transacoes, [])).toBe(10000);
  });
});
