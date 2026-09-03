import { describe, expect, it } from 'vitest';
import {
  buscarCartao,
  criarCartao,
  editarCartao,
  arquivarCartao,
  listarCartoes,
  regraDoCartao,
} from './cartoes';
import { comRollback } from './rollback';

describe('criarCartao', () => {
  it('cria e recupera pelo id', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarCartao(
        { nome: 'Nubank', diaFechamento: 25, diaVencimento: 5 },
        tx,
      );
      const cartao = await buscarCartao(id, tx);
      expect(cartao).toEqual({
        id,
        nome: 'Nubank',
        diaFechamento: 25,
        diaVencimento: 5,
        ativo: true,
      });
    });
  });

  it('aparece na listagem', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarCartao(
        { nome: 'Itaú', diaFechamento: 10, diaVencimento: 20 },
        tx,
      );
      const lista = await listarCartoes(tx);
      expect(lista.map((c) => c.id)).toContain(id);
    });
  });

  it('rejeita dias fora de 1..31', async () => {
    await comRollback(async (tx) => {
      await expect(
        criarCartao({ nome: 'A', diaFechamento: 0, diaVencimento: 5 }, tx),
      ).rejects.toThrow();
      await expect(
        criarCartao({ nome: 'B', diaFechamento: 25, diaVencimento: 32 }, tx),
      ).rejects.toThrow();
    });
  });

  it('rejeita nome vazio', async () => {
    await comRollback(async (tx) => {
      await expect(
        criarCartao({ nome: '  ', diaFechamento: 25, diaVencimento: 5 }, tx),
      ).rejects.toThrow();
    });
  });
});

describe('editarCartao', () => {
  it('atualiza nome e dias, refletidos na busca', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarCartao(
        { nome: 'Nubank', diaFechamento: 25, diaVencimento: 5 },
        tx,
      );
      await editarCartao(
        id,
        { nome: 'Nubank Ultravioleta', diaFechamento: 20, diaVencimento: 27 },
        tx,
      );
      const cartao = await buscarCartao(id, tx);
      expect(cartao).toEqual({
        id,
        nome: 'Nubank Ultravioleta',
        diaFechamento: 20,
        diaVencimento: 27,
        ativo: true,
      });
    });
  });

  it('rejeita dias fora de 1..31', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarCartao(
        { nome: 'Nubank', diaFechamento: 25, diaVencimento: 5 },
        tx,
      );
      await expect(
        editarCartao(id, { nome: 'Nubank', diaFechamento: 0, diaVencimento: 5 }, tx),
      ).rejects.toThrow();
    });
  });

  it('rejeita nome vazio', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarCartao(
        { nome: 'Nubank', diaFechamento: 25, diaVencimento: 5 },
        tx,
      );
      await expect(
        editarCartao(id, { nome: '  ', diaFechamento: 25, diaVencimento: 5 }, tx),
      ).rejects.toThrow();
    });
  });
});

describe('arquivarCartao', () => {
  it('some da listagem depois de arquivado', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarCartao(
        { nome: 'Cartão Temporário', diaFechamento: 10, diaVencimento: 20 },
        tx,
      );
      await arquivarCartao(id, tx);
      const lista = await listarCartoes(tx);
      expect(lista.find((c) => c.id === id)).toBeUndefined();
    });
  });
});

describe('buscarCartao', () => {
  it('devolve null para id inexistente', async () => {
    await comRollback(async (tx) => {
      expect(await buscarCartao('nao-existe', tx)).toBeNull();
    });
  });
});

describe('regraDoCartao', () => {
  it('extrai apenas os dois dias que o domínio precisa', () => {
    const regra = regraDoCartao({
      id: 'x',
      nome: 'Nubank',
      diaFechamento: 25,
      diaVencimento: 5,
      ativo: true,
    });
    expect(regra).toEqual({ diaFechamento: 25, diaVencimento: 5 });
  });
});
