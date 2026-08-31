/**
 * Teste de integração entre módulos do domínio.
 *
 * Cada módulo em `src/dominio/` é testado isoladamente com fixtures escritas
 * à mão. Este arquivo exercita a cadeia real: uma compra parcelada no cartão
 * → competência de cada parcela → gasto por categoria → sobra do mês. Usa as
 * implementações de verdade dos outros módulos, sem mocks.
 */

import { describe, expect, it } from 'vitest';
import { dividirParcelas, emCentavos } from './dinheiro';
import { faturasDasParcelas, type RegraCartao } from './fatura';
import { despesaLiquida, gastoPorCategoria, sobraProjetada, type DespesaAgregavel } from './agregacao';

describe('cadeia completa: compra parcelada -> competência -> gasto -> sobra', () => {
  // Notebook de R$2.000 em 10x, comprado em 20/ago/2026 num cartão que fecha
  // dia 25 e vence dia 5 (fecha depois da compra -> primeira parcela vence em
  // setembro/2026).
  const REGRA: RegraCartao = { diaFechamento: 25, diaVencimento: 5 };
  const COMPRA = { ano: 2026, mes: 8, dia: 20 };
  const TOTAL = emCentavos(2000);
  const QUANTIDADE = 10;
  const CATEGORIA = 'eletronicos';

  const faturas = faturasDasParcelas(COMPRA, REGRA, QUANTIDADE);
  const valoresDasParcelas = dividirParcelas(TOTAL, QUANTIDADE);

  const despesas: DespesaAgregavel[] = faturas.map((fatura, i) => ({
    competencia: fatura.competencia,
    categoriaId: CATEGORIA,
    valorCentavos: valoresDasParcelas[i],
    cancelada: false,
  }));

  it('distribui as 10 parcelas em 10 competências consecutivas, de set/2026 a jun/2027', () => {
    expect(faturas.map((f) => f.competencia)).toEqual([
      '2026-09', '2026-10', '2026-11', '2026-12',
      '2027-01', '2027-02', '2027-03', '2027-04',
      '2027-05', '2027-06',
    ]);
  });

  it('a soma de todas as parcelas bate exatamente com o total da compra', () => {
    const soma = valoresDasParcelas.reduce((a, b) => a + b, 0);
    expect(soma).toBe(TOTAL);
    expect(soma).toBe(200000);
  });

  it('o gasto de uma competência é exatamente a parcela daquele mês — as outras 9 não vazam', () => {
    // Segunda parcela: outubro/2026.
    const competenciaAlvo = faturas[1].competencia;
    expect(competenciaAlvo).toBe('2026-10');

    const gastos = gastoPorCategoria(despesas, [], competenciaAlvo);
    expect(gastos.get(CATEGORIA)).toBe(valoresDasParcelas[1]);
    expect(gastos.size).toBe(1);

    const liquida = despesaLiquida(despesas, [], competenciaAlvo);
    expect(liquida).toBe(valoresDasParcelas[1]);
  });

  it('em uma competência sem parcela, o gasto da categoria é zero', () => {
    const liquida = despesaLiquida(despesas, [], '2028-01');
    expect(liquida).toBe(0);
  });

  it('alimenta sobraProjetada: receita menos máx(orçamento, comprometido) da categoria', () => {
    const competenciaAlvo = faturas[1].competencia; // 2026-10
    const gastos = gastoPorCategoria(despesas, [], competenciaAlvo);

    const receita = emCentavos(5000);
    // Orçamento da categoria é menor que a parcela comprometida: o
    // comprometido prevalece (máx), então a sobra reflete a parcela real.
    const orcamentos = new Map([[CATEGORIA, emCentavos(100)]]);

    const sobra = sobraProjetada(receita, orcamentos, gastos);
    // 500000 - máx(10000, 20000) = 500000 - 20000 = 480000
    expect(sobra).toBe(receita - valoresDasParcelas[1]);
    expect(sobra).toBe(480000);
  });
});
