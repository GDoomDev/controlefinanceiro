import { describe, expect, it } from 'vitest';
import { type Alocacao, alocacaoVigente, origemDaAlocacao } from './orcamento';

// O cenário do spec: Alimentação em ago=1000, set=800, dez=600.
const ALIMENTACAO: Alocacao[] = [
  { vigenteDe: '2026-08', valorCentavos: 100000 },
  { vigenteDe: '2026-09', valorCentavos: 80000 },
  { vigenteDe: '2026-12', valorCentavos: 60000 },
];

describe('alocacaoVigente', () => {
  it('reproduz a tabela de herança do spec', () => {
    expect(alocacaoVigente(ALIMENTACAO, '2026-08')).toBe(100000);
    expect(alocacaoVigente(ALIMENTACAO, '2026-09')).toBe(80000);
    expect(alocacaoVigente(ALIMENTACAO, '2026-10')).toBe(80000);
    expect(alocacaoVigente(ALIMENTACAO, '2026-11')).toBe(80000);
    expect(alocacaoVigente(ALIMENTACAO, '2026-12')).toBe(60000);
    expect(alocacaoVigente(ALIMENTACAO, '2027-01')).toBe(60000);
  });

  it('devolve zero antes da primeira alocação', () => {
    expect(alocacaoVigente(ALIMENTACAO, '2026-07')).toBe(0);
  });

  it('devolve zero quando não há alocação nenhuma', () => {
    expect(alocacaoVigente([], '2026-09')).toBe(0);
  });

  it('não depende da ordem de entrada', () => {
    const embaralhado = [ALIMENTACAO[2], ALIMENTACAO[0], ALIMENTACAO[1]];
    expect(alocacaoVigente(embaralhado, '2026-10')).toBe(80000);
  });

  it('aceita alocação de valor zero como uma decisão válida', () => {
    const zerado: Alocacao[] = [
      { vigenteDe: '2026-08', valorCentavos: 100000 },
      { vigenteDe: '2026-09', valorCentavos: 0 },
    ];
    expect(alocacaoVigente(zerado, '2026-10')).toBe(0);
  });
});

describe('origemDaAlocacao', () => {
  it('aponta o próprio mês quando ele define o valor', () => {
    expect(origemDaAlocacao(ALIMENTACAO, '2026-09')).toBe('2026-09');
  });

  it('aponta o mês de origem quando o valor é herdado', () => {
    expect(origemDaAlocacao(ALIMENTACAO, '2026-11')).toBe('2026-09');
  });

  it('devolve null quando não há alocação vigente', () => {
    expect(origemDaAlocacao(ALIMENTACAO, '2026-07')).toBeNull();
    expect(origemDaAlocacao([], '2026-09')).toBeNull();
  });
});
