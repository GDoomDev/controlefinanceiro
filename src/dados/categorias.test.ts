import { describe, expect, it } from 'vitest';
import {
  arquivarCategoria,
  criarCategoria,
  criarSubcategoria,
  listarCategorias,
  slotsEmUso,
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

describe('criarCategoria — cor', () => {
  it('rejeita quando não informa nem slot nem personalizada', async () => {
    await comRollback(async (tx) => {
      await expect(
        criarCategoria({ nome: 'Sem cor', corSlot: null }, tx),
      ).rejects.toThrow('exatamente uma cor');
    });
  });

  it('rejeita quando informa slot e personalizada ao mesmo tempo', async () => {
    await comRollback(async (tx) => {
      await expect(
        criarCategoria(
          { nome: 'Duas cores', corSlot: 1, corPersonalizada: '#123456' },
          tx,
        ),
      ).rejects.toThrow('exatamente uma cor');
    });
  });

  it('rejeita cor personalizada em formato inválido', async () => {
    await comRollback(async (tx) => {
      await expect(
        criarCategoria(
          { nome: 'Cor ruim', corSlot: null, corPersonalizada: 'não é hex' },
          tx,
        ),
      ).rejects.toThrow('esperado "#rrggbb"');
    });
  });

  it('aceita cor personalizada válida e não ocupa slot nenhum', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarCategoria(
        { nome: 'Cor livre', corSlot: null, corPersonalizada: '#a1b2c3' },
        tx,
      );
      const lista = await listarCategorias(tx);
      const criada = lista.find((c) => c.id === id)!;
      expect(criada.corSlot).toBeNull();
      expect(criada.corPersonalizada).toBe('#a1b2c3');

      const ocupados = await slotsEmUso(tx);
      expect(ocupados).toEqual([]);
    });
  });

  it('rejeita slot já ocupado por outra categoria ativa', async () => {
    await comRollback(async (tx) => {
      await criarCategoria({ nome: 'Primeira do slot', corSlot: 4 }, tx);
      await expect(
        criarCategoria({ nome: 'Segunda do slot', corSlot: 4 }, tx),
      ).rejects.toThrow('já está em uso');
    });
  });

  it('libera o slot quando a categoria dona é arquivada', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarCategoria({ nome: 'Vai arquivar', corSlot: 5 }, tx);
      await arquivarCategoria(id, tx);

      // Não lança — o slot 5 está livre de novo.
      const { id: novoId } = await criarCategoria({ nome: 'Reusa o slot', corSlot: 5 }, tx);
      expect(novoId).toBeDefined();
    });
  });
});

describe('slotsEmUso', () => {
  it('lista os slots ocupados com o nome de quem ocupa', async () => {
    await comRollback(async (tx) => {
      const a = await criarCategoria({ nome: 'Ocupante A', corSlot: 1 }, tx);
      await criarCategoria({ nome: 'Ocupante B', corSlot: 3 }, tx);

      const ocupados = await slotsEmUso(tx);
      const doA = ocupados.find((o) => o.slot === 1);
      expect(doA).toEqual({ slot: 1, categoriaNome: 'Ocupante A' });
      expect(ocupados.some((o) => o.slot === 3)).toBe(true);
      expect(a.id).toBeDefined();
    });
  });

  it('não conta categoria com cor personalizada', async () => {
    await comRollback(async (tx) => {
      await criarCategoria(
        { nome: 'Personalizada', corSlot: null, corPersonalizada: '#000000' },
        tx,
      );
      const ocupados = await slotsEmUso(tx);
      expect(ocupados).toEqual([]);
    });
  });
});
