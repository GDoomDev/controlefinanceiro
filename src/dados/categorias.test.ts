import { describe, expect, it } from 'vitest';
import {
  arquivarCategoria,
  criarCategoria,
  criarSubcategoria,
  listarCategorias,
} from './categorias';
import { comRollback } from './rollback';

describe('criarCategoria', () => {
  it('cria e aparece na listagem', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
      const lista = await listarCategorias(tx);
      const criada = lista.find((c) => c.id === id);
      expect(criada?.nome).toBe('Alimentação');
      expect(criada?.corSlot).toBe(2);
      expect(criada?.subcategorias).toEqual([]);
    });
  });

  it('atribui ordem crescente automaticamente', async () => {
    await comRollback(async (tx) => {
      const a = await criarCategoria({ nome: 'Primeira', corSlot: 1 }, tx);
      const b = await criarCategoria({ nome: 'Segunda', corSlot: 2 }, tx);
      const lista = await listarCategorias(tx);
      const ordemA = lista.find((c) => c.id === a.id)!.ordem;
      const ordemB = lista.find((c) => c.id === b.id)!.ordem;
      expect(ordemB).toBeGreaterThan(ordemA);
    });
  });

  it('rejeita corSlot fora de 1..6', async () => {
    await comRollback(async (tx) => {
      await expect(criarCategoria({ nome: 'X', corSlot: 0 }, tx)).rejects.toThrow();
      await expect(criarCategoria({ nome: 'Y', corSlot: 7 }, tx)).rejects.toThrow();
    });
  });

  it('rejeita nome vazio', async () => {
    await comRollback(async (tx) => {
      await expect(criarCategoria({ nome: '   ', corSlot: 1 }, tx)).rejects.toThrow();
    });
  });
});

describe('criarSubcategoria', () => {
  it('vincula a subcategoria ao orçamento pai', async () => {
    await comRollback(async (tx) => {
      const cat = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
      await criarSubcategoria({ budgetCategoryId: cat.id, nome: 'Delivery' }, tx);
      await criarSubcategoria({ budgetCategoryId: cat.id, nome: 'Mercado' }, tx);

      const lista = await listarCategorias(tx);
      const nomes = lista.find((c) => c.id === cat.id)!.subcategorias.map((s) => s.nome);
      expect(nomes).toEqual(['Delivery', 'Mercado']);
    });
  });

  it('rejeita subcategoria duplicada dentro do mesmo orçamento', async () => {
    await comRollback(async (tx) => {
      const cat = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
      await criarSubcategoria({ budgetCategoryId: cat.id, nome: 'Delivery' }, tx);
      await expect(
        criarSubcategoria({ budgetCategoryId: cat.id, nome: 'Delivery' }, tx),
      ).rejects.toThrow();
    });
  });
});

describe('arquivarCategoria', () => {
  it('some da listagem depois de arquivada', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarCategoria({ nome: 'Temporária', corSlot: 3 }, tx);
      await arquivarCategoria(id, tx);
      const lista = await listarCategorias(tx);
      expect(lista.find((c) => c.id === id)).toBeUndefined();
    });
  });
});
