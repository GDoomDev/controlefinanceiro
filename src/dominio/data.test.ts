import { describe, expect, it } from 'vitest';
import {
  competenciaDe,
  criarCompetencia,
  dataCivilEm,
  diaSeguro,
  formatarDataCivil,
  lerDataCivil,
  partesDaCompetencia,
  somarMeses,
  ultimoDiaDoMes,
} from './data';

describe('dataCivilEm', () => {
  it('converte um instante para a data civil de São Paulo', () => {
    expect(dataCivilEm(new Date('2026-08-20T15:00:00Z'))).toEqual({
      ano: 2026,
      mes: 8,
      dia: 20,
    });
  });

  it('mantém a compra das 22h no dia em que ela aconteceu em São Paulo', () => {
    // 2026-08-31T01:30Z é 2026-08-30 22:30 em São Paulo.
    expect(dataCivilEm(new Date('2026-08-31T01:30:00Z'))).toEqual({
      ano: 2026,
      mes: 8,
      dia: 30,
    });
  });
});

describe('competenciaDe', () => {
  it('formata com mês de dois dígitos', () => {
    expect(competenciaDe({ ano: 2026, mes: 9, dia: 5 })).toBe('2026-09');
    expect(competenciaDe({ ano: 2026, mes: 12, dia: 31 })).toBe('2026-12');
  });
});

describe('criarCompetencia e partesDaCompetencia', () => {
  it('faz a volta completa', () => {
    expect(criarCompetencia(2026, 3)).toBe('2026-03');
    expect(partesDaCompetencia('2026-03')).toEqual({ ano: 2026, mes: 3 });
  });

  it('rejeita mês fora de 1..12', () => {
    expect(() => criarCompetencia(2026, 0)).toThrow();
    expect(() => criarCompetencia(2026, 13)).toThrow();
  });

  it('rejeita formato inválido', () => {
    expect(() => partesDaCompetencia('2026-3')).toThrow();
    expect(() => partesDaCompetencia('agosto')).toThrow();
  });

  it('preenche o ano com zero à esquerda até 4 dígitos', () => {
    expect(criarCompetencia(999, 3)).toBe('0999-03');
    expect(() => partesDaCompetencia('0999-03')).not.toThrow();
    expect(partesDaCompetencia('0999-03')).toEqual({ ano: 999, mes: 3 });
  });
});

describe('somarMeses', () => {
  it('avança dentro do mesmo ano', () => {
    expect(somarMeses('2026-08', 1)).toBe('2026-09');
  });

  it('vira o ano para frente', () => {
    expect(somarMeses('2026-11', 2)).toBe('2027-01');
  });

  it('vira o ano para trás', () => {
    expect(somarMeses('2026-01', -1)).toBe('2025-12');
  });

  it('aceita zero', () => {
    expect(somarMeses('2026-08', 0)).toBe('2026-08');
  });

  it('cobre o alcance de um parcelamento longo', () => {
    expect(somarMeses('2026-09', 9)).toBe('2027-06');
  });
});

describe('ultimoDiaDoMes', () => {
  it('conhece os meses de 30 e 31 dias', () => {
    expect(ultimoDiaDoMes(2026, 1)).toBe(31);
    expect(ultimoDiaDoMes(2026, 4)).toBe(30);
  });

  it('conhece fevereiro em ano comum e bissexto', () => {
    expect(ultimoDiaDoMes(2026, 2)).toBe(28);
    expect(ultimoDiaDoMes(2024, 2)).toBe(29);
  });
});

describe('formatarDataCivil e lerDataCivil', () => {
  it('formata com mês e dia de dois dígitos', () => {
    expect(formatarDataCivil({ ano: 2026, mes: 8, dia: 5 })).toBe('2026-08-05');
    expect(formatarDataCivil({ ano: 2026, mes: 12, dia: 31 })).toBe('2026-12-31');
  });

  it('faz a volta completa sem perder um dia', () => {
    expect(lerDataCivil('2026-08-20')).toEqual({ ano: 2026, mes: 8, dia: 20 });
  });

  it('rejeita formato inválido', () => {
    expect(() => lerDataCivil('2026-8-5')).toThrow();
    expect(() => lerDataCivil('20/08/2026')).toThrow();
  });
});

describe('diaSeguro', () => {
  it('devolve o dia quando ele existe no mês', () => {
    expect(diaSeguro(25, 2026, 8)).toBe(25);
  });

  it('encurta o dia 31 para o último dia de fevereiro', () => {
    expect(diaSeguro(31, 2026, 2)).toBe(28);
    expect(diaSeguro(31, 2024, 2)).toBe(29);
  });

  it('encurta o dia 31 para 30 em meses de 30 dias', () => {
    expect(diaSeguro(31, 2026, 4)).toBe(30);
  });
});
