import { describe, expect, it } from 'vitest';
import { criarCategoria } from './categorias';
import {
  definirAlocacao,
  listarAlocacoes,
  orcamentosDoMes,
  removerAlocacao,
} from './orcamentos';
import { comRollback } from './rollback';

describe('definirAlocacao e listarAlocacoes', () => {
  it('grava uma linha por mudança', async () => {
    await comRollback(async (tx) => {
      const cat = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
      await definirAlocacao(
        { budgetCategoryId: cat.id, vigenteDe: '2026-08', valorCentavos: 100000 },
        tx,
      );
      await definirAlocacao(
        { budgetCategoryId: cat.id, vigenteDe: '2026-09', valorCentavos: 80000 },
        tx,
      );

      const alocacoes = await listarAlocacoes(cat.id, tx);
      expect(alocacoes).toEqual([
        { vigenteDe: '2026-08', valorCentavos: 100000 },
        { vigenteDe: '2026-09', valorCentavos: 80000 },
      ]);
    });
  });

  it('redefinir a mesma vigência substitui em vez de duplicar', async () => {
    await comRollback(async (tx) => {
      const cat = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
      await definirAlocacao(
        { budgetCategoryId: cat.id, vigenteDe: '2026-08', valorCentavos: 100000 },
        tx,
      );
      await definirAlocacao(
        { budgetCategoryId: cat.id, vigenteDe: '2026-08', valorCentavos: 120000 },
        tx,
      );

      const alocacoes = await listarAlocacoes(cat.id, tx);
      expect(alocacoes).toEqual([{ vigenteDe: '2026-08', valorCentavos: 120000 }]);
    });
  });

  it('rejeita valor negativo', async () => {
    await comRollback(async (tx) => {
      const cat = await criarCategoria({ nome: 'X', corSlot: 1 }, tx);
      await expect(
        definirAlocacao(
          { budgetCategoryId: cat.id, vigenteDe: '2026-08', valorCentavos: -1 },
          tx,
        ),
      ).rejects.toThrow();
    });
  });

  it('rejeita competência em formato inválido', async () => {
    await comRollback(async (tx) => {
      const cat = await criarCategoria({ nome: 'X', corSlot: 1 }, tx);
      await expect(
        definirAlocacao(
          { budgetCategoryId: cat.id, vigenteDe: '08/2026', valorCentavos: 1000 },
          tx,
        ),
      ).rejects.toThrow();
    });
  });
});

describe('removerAlocacao', () => {
  it('remove só a linha daquela vigência', async () => {
    await comRollback(async (tx) => {
      const cat = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
      await definirAlocacao(
        { budgetCategoryId: cat.id, vigenteDe: '2026-08', valorCentavos: 100000 },
        tx,
      );
      await definirAlocacao(
        { budgetCategoryId: cat.id, vigenteDe: '2026-09', valorCentavos: 80000 },
        tx,
      );

      await removerAlocacao(cat.id, '2026-09', tx);

      expect(await listarAlocacoes(cat.id, tx)).toEqual([
        { vigenteDe: '2026-08', valorCentavos: 100000 },
      ]);
    });
  });
});

describe('orcamentosDoMes', () => {
  it('reproduz a herança do spec: alterar dezembro não mexe em outubro', async () => {
    await comRollback(async (tx) => {
      const cat = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
      for (const [vigenteDe, valorCentavos] of [
        ['2026-08', 100000],
        ['2026-09', 80000],
        ['2026-12', 60000],
      ] as const) {
        await definirAlocacao({ budgetCategoryId: cat.id, vigenteDe, valorCentavos }, tx);
      }

      const valorEm = async (mes: string) => {
        const lista = await orcamentosDoMes(mes, tx);
        return lista.find((o) => o.categoriaId === cat.id)!.valorCentavos;
      };

      expect(await valorEm('2026-08')).toBe(100000);
      expect(await valorEm('2026-09')).toBe(80000);
      expect(await valorEm('2026-10')).toBe(80000);
      expect(await valorEm('2026-11')).toBe(80000);
      expect(await valorEm('2026-12')).toBe(60000);
      expect(await valorEm('2027-01')).toBe(60000);
    });
  });

  it('distingue herdado de definido no próprio mês', async () => {
    await comRollback(async (tx) => {
      const cat = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
      await definirAlocacao(
        { budgetCategoryId: cat.id, vigenteDe: '2026-09', valorCentavos: 80000 },
        tx,
      );

      const setembro = (await orcamentosDoMes('2026-09', tx)).find(
        (o) => o.categoriaId === cat.id,
      )!;
      expect(setembro.vigenteDe).toBe('2026-09');

      const novembro = (await orcamentosDoMes('2026-11', tx)).find(
        (o) => o.categoriaId === cat.id,
      )!;
      expect(novembro.vigenteDe).toBe('2026-09');
    });
  });

  it('categoria sem alocação vigente aparece com zero e sem origem', async () => {
    await comRollback(async (tx) => {
      const cat = await criarCategoria({ nome: 'Nova', corSlot: 3 }, tx);
      const lista = await orcamentosDoMes('2026-09', tx);
      const nova = lista.find((o) => o.categoriaId === cat.id)!;
      expect(nova.valorCentavos).toBe(0);
      expect(nova.vigenteDe).toBeNull();
    });
  });

  it('traz o nome e a cor da categoria junto', async () => {
    await comRollback(async (tx) => {
      const cat = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
      const lista = await orcamentosDoMes('2026-09', tx);
      const alimentacao = lista.find((o) => o.categoriaId === cat.id)!;
      expect(alimentacao.nome).toBe('Alimentação');
      expect(alimentacao.corSlot).toBe(2);
    });
  });
});
