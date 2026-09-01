import { describe, expect, it } from 'vitest';
import {
  type OrcamentoDoPainel,
  estadoDoOrcamento,
  faixasDoHeroi,
  ordenarPorCriticidade,
  restanteDoOrcamento,
} from './painel';

const orc = (
  nome: string,
  orcadoCentavos: number,
  gastoCentavos: number,
): OrcamentoDoPainel => ({
  categoriaId: nome.toLowerCase(),
  nome,
  corSlot: 1,
  orcadoCentavos,
  gastoCentavos,
});

describe('estadoDoOrcamento', () => {
  it('gastou menos que o orçado é ATIVO', () => {
    expect(estadoDoOrcamento(orc('Alimentação', 120000, 94000))).toBe('ATIVO');
  });

  it('gastou mais que o orçado é ESTOURADO', () => {
    expect(estadoDoOrcamento(orc('Lazer', 50000, 62000))).toBe('ESTOURADO');
  });

  it('gastou exatamente o orçado é CONCLUIDO', () => {
    expect(estadoDoOrcamento(orc('Moradia', 220000, 220000))).toBe('CONCLUIDO');
  });

  it('gasto sem nenhum orçamento é ESTOURADO', () => {
    expect(estadoDoOrcamento(orc('Avulso', 0, 5000))).toBe('ESTOURADO');
  });

  it('sem orçamento e sem gasto é CONCLUIDO — nada a decidir', () => {
    expect(estadoDoOrcamento(orc('Vazio', 0, 0))).toBe('CONCLUIDO');
  });
});

describe('restanteDoOrcamento', () => {
  it('é o que sobra do orçado', () => {
    expect(restanteDoOrcamento(orc('Alimentação', 120000, 94000))).toBe(26000);
  });

  it('fica negativo quando estoura', () => {
    expect(restanteDoOrcamento(orc('Lazer', 50000, 62000))).toBe(-12000);
  });
});

describe('ordenarPorCriticidade', () => {
  it('põe os estourados na frente, maior excesso primeiro', () => {
    const lista = [
      orc('Alimentação', 120000, 94000),
      orc('Lazer', 50000, 62000),
      orc('Eletrônicos', 20000, 90000),
    ];
    expect(ordenarPorCriticidade(lista).map((o) => o.nome)).toEqual([
      'Eletrônicos',
      'Lazer',
      'Alimentação',
    ]);
  });

  it('ordena os ativos por percentual consumido decrescente', () => {
    const lista = [
      orc('Saúde', 30000, 9000),
      orc('Transporte', 40000, 38500),
      orc('Alimentação', 120000, 94000),
    ];
    expect(ordenarPorCriticidade(lista).map((o) => o.nome)).toEqual([
      'Transporte',
      'Alimentação',
      'Saúde',
    ]);
  });

  it('joga os concluídos para o fim', () => {
    const lista = [
      orc('Moradia', 220000, 220000),
      orc('Alimentação', 120000, 94000),
      orc('Lazer', 50000, 62000),
    ];
    expect(ordenarPorCriticidade(lista).map((o) => o.nome)).toEqual([
      'Lazer',
      'Alimentação',
      'Moradia',
    ]);
  });

  it('reproduz a ordem completa do exemplo do spec', () => {
    const lista = [
      orc('Moradia', 220000, 220000),
      orc('Alimentação', 120000, 94000),
      orc('Lazer', 50000, 62000),
      orc('Transporte', 40000, 38500),
      orc('Assinaturas', 18000, 18000),
      orc('Saúde', 30000, 9000),
    ];
    expect(ordenarPorCriticidade(lista).map((o) => o.nome)).toEqual([
      'Lazer',
      'Transporte',
      'Alimentação',
      'Saúde',
      'Moradia',
      'Assinaturas',
    ]);
  });

  it('não modifica o array recebido', () => {
    const lista = [orc('A', 100, 200), orc('B', 100, 0)];
    const copia = [...lista];
    ordenarPorCriticidade(lista);
    expect(lista).toEqual(copia);
  });
});

describe('faixasDoHeroi', () => {
  it('divide a receita em gasto, comprometido e livre', () => {
    const orcamentos = [
      orc('Alimentação', 120000, 94000),
      orc('Lazer', 50000, 62000),
    ];
    // Gasto: 94000 + 62000 = 156000
    // Máx por categoria: 120000 + 62000 = 182000 → comprometido = 182000 − 156000 = 26000
    // Livre: 609000 − 182000 = 427000
    expect(faixasDoHeroi(609000, orcamentos)).toEqual({
      gastoCentavos: 156000,
      comprometidoCentavos: 26000,
      livreCentavos: 427000,
    });
  });

  it('as três faixas sempre somam exatamente a receita considerada', () => {
    const cenarios: Array<[number, OrcamentoDoPainel[]]> = [
      [609000, [orc('A', 120000, 94000), orc('B', 50000, 62000)]],
      [100000, [orc('A', 0, 0)]],
      [0, [orc('A', 30000, 10000)]],
      [50000, [orc('A', 20000, 90000), orc('B', 10000, 0)]],
    ];
    for (const [receita, orcamentos] of cenarios) {
      const f = faixasDoHeroi(receita, orcamentos);
      expect(f.gastoCentavos + f.comprometidoCentavos + f.livreCentavos).toBe(receita);
    }
  });

  it('sem orçamento nenhum, tudo é livre', () => {
    expect(faixasDoHeroi(609000, [])).toEqual({
      gastoCentavos: 0,
      comprometidoCentavos: 0,
      livreCentavos: 609000,
    });
  });

  it('o livre fica negativo quando o comprometido passa da receita', () => {
    const f = faixasDoHeroi(50000, [orc('A', 80000, 10000)]);
    expect(f.livreCentavos).toBe(-30000);
  });
});
