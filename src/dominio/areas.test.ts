import { describe, expect, it } from 'vitest';

import {
  type EntradaDoRanking,
  type GastoDeOrcamento,
  MAXIMO_LINHAS_DO_RANKING,
  MAXIMO_SEGMENTOS_COLORIDOS,
  composicaoPorOrcamento,
  rankearSubcategorias,
} from './areas';

function orcamento(
  categoriaId: string,
  gastoCentavos: number,
  corSlot = 1,
): GastoDeOrcamento {
  return { categoriaId, nome: categoriaId, corSlot, gastoCentavos };
}

describe('composicaoPorOrcamento', () => {
  it('ordena os segmentos por valor decrescente', () => {
    const c = composicaoPorOrcamento([
      orcamento('a', 1000),
      orcamento('b', 5000),
      orcamento('c', 3000),
    ]);

    expect(c.segmentos.map((s) => s.categoriaId)).toEqual(['b', 'c', 'a']);
  });

  it('o total é a soma dos positivos e os percentuais somam 100', () => {
    const c = composicaoPorOrcamento([
      orcamento('a', 2500),
      orcamento('b', 7500),
    ]);

    expect(c.totalCentavos).toBe(10000);
    expect(c.segmentos.map((s) => s.percentual)).toEqual([75, 25]);
  });

  it('preserva a cor da entidade, não a da posição', () => {
    const c = composicaoPorOrcamento([
      orcamento('a', 1000, 4),
      orcamento('b', 9000, 2),
    ]);

    expect(c.segmentos.map((s) => [s.categoriaId, s.corSlot])).toEqual([
      ['b', 2],
      ['a', 4],
    ]);
  });

  it('categoria com gasto líquido negativo sai da barra e vai para creditados', () => {
    const c = composicaoPorOrcamento([
      orcamento('a', 8000),
      orcamento('estornada', -1500),
    ]);

    expect(c.segmentos.map((s) => s.categoriaId)).toEqual(['a']);
    expect(c.creditados.map((g) => [g.categoriaId, g.gastoCentavos])).toEqual([
      ['estornada', -1500],
    ]);
    expect(c.totalCentavos).toBe(8000);
  });

  it('categoria com gasto zero também não vira segmento', () => {
    const c = composicaoPorOrcamento([orcamento('a', 8000), orcamento('zero', 0)]);

    expect(c.segmentos.map((s) => s.categoriaId)).toEqual(['a']);
    expect(c.creditados.map((g) => g.categoriaId)).toEqual(['zero']);
  });

  it('além de seis categorias, as menores colapsam em um segmento cinza', () => {
    const c = composicaoPorOrcamento([
      orcamento('a', 7000),
      orcamento('b', 6000),
      orcamento('c', 5000),
      orcamento('d', 4000),
      orcamento('e', 3000),
      orcamento('f', 2000),
      orcamento('g', 700),
      orcamento('h', 300),
    ]);

    expect(c.segmentos).toHaveLength(MAXIMO_SEGMENTOS_COLORIDOS + 1);

    const ultimo = c.segmentos[c.segmentos.length - 1];
    expect(ultimo.nome).toBe('Outras 2');
    expect(ultimo.corSlot).toBeNull();
    expect(ultimo.gastoCentavos).toBe(1000);
  });

  it('exatamente seis categorias não geram "Outras"', () => {
    const c = composicaoPorOrcamento([
      orcamento('a', 6000),
      orcamento('b', 5000),
      orcamento('c', 4000),
      orcamento('d', 3000),
      orcamento('e', 2000),
      orcamento('f', 1000),
    ]);

    expect(c.segmentos).toHaveLength(6);
    expect(c.segmentos.every((s) => s.corSlot !== null)).toBe(true);
  });

  it('mês sem gasto nenhum não divide por zero', () => {
    const c = composicaoPorOrcamento([orcamento('a', 0)]);

    expect(c.totalCentavos).toBe(0);
    expect(c.segmentos).toEqual([]);
    expect(Number.isNaN(c.totalCentavos)).toBe(false);
  });

  it('não modifica o array recebido', () => {
    const entrada = [orcamento('a', 1000), orcamento('b', 9000)];
    composicaoPorOrcamento(entrada);

    expect(entrada.map((g) => g.categoriaId)).toEqual(['a', 'b']);
  });
});

