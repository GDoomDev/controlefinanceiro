import { describe, expect, it } from 'vitest';
import {
  type CreditoAgregavel,
  type DespesaAgregavel,
  despesaLiquida,
  estatisticasPorSubcategoria,
  gastoPorCategoria,
  receitaConsiderada,
  sobraProjetada,
  sobraRealizada,
} from './agregacao';

const despesa = (
  competencia: string,
  categoriaId: string,
  valorCentavos: number,
  cancelada = false,
): DespesaAgregavel => ({ competencia, categoriaId, valorCentavos, cancelada });

const credito = (
  competenciaCredito: string,
  categoriaId: string,
  valorCentavos: number,
): CreditoAgregavel => ({ competenciaCredito, categoriaId, valorCentavos });

describe('gastoPorCategoria', () => {
  it('soma despesas ativas da competência pedida', () => {
    const despesas = [
      despesa('2026-09', 'alimentacao', 60000),
      despesa('2026-09', 'alimentacao', 34000),
      despesa('2026-09', 'lazer', 62000),
      despesa('2026-10', 'alimentacao', 10000),
    ];
    const gastos = gastoPorCategoria(despesas, [], '2026-09');
    expect(gastos.get('alimentacao')).toBe(94000);
    expect(gastos.get('lazer')).toBe(62000);
    expect(gastos.has('2026-10')).toBe(false);
  });

  it('ignora despesas canceladas', () => {
    const despesas = [
      despesa('2026-09', 'eletronicos', 30000),
      despesa('2026-09', 'eletronicos', 20000, true),
    ];
    expect(gastoPorCategoria(despesas, [], '2026-09').get('eletronicos')).toBe(30000);
  });

  it('subtrai crédito de reembolso na competência da despesa', () => {
    const despesas = [despesa('2026-09', 'alimentacao', 30000)];
    const creditos = [credito('2026-09', 'alimentacao', 30000)];
    expect(gastoPorCategoria(despesas, creditos, '2026-09').get('alimentacao')).toBe(0);
  });

  it('subtrai reembolso parcial', () => {
    const despesas = [despesa('2026-09', 'alimentacao', 30000)];
    const creditos = [credito('2026-09', 'alimentacao', 10000)];
    expect(gastoPorCategoria(despesas, creditos, '2026-09').get('alimentacao')).toBe(20000);
  });

  it('soma recebimentos parciais sucessivos até quitar', () => {
    const despesas = [despesa('2026-09', 'alimentacao', 30000)];
    const creditos = [
      credito('2026-09', 'alimentacao', 10000),
      credito('2026-09', 'alimentacao', 20000),
    ];
    expect(gastoPorCategoria(despesas, creditos, '2026-09').get('alimentacao')).toBe(0);
  });

  it('conta o crédito na competência dele, não na da despesa', () => {
    // Estorno com crédito único: a despesa é de setembro, o crédito caiu em novembro.
    const despesas = [despesa('2026-09', 'eletronicos', 60000)];
    const creditos = [credito('2026-11', 'eletronicos', 60000)];
    expect(gastoPorCategoria(despesas, creditos, '2026-09').get('eletronicos')).toBe(60000);
    expect(gastoPorCategoria(despesas, creditos, '2026-11').get('eletronicos')).toBe(-60000);
  });

  it('permite categoria com gasto líquido negativo', () => {
    const despesas = [despesa('2026-11', 'eletronicos', 10000)];
    const creditos = [credito('2026-11', 'eletronicos', 60000)];
    expect(gastoPorCategoria(despesas, creditos, '2026-11').get('eletronicos')).toBe(-50000);
  });
});

describe('despesaLiquida', () => {
  it('soma todas as categorias da competência', () => {
    const despesas = [
      despesa('2026-09', 'alimentacao', 94000),
      despesa('2026-09', 'lazer', 62000),
    ];
    const creditos = [credito('2026-09', 'lazer', 2000)];
    expect(despesaLiquida(despesas, creditos, '2026-09')).toBe(154000);
  });

  it('é zero quando não há nada na competência', () => {
    expect(despesaLiquida([], [], '2026-09')).toBe(0);
  });
});

