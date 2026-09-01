import { describe, expect, it } from 'vitest';

import {
  MESES_PARA_FRENTE,
  MESES_PARA_TRAS,
  type PontoDoFluxo,
  alturaDaColuna,
  escalaDoFluxo,
  janelaDeMeses,
  momentoDoMes,
} from './fluxo';

describe('janelaDeMeses', () => {
  it('devolve treze meses com o central no meio', () => {
    const meses = janelaDeMeses('2026-09');

    expect(meses).toHaveLength(MESES_PARA_TRAS + 1 + MESES_PARA_FRENTE);
    expect(meses[MESES_PARA_TRAS]).toBe('2026-09');
    expect(meses[0]).toBe('2026-03');
    expect(meses[meses.length - 1]).toBe('2027-03');
  });

  it('atravessa a virada de ano', () => {
    const meses = janelaDeMeses('2026-01');

    expect(meses[0]).toBe('2025-07');
    expect(meses[meses.length - 1]).toBe('2026-07');
  });

  it('sai em ordem cronológica crescente', () => {
    const meses = janelaDeMeses('2026-09');
    const ordenados = [...meses].sort();

    expect(meses).toEqual(ordenados);
  });
});

describe('momentoDoMes', () => {
  it('classifica passado, corrente e futuro', () => {
    expect(momentoDoMes('2026-08', '2026-09')).toBe('PASSADO');
    expect(momentoDoMes('2026-09', '2026-09')).toBe('CORRENTE');
    expect(momentoDoMes('2026-10', '2026-09')).toBe('FUTURO');
  });

  it('compara lexicograficamente, sem se enganar com dezembro', () => {
    expect(momentoDoMes('2026-12', '2027-01')).toBe('PASSADO');
    expect(momentoDoMes('2027-01', '2026-12')).toBe('FUTURO');
  });
});

function ponto(competencia: string, sobraCentavos: number): PontoDoFluxo {
  return {
    competencia,
    momento: 'PASSADO',
    receitaCentavos: 0,
    despesaCentavos: 0,
    sobraCentavos,
  };
}

describe('escalaDoFluxo', () => {
  it('é o maior valor absoluto da janela', () => {
    expect(
      escalaDoFluxo([ponto('2026-08', 30000), ponto('2026-09', 12000)]),
    ).toBe(30000);
  });

  it('considera o módulo dos negativos', () => {
    expect(
      escalaDoFluxo([ponto('2026-08', 12000), ponto('2026-09', -45000)]),
    ).toBe(45000);
  });

  it('tudo zero devolve 1, para nunca dividir por zero', () => {
    expect(escalaDoFluxo([ponto('2026-08', 0), ponto('2026-09', 0)])).toBe(1);
  });

  it('janela vazia devolve 1', () => {
    expect(escalaDoFluxo([])).toBe(1);
  });
});

describe('alturaDaColuna', () => {
  it('é proporcional à escala', () => {
    expect(alturaDaColuna(5000, 10000)).toBe(50);
    expect(alturaDaColuna(10000, 10000)).toBe(100);
  });

  it('usa o módulo do valor negativo', () => {
    expect(alturaDaColuna(-5000, 10000)).toBe(50);
  });

  it('nunca passa de 100 nem fica abaixo de zero', () => {
    expect(alturaDaColuna(30000, 10000)).toBe(100);
    expect(alturaDaColuna(0, 10000)).toBe(0);
  });

  it('escala não positiva devolve zero em vez de NaN', () => {
    expect(alturaDaColuna(5000, 0)).toBe(0);
    expect(Number.isNaN(alturaDaColuna(5000, 0))).toBe(false);
  });
});
