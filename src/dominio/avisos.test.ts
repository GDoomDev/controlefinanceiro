import { describe, expect, it } from 'vitest';
import { type EntradaAvisos, gerarAvisos, limitarAvisos } from './avisos';

const vazio = (over: Partial<EntradaAvisos> = {}): EntradaAvisos => ({
  orcamentos: [],
  faturasProximas: [],
  reembolsoPendente: null,
  receitaPrevistaDoProximoMesInformada: true,
  proximoMes: '2026-10',
  ...over,
});

describe('gerarAvisos — orçamentos', () => {
  it('avisa em vermelho quando um orçamento estoura', () => {
    const avisos = gerarAvisos(
      vazio({ orcamentos: [{ nome: 'Lazer', orcadoCentavos: 50000, gastoCentavos: 62000 }] }),
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0].severidade).toBe('VERMELHO');
    expect(avisos[0].texto).toContain('Lazer');
    expect(avisos[0].texto).toContain('R$ 120,00');
  });

  it('avisa em amarelo a partir de 90% consumido', () => {
    const avisos = gerarAvisos(
      vazio({
        orcamentos: [{ nome: 'Transporte', orcadoCentavos: 40000, gastoCentavos: 38500 }],
      }),
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0].severidade).toBe('AMARELO');
    expect(avisos[0].texto).toContain('Transporte');
    expect(avisos[0].texto).toContain('R$ 15,00');
  });

  it('exatamente 90% já dispara o aviso', () => {
    const avisos = gerarAvisos(
      vazio({ orcamentos: [{ nome: 'Saúde', orcadoCentavos: 10000, gastoCentavos: 9000 }] }),
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0].severidade).toBe('AMARELO');
  });

  it('não avisa nada abaixo de 90%', () => {
    const avisos = gerarAvisos(
      vazio({
        orcamentos: [{ nome: 'Alimentação', orcadoCentavos: 120000, gastoCentavos: 94000 }],
      }),
    );
    expect(avisos).toEqual([]);
  });

  it('não avisa sobre orçamento zerado sem gasto', () => {
    const avisos = gerarAvisos(
      vazio({ orcamentos: [{ nome: 'Vazio', orcadoCentavos: 0, gastoCentavos: 0 }] }),
    );
    expect(avisos).toEqual([]);
  });

  it('gasto sem orçamento nenhum conta como estouro', () => {
    const avisos = gerarAvisos(
      vazio({ orcamentos: [{ nome: 'Avulso', orcadoCentavos: 0, gastoCentavos: 5000 }] }),
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0].severidade).toBe('VERMELHO');
  });
});

describe('gerarAvisos — outras fontes', () => {
  it('avisa em amarelo quando uma fatura fecha em 2 dias ou menos', () => {
    const avisos = gerarAvisos(
      vazio({
        faturasProximas: [
          { cartaoNome: 'Nubank', diasParaFechar: 1, totalCentavos: 294000 },
        ],
      }),
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0].severidade).toBe('AMARELO');
    expect(avisos[0].texto).toContain('Nubank');
  });

  it('avisa em azul sobre reembolso pendente há mais de 30 dias', () => {
    const avisos = gerarAvisos(
      vazio({ reembolsoPendente: { totalCentavos: 48000, diasDoMaisAntigo: 42 } }),
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0].severidade).toBe('AZUL');
    expect(avisos[0].texto).toContain('R$ 480,00');
    expect(avisos[0].texto).toContain('42');
  });

  it('não avisa sobre reembolso recente', () => {
    const avisos = gerarAvisos(
      vazio({ reembolsoPendente: { totalCentavos: 48000, diasDoMaisAntigo: 5 } }),
    );
    expect(avisos).toEqual([]);
  });

  it('avisa em cinza quando falta a receita prevista do próximo mês', () => {
    const avisos = gerarAvisos(
      vazio({ receitaPrevistaDoProximoMesInformada: false, proximoMes: '2026-10' }),
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0].severidade).toBe('CINZA');
    expect(avisos[0].texto).toContain('2026-10');
  });
});

describe('gerarAvisos — ordenação', () => {
  it('ordena por severidade e, dentro dela, por valor decrescente', () => {
    const avisos = gerarAvisos({
      orcamentos: [
        { nome: 'Lazer', orcadoCentavos: 50000, gastoCentavos: 62000 },
        { nome: 'Eletrônicos', orcadoCentavos: 20000, gastoCentavos: 90000 },
        { nome: 'Transporte', orcadoCentavos: 40000, gastoCentavos: 38500 },
      ],
      faturasProximas: [
        { cartaoNome: 'Nubank', diasParaFechar: 1, totalCentavos: 294000 },
      ],
      reembolsoPendente: { totalCentavos: 48000, diasDoMaisAntigo: 42 },
      receitaPrevistaDoProximoMesInformada: false,
      proximoMes: '2026-10',
    });

    expect(avisos.map((a) => a.severidade)).toEqual([
      'VERMELHO',
      'VERMELHO',
      'AMARELO',
      'AMARELO',
      'AZUL',
      'CINZA',
    ]);
    // Dentro do vermelho, o maior estouro primeiro (70000 antes de 12000).
    expect(avisos[0].texto).toContain('Eletrônicos');
    // Dentro do amarelo, a fatura de 294000 vem antes do restante de 1500.
    expect(avisos[2].texto).toContain('Nubank');
  });
});

describe('limitarAvisos', () => {
  const avisoFalso = (i: number) => ({
    severidade: 'VERMELHO' as const,
    texto: `aviso ${i}`,
    href: '/',
    valorOrdenacao: i,
  });

  it('mostra todos quando cabem', () => {
    const { visiveis, ocultos } = limitarAvisos([1, 2, 3].map(avisoFalso));
    expect(visiveis).toHaveLength(3);
    expect(ocultos).toBe(0);
  });

  it('corta em cinco e conta o resto', () => {
    const { visiveis, ocultos } = limitarAvisos([1, 2, 3, 4, 5, 6, 7].map(avisoFalso));
    expect(visiveis).toHaveLength(5);
    expect(ocultos).toBe(2);
  });

  it('lista vazia devolve vazio', () => {
    expect(limitarAvisos([])).toEqual({ visiveis: [], ocultos: 0 });
  });
});
