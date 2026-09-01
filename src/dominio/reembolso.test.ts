import { describe, expect, it } from 'vitest';
import {
  type ParcelaEstornavel,
  estadoDoReembolso,
  ordenarPorAntiguidade,
  pendente,
  planejarEstorno,
  planejarEstornoParcial,
  recebido,
  validarRecebimento,
} from './reembolso';

describe('recebido e pendente', () => {
  it('sem recebimentos, o pendente é o alvo inteiro', () => {
    expect(recebido([])).toBe(0);
    expect(pendente(30000, [])).toBe(30000);
  });

  it('soma recebimentos parciais sucessivos', () => {
    const recebimentos = [{ valorCentavos: 10000 }, { valorCentavos: 5000 }];
    expect(recebido(recebimentos)).toBe(15000);
    expect(pendente(30000, recebimentos)).toBe(15000);
  });

  it('zera o pendente quando o alvo é atingido', () => {
    expect(pendente(30000, [{ valorCentavos: 30000 }])).toBe(0);
  });

  it('alvo zero significa não reembolsável', () => {
    expect(pendente(0, [])).toBe(0);
  });
});

describe('validarRecebimento', () => {
  it('aceita valor dentro do pendente', () => {
    expect(() => validarRecebimento(10000, 30000, [])).not.toThrow();
    expect(() => validarRecebimento(30000, 30000, [])).not.toThrow();
  });

  it('rejeita valor zero ou negativo', () => {
    expect(() => validarRecebimento(0, 30000, [])).toThrow();
    expect(() => validarRecebimento(-100, 30000, [])).toThrow();
  });

  it('rejeita valor acima do pendente', () => {
    expect(() => validarRecebimento(30001, 30000, [])).toThrow();
    expect(() =>
      validarRecebimento(20001, 30000, [{ valorCentavos: 10000 }]),
    ).toThrow();
  });

  it('rejeita valor não inteiro', () => {
    expect(() => validarRecebimento(100.5, 30000, [])).toThrow();
  });
});

// TV de R$2.000 em 10x de R$200, competências set/2026 a jun/2027.
// As três primeiras já foram cobradas; o resto está em faturas abertas.
const PARCELAS: ParcelaEstornavel[] = [
  { id: 'p1', competencia: '2026-09', valorCentavos: 20000, statusFatura: 'PAGA' },
  { id: 'p2', competencia: '2026-10', valorCentavos: 20000, statusFatura: 'PAGA' },
  { id: 'p3', competencia: '2026-11', valorCentavos: 20000, statusFatura: 'FECHADA' },
  { id: 'p4', competencia: '2026-12', valorCentavos: 20000, statusFatura: 'ABERTA' },
  { id: 'p5', competencia: '2027-01', valorCentavos: 20000, statusFatura: 'ABERTA' },
];

describe('planejarEstorno', () => {
  it('cancela as parcelas de faturas abertas', () => {
    const plano = planejarEstorno(PARCELAS, 'UNICO', '2026-11');
    expect(plano.canceladas).toEqual(['p4', 'p5']);
  });

  it('credita as parcelas já cobradas', () => {
    const plano = planejarEstorno(PARCELAS, 'UNICO', '2026-11');
    expect(plano.creditos.map((c) => c.transactionId)).toEqual(['p1', 'p2', 'p3']);
    const total = plano.creditos.reduce((a, c) => a + c.valorCentavos, 0);
    expect(total).toBe(60000);
  });

  it('modo UNICO põe todos os créditos na mesma competência', () => {
    const plano = planejarEstorno(PARCELAS, 'UNICO', '2026-11');
    expect(plano.creditos.map((c) => c.competenciaCredito)).toEqual([
      '2026-11', '2026-11', '2026-11',
    ]);
  });

  it('modo POR_FATURA deixa cada crédito na competência da sua parcela', () => {
    const plano = planejarEstorno(PARCELAS, 'POR_FATURA', '2026-11');
    expect(plano.creditos.map((c) => c.competenciaCredito)).toEqual([
      '2026-09', '2026-10', '2026-11',
    ]);
  });

  it('parcelamento inteiro ainda não cobrado só gera cancelamentos', () => {
    const futuras: ParcelaEstornavel[] = [
      { id: 'f1', competencia: '2026-12', valorCentavos: 20000, statusFatura: 'ABERTA' },
      { id: 'f2', competencia: '2027-01', valorCentavos: 20000, statusFatura: 'ABERTA' },
    ];
    const plano = planejarEstorno(futuras, 'UNICO', '2026-12');
    expect(plano.canceladas).toEqual(['f1', 'f2']);
    expect(plano.creditos).toEqual([]);
  });

  it('compra à vista já cobrada gera um crédito e nenhum cancelamento', () => {
    const avista: ParcelaEstornavel[] = [
      { id: 'a1', competencia: '2026-09', valorCentavos: 8000, statusFatura: 'PAGA' },
    ];
    const plano = planejarEstorno(avista, 'POR_FATURA', '2026-09');
    expect(plano.canceladas).toEqual([]);
    expect(plano.creditos).toEqual([
      { transactionId: 'a1', valorCentavos: 8000, competenciaCredito: '2026-09' },
    ]);
  });
});