describe('receitaConsiderada', () => {
  it('usa a realizada em mês passado', () => {
    expect(receitaConsiderada(600000, 590000, true)).toBe(590000);
  });

  it('usa a maior entre prevista e realizada no mês corrente ou futuro', () => {
    // Salário ainda não caiu.
    expect(receitaConsiderada(609000, 0, false)).toBe(609000);
    // Bônus acima do previsto.
    expect(receitaConsiderada(609000, 750000, false)).toBe(750000);
    // Sem previsão cadastrada, mas já recebido.
    expect(receitaConsiderada(0, 609000, false)).toBe(609000);
  });
});

describe('sobraRealizada', () => {
  it('é receita menos despesa líquida', () => {
    expect(sobraRealizada(609000, 441500)).toBe(167500);
  });

  it('pode ser negativa', () => {
    expect(sobraRealizada(100000, 150000)).toBe(-50000);
  });
});

describe('sobraProjetada', () => {
  it('usa o orçamento quando ele ainda não foi consumido', () => {
    const orcamentos = new Map([['alimentacao', 120000]]);
    const gastos = new Map([['alimentacao', 94000]]);
    // 609000 − máx(120000, 94000) = 489000
    expect(sobraProjetada(609000, orcamentos, gastos)).toBe(489000);
  });

  it('usa o comprometido quando ele passou do orçamento', () => {
    // Parcela de 300 já lançada num orçamento de 200.
    const orcamentos = new Map([['eletronicos', 20000]]);
    const gastos = new Map([['eletronicos', 30000]]);
    expect(sobraProjetada(609000, orcamentos, gastos)).toBe(579000);
  });

  it('não soma orçamento e comprometido duas vezes', () => {
    const orcamentos = new Map([['eletronicos', 20000]]);
    const gastos = new Map([['eletronicos', 30000]]);
    // Se somasse, daria 609000 − 50000 = 559000.
    expect(sobraProjetada(609000, orcamentos, gastos)).not.toBe(559000);
  });

  it('inclui categoria que tem gasto mas não tem orçamento', () => {
    const orcamentos = new Map<string, number>();
    const gastos = new Map([['arquivada', 15000]]);
    expect(sobraProjetada(100000, orcamentos, gastos)).toBe(85000);
  });

  it('inclui categoria que tem orçamento mas não tem gasto', () => {
    const orcamentos = new Map([['saude', 30000]]);
    const gastos = new Map<string, number>();
    expect(sobraProjetada(100000, orcamentos, gastos)).toBe(70000);
  });

  it('reproduz o mês de exemplo do spec', () => {
    const orcamentos = new Map([
      ['moradia', 220000],
      ['alimentacao', 120000],
      ['lazer', 50000],
      ['transporte', 40000],
      ['assinaturas', 18000],
      ['saude', 30000],
    ]);
    const gastos = new Map([
      ['moradia', 220000],
      ['alimentacao', 94000],
      ['lazer', 62000],
      ['transporte', 38500],
      ['assinaturas', 18000],
      ['saude', 9000],
    ]);
    // máx por categoria: 220000 + 120000 + 62000 + 40000 + 18000 + 30000 = 490000
    expect(sobraProjetada(609000, orcamentos, gastos)).toBe(119000);
  });

  it('trata gasto líquido negativo sem quebrar o máximo', () => {
    const orcamentos = new Map([['eletronicos', 20000]]);
    const gastos = new Map([['eletronicos', -50000]]);
    // máx(20000, −50000) = 20000
    expect(sobraProjetada(100000, orcamentos, gastos)).toBe(80000);
  });
});