function entrada(
  subcategoriaId: string,
  gastoCentavos: number,
  categoriaId = 'cat-1',
): EntradaDoRanking {
  return {
    subcategoriaId,
    nome: subcategoriaId,
    categoriaId,
    nomeDoOrcamento: categoriaId,
    corSlot: 1,
    gastoCentavos,
    quantidade: 1,
    maiorLancamentoCentavos: gastoCentavos,
  };
}

describe('rankearSubcategorias', () => {
  it('ordena por valor decrescente', () => {
    const r = rankearSubcategorias(
      [entrada('a', 100), entrada('b', 900), entrada('c', 500)],
      1500,
      new Map([['cat-1', 1500]]),
    );

    expect(r.linhas.map((l) => l.subcategoriaId)).toEqual(['b', 'c', 'a']);
    expect(r.outras).toBeNull();
  });

  it('calcula o percentual do mês e o percentual dentro do orçamento-pai', () => {
    const r = rankearSubcategorias(
      [entrada('a', 2500, 'cat-1')],
      10000,
      new Map([['cat-1', 5000]]),
    );

    expect(r.linhas[0].percentualDoMes).toBe(25);
    expect(r.linhas[0].percentualDoOrcamento).toBe(50);
  });

  it('mostra as dez maiores e colapsa o resto em "Outras"', () => {
    const entradas = Array.from({ length: 13 }, (_, i) =>
      entrada(`sub-${i}`, (13 - i) * 100),
    );

    const r = rankearSubcategorias(entradas, 9100, new Map([['cat-1', 9100]]));

    expect(r.linhas).toHaveLength(MAXIMO_LINHAS_DO_RANKING);
    expect(r.linhas[0].subcategoriaId).toBe('sub-0');
    expect(r.outras).toEqual({
      quantidade: 3,
      gastoCentavos: 300 + 200 + 100,
      percentualDoMes: (600 / 9100) * 100,
    });
  });

  it('exatamente dez subcategorias não geram "Outras"', () => {
    const entradas = Array.from({ length: 10 }, (_, i) => entrada(`sub-${i}`, 100));

    const r = rankearSubcategorias(entradas, 1000, new Map([['cat-1', 1000]]));

    expect(r.linhas).toHaveLength(10);
    expect(r.outras).toBeNull();
  });

  it('subcategoria negativa fica no fim, com percentual negativo e sem NaN', () => {
    const r = rankearSubcategorias(
      [entrada('a', 1000), entrada('estornada', -400)],
      1000,
      new Map([['cat-1', 600]]),
    );

    expect(r.linhas.map((l) => l.subcategoriaId)).toEqual(['a', 'estornada']);
    expect(r.linhas[1].percentualDoMes).toBe(-40);
    expect(Number.isNaN(r.linhas[1].percentualDoOrcamento)).toBe(false);
  });

  it('total do mês zero não divide por zero', () => {
    const r = rankearSubcategorias([entrada('a', 0)], 0, new Map([['cat-1', 0]]));

    expect(r.linhas[0].percentualDoMes).toBe(0);
    expect(r.linhas[0].percentualDoOrcamento).toBe(0);
  });

  it('orçamento-pai com gasto líquido negativo não gera percentual infinito', () => {
    const r = rankearSubcategorias(
      [entrada('a', 500)],
      500,
      new Map([['cat-1', -100]]),
    );

    expect(r.linhas[0].percentualDoOrcamento).toBe(0);
    expect(Number.isFinite(r.linhas[0].percentualDoOrcamento)).toBe(true);
  });

  it('não modifica o array recebido', () => {
    const entradas = [entrada('a', 100), entrada('b', 900)];
    rankearSubcategorias(entradas, 1000, new Map([['cat-1', 1000]]));

    expect(entradas.map((e) => e.subcategoriaId)).toEqual(['a', 'b']);
  });
});