// Compra de R$300 no cartão; devolveram só um item de R$50 — nenhuma parcela
// é cancelada, o valor devolvido vira crédito.
describe('planejarEstornoParcial', () => {
  it('valor parcial válido gera exatamente um crédito, sem cancelamento', () => {
    const credito = planejarEstornoParcial('t1', 5000, '2026-11');
    expect(credito).toEqual({
      transactionId: 't1',
      valorCentavos: 5000,
      competenciaCredito: '2026-11',
    });
  });

  it('rejeita valor zero', () => {
    expect(() => planejarEstornoParcial('t1', 0, '2026-11')).toThrow();
  });

  it('rejeita valor negativo', () => {
    expect(() => planejarEstornoParcial('t1', -100, '2026-11')).toThrow();
  });

  it('rejeita valor não inteiro', () => {
    expect(() => planejarEstornoParcial('t1', 100.5, '2026-11')).toThrow();
  });
});

describe('estadoDoReembolso', () => {
  it('alvo zero não é reembolsável, mesmo sem recebimento', () => {
    expect(estadoDoReembolso(0, [])).toBe('NAO_REEMBOLSAVEL');
  });

  it('alvo positivo sem recebimento nenhum está pendente', () => {
    expect(estadoDoReembolso(20000, [])).toBe('PENDENTE');
  });

  it('recebimento menor que o alvo é parcial', () => {
    expect(estadoDoReembolso(20000, [{ valorCentavos: 5000 }])).toBe('PARCIAL');
  });

  it('recebimentos que somam o alvo quitam', () => {
    expect(
      estadoDoReembolso(20000, [{ valorCentavos: 12000 }, { valorCentavos: 8000 }]),
    ).toBe('QUITADO');
  });

  it('está quitado no centavo exato, não um antes', () => {
    expect(estadoDoReembolso(20000, [{ valorCentavos: 19999 }])).toBe('PARCIAL');
    expect(estadoDoReembolso(20000, [{ valorCentavos: 20000 }])).toBe('QUITADO');
  });
});

describe('ordenarPorAntiguidade', () => {
  it('põe o mais parado na frente', () => {
    const ordenados = ordenarPorAntiguidade([
      { diasParado: 3, pendenteCentavos: 100 },
      { diasParado: 40, pendenteCentavos: 100 },
      { diasParado: 12, pendenteCentavos: 100 },
    ]);

    expect(ordenados.map((r) => r.diasParado)).toEqual([40, 12, 3]);
  });

  it('desempata pelo maior pendente', () => {
    const ordenados = ordenarPorAntiguidade([
      { diasParado: 10, pendenteCentavos: 500 },
      { diasParado: 10, pendenteCentavos: 9000 },
    ]);

    expect(ordenados.map((r) => r.pendenteCentavos)).toEqual([9000, 500]);
  });

  it('não modifica o array recebido', () => {
    const entrada = [
      { diasParado: 1, pendenteCentavos: 100 },
      { diasParado: 90, pendenteCentavos: 100 },
    ];
    ordenarPorAntiguidade(entrada);

    expect(entrada.map((r) => r.diasParado)).toEqual([1, 90]);
  });
});