describe('estatisticasPorSubcategoria', () => {
  const mes = '2026-09';

  function comSub(
    subcategoriaId: string,
    valorCentavos: number,
    extras: Partial<DespesaAgregavel> = {},
  ): DespesaAgregavel {
    return {
      competencia: mes,
      categoriaId: 'cat-1',
      subcategoriaId,
      valorCentavos,
      cancelada: false,
      ...extras,
    };
  }

  it('soma as despesas ativas de cada subcategoria', () => {
    const stats = estatisticasPorSubcategoria(
      [comSub('sub-a', 3000), comSub('sub-a', 2000), comSub('sub-b', 500)],
      [],
      mes,
    );

    expect(stats.get('sub-a')?.gastoCentavos).toBe(5000);
    expect(stats.get('sub-b')?.gastoCentavos).toBe(500);
  });

  it('ignora despesas canceladas e de outra competência', () => {
    const stats = estatisticasPorSubcategoria(
      [
        comSub('sub-a', 3000),
        comSub('sub-a', 9900, { cancelada: true }),
        comSub('sub-a', 7700, { competencia: '2026-10' }),
      ],
      [],
      mes,
    );

    expect(stats.get('sub-a')?.gastoCentavos).toBe(3000);
    expect(stats.get('sub-a')?.quantidade).toBe(1);
  });

  it('ignora despesa sem subcategoria', () => {
    const stats = estatisticasPorSubcategoria(
      [comSub('sub-a', 3000), comSub('', 1000), { ...comSub('x', 1000), subcategoriaId: undefined }],
      [],
      mes,
    );

    expect([...stats.keys()]).toEqual(['sub-a']);
  });

  it('crédito reduz o gasto da subcategoria da despesa de origem', () => {
    const stats = estatisticasPorSubcategoria(
      [comSub('sub-a', 10000)],
      [
        {
          competenciaCredito: mes,
          categoriaId: 'cat-1',
          subcategoriaId: 'sub-a',
          valorCentavos: 4000,
        },
      ],
      mes,
    );

    expect(stats.get('sub-a')?.gastoCentavos).toBe(6000);
  });

  it('crédito de outra competência não entra', () => {
    const stats = estatisticasPorSubcategoria(
      [comSub('sub-a', 10000)],
      [
        {
          competenciaCredito: '2026-10',
          categoriaId: 'cat-1',
          subcategoriaId: 'sub-a',
          valorCentavos: 4000,
        },
      ],
      mes,
    );

    expect(stats.get('sub-a')?.gastoCentavos).toBe(10000);
  });

  it('conta os lançamentos sem contar os créditos', () => {
    const stats = estatisticasPorSubcategoria(
      [comSub('sub-a', 1000), comSub('sub-a', 2000)],
      [
        {
          competenciaCredito: mes,
          categoriaId: 'cat-1',
          subcategoriaId: 'sub-a',
          valorCentavos: 500,
        },
      ],
      mes,
    );

    expect(stats.get('sub-a')?.quantidade).toBe(2);
  });

  it('o maior lançamento é o bruto, não o líquido depois do crédito', () => {
    const stats = estatisticasPorSubcategoria(
      [comSub('sub-a', 1000), comSub('sub-a', 8000)],
      [
        {
          competenciaCredito: mes,
          categoriaId: 'cat-1',
          subcategoriaId: 'sub-a',
          valorCentavos: 7900,
        },
      ],
      mes,
    );

    expect(stats.get('sub-a')?.maiorLancamentoCentavos).toBe(8000);
  });

  it('subcategoria só com crédito aparece com gasto negativo', () => {
    const stats = estatisticasPorSubcategoria(
      [],
      [
        {
          competenciaCredito: mes,
          categoriaId: 'cat-1',
          subcategoriaId: 'sub-a',
          valorCentavos: 2500,
        },
      ],
      mes,
    );

    expect(stats.get('sub-a')).toEqual({
      gastoCentavos: -2500,
      quantidade: 0,
      maiorLancamentoCentavos: 0,
    });
  });
});
