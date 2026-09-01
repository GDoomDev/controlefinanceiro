import { describe, expect, it } from 'vitest';
import { comRollback } from './rollback';
import {
  apagarReceita,
  apagarReceitaPrevista,
  criarReceita,
  criarReceitaPrevista,
  listarReceitas,
  listarReceitasPrevistas,
  receitaPrevistaDoMes,
  receitaRealizadaDoMes,
} from './receitas';

const salario = {
  descricao: 'Salário',
  valorCentavos: 609000,
  data: '2099-09-05',
  metodo: 'PIX' as const,
};

describe('criarReceita', () => {
  it('grava na competência do mês da própria data', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarReceita(salario, tx);
      const lista = await listarReceitas('2099-09', tx);
      const criada = lista.find((r) => r.id === id);
      expect(criada?.descricao).toBe('Salário');
      expect(criada?.valorCentavos).toBe(609000);
      expect(criada?.competencia).toBe('2099-09');
    });
  });

  it('não vincula categoria, subcategoria, cartão nem fatura', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarReceita(salario, tx);
      const linha = await tx.transaction.findUnique({
        where: { id },
        select: {
          tipo: true,
          budgetCategoryId: true,
          subcategoryId: true,
          cardId: true,
          invoiceId: true,
        },
      });
      expect(linha?.tipo).toBe('RECEITA');
      expect(linha?.budgetCategoryId).toBeNull();
      expect(linha?.subcategoryId).toBeNull();
      expect(linha?.cardId).toBeNull();
      expect(linha?.invoiceId).toBeNull();
    });
  });

  it('não aparece na listagem de despesas de nenhum mês', async () => {
    await comRollback(async (tx) => {
      await criarReceita(salario, tx);
      const despesas = await tx.transaction.findMany({
        where: { competencia: '2099-09', tipo: 'DESPESA' },
        select: { descricao: true },
      });
      expect(despesas.map((d) => d.descricao)).not.toContain('Salário');
    });
  });

  it('rejeita valor zero ou negativo', async () => {
    await comRollback(async (tx) => {
      await expect(criarReceita({ ...salario, valorCentavos: 0 }, tx)).rejects.toThrow();
      await expect(
        criarReceita({ ...salario, valorCentavos: -100 }, tx),
      ).rejects.toThrow();
    });
  });

  it('rejeita data em formato inválido', async () => {
    await comRollback(async (tx) => {
      await expect(criarReceita({ ...salario, data: '05/09/2026' }, tx)).rejects.toThrow();
    });
  });

  it('rejeita descrição vazia', async () => {
    await comRollback(async (tx) => {
      await expect(criarReceita({ ...salario, descricao: '  ' }, tx)).rejects.toThrow();
    });
  });
});

describe('receitaRealizadaDoMes', () => {
  it('soma as receitas daquele mês', async () => {
    await comRollback(async (tx) => {
      await criarReceita(salario, tx);
      await criarReceita(
        { descricao: 'Freela', valorCentavos: 150000, data: '2099-09-20', metodo: 'PIX' },
        tx,
      );
      await criarReceita({ ...salario, data: '2099-10-05' }, tx);

      expect(await receitaRealizadaDoMes('2099-09', tx)).toBe(759000);
      expect(await receitaRealizadaDoMes('2099-10', tx)).toBe(609000);
    });
  });

  it('é zero num mês sem receita', async () => {
    await comRollback(async (tx) => {
      expect(await receitaRealizadaDoMes('2099-09', tx)).toBe(0);
    });
  });
});

describe('apagarReceita', () => {
  it('remove a receita da listagem e da soma', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarReceita(salario, tx);
      await apagarReceita(id, tx);
      expect(await listarReceitas('2099-09', tx)).toEqual([]);
      expect(await receitaRealizadaDoMes('2099-09', tx)).toBe(0);
    });
  });
});

describe('receita prevista', () => {
  it('cria, lista e soma', async () => {
    await comRollback(async (tx) => {
      await criarReceitaPrevista(
        { competencia: '2099-10', descricao: 'Salário', valorCentavos: 609000 },
        tx,
      );
      await criarReceitaPrevista(
        { competencia: '2099-10', descricao: 'Aluguel recebido', valorCentavos: 120000 },
        tx,
      );

      const lista = await listarReceitasPrevistas('2099-10', tx);
      expect(lista).toHaveLength(2);
      expect(await receitaPrevistaDoMes('2099-10', tx)).toBe(729000);
    });
  });

  it('é zero num mês sem previsão', async () => {
    await comRollback(async (tx) => {
      expect(await receitaPrevistaDoMes('2099-10', tx)).toBe(0);
    });
  });

  it('não se mistura com a receita realizada', async () => {
    await comRollback(async (tx) => {
      await criarReceita({ ...salario, data: '2099-10-05' }, tx);
      await criarReceitaPrevista(
        { competencia: '2099-10', descricao: 'Salário', valorCentavos: 609000 },
        tx,
      );

      expect(await receitaRealizadaDoMes('2099-10', tx)).toBe(609000);
      expect(await receitaPrevistaDoMes('2099-10', tx)).toBe(609000);
      expect(await listarReceitas('2099-10', tx)).toHaveLength(1);
      expect(await listarReceitasPrevistas('2099-10', tx)).toHaveLength(1);
    });
  });

  it('apaga uma previsão', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarReceitaPrevista(
        { competencia: '2099-10', descricao: 'Salário', valorCentavos: 609000 },
        tx,
      );
      await apagarReceitaPrevista(id, tx);
      expect(await receitaPrevistaDoMes('2099-10', tx)).toBe(0);
    });
  });

  it('rejeita valor zero ou negativo e competência inválida', async () => {
    await comRollback(async (tx) => {
      await expect(
        criarReceitaPrevista(
          { competencia: '2099-10', descricao: 'X', valorCentavos: 0 },
          tx,
        ),
      ).rejects.toThrow();
      await expect(
        criarReceitaPrevista(
          { competencia: '10/2026', descricao: 'X', valorCentavos: 1000 },
          tx,
        ),
      ).rejects.toThrow();
    });
  });
});
