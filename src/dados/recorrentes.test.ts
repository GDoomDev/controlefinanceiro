import { describe, expect, it } from 'vitest';

import { criarCartao } from './cartoes';
import { criarCategoria, criarSubcategoria } from './categorias';
import { totalDaFatura } from './faturas';
import {
  criarRecorrencia,
  editarRecorrencia,
  encerrarRecorrencia,
  listarRecorrentes,
  materializarRecorrentes,
  pausarRecorrencia,
  retomarRecorrencia,
} from './recorrentes';
import { comRollback } from './rollback';
import type { ClientePrisma } from './tipos';

async function cenario(tx: ClientePrisma) {
  const categoria = await criarCategoria({ nome: 'Assinaturas', corSlot: 4 }, tx);
  const sub = await criarSubcategoria(
    { budgetCategoryId: categoria.id, nome: 'Streaming' },
    tx,
  );
  return { categoria, sub };
}

describe('criarRecorrencia', () => {
  it('cria e aparece na listagem, com os nomes de categoria/subcategoria', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);

      const { id } = await criarRecorrencia(
        {
          descricao: 'Streaming X',
          valorCentavos: 2990,
          diaDoMes: 10,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-01',
        },
        tx,
      );

      const lista = await listarRecorrentes(tx);
      const r = lista.find((x) => x.id === id)!;
      expect(r.descricao).toBe('Streaming X');
      expect(r.valorCentavos).toBe(2990);
      expect(r.categoriaNome).toBe('Assinaturas');
      expect(r.subcategoriaNome).toBe('Streaming');
      expect(r.cartaoNome).toBeNull();
      expect(r.ativa).toBe(true);
      expect(r.fim).toBeNull();
    });
  });

  it('rejeita descrição vazia', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);

      await expect(
        criarRecorrencia(
          {
            descricao: '   ',
            valorCentavos: 1000,
            diaDoMes: 5,
            budgetCategoryId: categoria.id,
            subcategoryId: sub.id,
            metodo: 'PIX',
            cardId: null,
            inicio: '2099-01',
          },
          tx,
        ),
      ).rejects.toThrow('Descrição não pode ser vazia');
    });
  });

  it('rejeita valor zero ou negativo', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);

      await expect(
        criarRecorrencia(
          {
            descricao: 'Teste',
            valorCentavos: 0,
            diaDoMes: 5,
            budgetCategoryId: categoria.id,
            subcategoryId: sub.id,
            metodo: 'PIX',
            cardId: null,
            inicio: '2099-01',
          },
          tx,
        ),
      ).rejects.toThrow('inteiro positivo');
    });
  });

  it('rejeita dia do mês fora de 1..31', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);

      await expect(
        criarRecorrencia(
          {
            descricao: 'Teste',
            valorCentavos: 1000,
            diaDoMes: 32,
            budgetCategoryId: categoria.id,
            subcategoryId: sub.id,
            metodo: 'PIX',
            cardId: null,
            inicio: '2099-01',
          },
          tx,
        ),
      ).rejects.toThrow('entre 1 e 31');
    });
  });

  it('rejeita subcategoria que pertence a outro orçamento', async () => {
    await comRollback(async (tx) => {
      const { categoria } = await cenario(tx);
      const outraCategoria = await criarCategoria({ nome: 'Lazer fixo', corSlot: 3 }, tx);
      const subDeOutra = await criarSubcategoria(
        { budgetCategoryId: outraCategoria.id, nome: 'Jogos' },
        tx,
      );

      await expect(
        criarRecorrencia(
          {
            descricao: 'Teste',
            valorCentavos: 1000,
            diaDoMes: 5,
            budgetCategoryId: categoria.id,
            subcategoryId: subDeOutra.id,
            metodo: 'PIX',
            cardId: null,
            inicio: '2099-01',
          },
          tx,
        ),
      ).rejects.toThrow('hierarquia é estrita');
    });
  });

  it('rejeita crédito sem cartão', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);

      await expect(
        criarRecorrencia(
          {
            descricao: 'Teste',
            valorCentavos: 1000,
            diaDoMes: 5,
            budgetCategoryId: categoria.id,
            subcategoryId: sub.id,
            metodo: 'CREDITO',
            cardId: null,
            inicio: '2099-01',
          },
          tx,
        ),
      ).rejects.toThrow('exige um cartão');
    });
  });

  it('zera cardId quando o método não é crédito, mesmo que a entrada mande um cartão', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const cartao = await criarCartao(
        { nome: 'Cartão das fixas', diaFechamento: 10, diaVencimento: 20 },
        tx,
      );

      const { id } = await criarRecorrencia(
        {
          descricao: 'Teste',
          valorCentavos: 1000,
          diaDoMes: 5,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: cartao.id,
          inicio: '2099-01',
        },
        tx,
      );

      const r = (await listarRecorrentes(tx)).find((x) => x.id === id)!;
      expect(r.cardId).toBeNull();
    });
  });

  it('rejeita competência de início em formato inválido', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);

      await expect(
        criarRecorrencia(
          {
            descricao: 'Teste',
            valorCentavos: 1000,
            diaDoMes: 5,
            budgetCategoryId: categoria.id,
            subcategoryId: sub.id,
            metodo: 'PIX',
            cardId: null,
            inicio: '2099/01',
          },
          tx,
        ),
      ).rejects.toThrow('Competência inválida');
    });
  });

  it('rejeita competência de início com mês inexistente', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);

      await expect(
        criarRecorrencia(
          {
            descricao: 'Teste',
            valorCentavos: 1000,
            diaDoMes: 5,
            budgetCategoryId: categoria.id,
            subcategoryId: sub.id,
            metodo: 'PIX',
            cardId: null,
            inicio: '2099-13',
          },
          tx,
        ),
      ).rejects.toThrow('mês inválido');
    });
  });

  it('rejeita crédito com cartão inexistente', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);

      await expect(
        criarRecorrencia(
          {
            descricao: 'Teste',
            valorCentavos: 1000,
            diaDoMes: 5,
            budgetCategoryId: categoria.id,
            subcategoryId: sub.id,
            metodo: 'CREDITO',
            cardId: 'nao-existe',
            inicio: '2099-01',
          },
          tx,
        ),
      ).rejects.toThrow('Cartão não encontrado');
    });
  });
});

describe('editarRecorrencia', () => {
  it('atualiza os campos e reflete na listagem', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const { id } = await criarRecorrencia(
        {
          descricao: 'Streaming X',
          valorCentavos: 2990,
          diaDoMes: 10,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-01',
        },
        tx,
      );

      await editarRecorrencia(
        id,
        {
          descricao: 'Streaming Y',
          valorCentavos: 3990,
          diaDoMes: 15,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
        },
        tx,
      );

      const lista = await listarRecorrentes(tx);
      const r = lista.find((x) => x.id === id)!;
      expect(r.descricao).toBe('Streaming Y');
      expect(r.valorCentavos).toBe(3990);
      expect(r.diaDoMes).toBe(15);
    });
  });

  it('rejeita descrição vazia', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const { id } = await criarRecorrencia(
        {
          descricao: 'Streaming X',
          valorCentavos: 2990,
          diaDoMes: 10,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-01',
        },
        tx,
      );
      await expect(
        editarRecorrencia(
          id,
          {
            descricao: '  ',
            valorCentavos: 2990,
            diaDoMes: 10,
            budgetCategoryId: categoria.id,
            subcategoryId: sub.id,
            metodo: 'PIX',
            cardId: null,
          },
          tx,
        ),
      ).rejects.toThrow();
    });
  });

  it('rejeita subcategoria de outro orçamento', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const outraCategoria = await criarCategoria({ nome: 'Lazer', corSlot: 5 }, tx);
      const outraSub = await criarSubcategoria(
        { budgetCategoryId: outraCategoria.id, nome: 'Cinema' },
        tx,
      );
      const { id } = await criarRecorrencia(
        {
          descricao: 'Streaming X',
          valorCentavos: 2990,
          diaDoMes: 10,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-01',
        },
        tx,
      );
      await expect(
        editarRecorrencia(
          id,
          {
            descricao: 'Streaming X',
            valorCentavos: 2990,
            diaDoMes: 10,
            budgetCategoryId: categoria.id,
            subcategoryId: outraSub.id,
            metodo: 'PIX',
            cardId: null,
          },
          tx,
        ),
      ).rejects.toThrow();
    });
  });

  it('exige cartão quando o método é crédito', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const { id } = await criarRecorrencia(
        {
          descricao: 'Streaming X',
          valorCentavos: 2990,
          diaDoMes: 10,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-01',
        },
        tx,
      );
      await expect(
        editarRecorrencia(
          id,
          {
            descricao: 'Streaming X',
            valorCentavos: 2990,
            diaDoMes: 10,
            budgetCategoryId: categoria.id,
            subcategoryId: sub.id,
            metodo: 'CREDITO',
            cardId: null,
          },
          tx,
        ),
      ).rejects.toThrow();
    });
  });
});

describe('encerrarRecorrencia / pausarRecorrencia / retomarRecorrencia', () => {
  it('encerrarRecorrencia grava o fim', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const { id } = await criarRecorrencia(
        {
          descricao: 'Teste',
          valorCentavos: 1000,
          diaDoMes: 5,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-01',
        },
        tx,
      );

      await encerrarRecorrencia(id, '2099-06', tx);

      const r = (await listarRecorrentes(tx)).find((x) => x.id === id)!;
      expect(r.fim).toBe('2099-06');
    });
  });

  it('rejeita fim anterior ao início', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const { id } = await criarRecorrencia(
        {
          descricao: 'Teste',
          valorCentavos: 1000,
          diaDoMes: 5,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-06',
        },
        tx,
      );

      await expect(encerrarRecorrencia(id, '2099-01', tx)).rejects.toThrow(
        'não pode ser anterior ao início',
      );
    });
  });

  it('rejeita fim com mês inexistente', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const { id } = await criarRecorrencia(
        {
          descricao: 'Teste',
          valorCentavos: 1000,
          diaDoMes: 5,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-01',
        },
        tx,
      );

      await expect(encerrarRecorrencia(id, '2099-13', tx)).rejects.toThrow('mês inválido');
    });
  });

  it('rejeita despesa fixa inexistente', async () => {
    await expect(encerrarRecorrencia('nao-existe', '2099-01')).rejects.toThrow(
      'não encontrada',
    );
  });

  it('pausar e retomar alternam ativa', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const { id } = await criarRecorrencia(
        {
          descricao: 'Teste',
          valorCentavos: 1000,
          diaDoMes: 5,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-01',
        },
        tx,
      );

      await pausarRecorrencia(id, tx);
      expect((await listarRecorrentes(tx)).find((x) => x.id === id)!.ativa).toBe(false);

      await retomarRecorrencia(id, tx);
      expect((await listarRecorrentes(tx)).find((x) => x.id === id)!.ativa).toBe(true);
    });
  });
});

describe('materializarRecorrentes', () => {
  it('cria o lançamento do mês vigente, vinculado à recorrência', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const { id } = await criarRecorrencia(
        {
          descricao: 'Streaming X',
          valorCentavos: 2990,
          diaDoMes: 10,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-01',
        },
        tx,
      );

      const resultado = await materializarRecorrentes('2099-03', tx);
      expect(resultado.criadas).toBe(1);

      const linha = await tx.transaction.findFirstOrThrow({
        where: { recorrenciaId: id, competencia: '2099-03' },
      });
      expect(linha.valorCentavos).toBe(2990);
      expect(linha.data).toBe('2099-03-10');
      expect(linha.tipo).toBe('DESPESA');
      expect(linha.status).toBe('ATIVA');
      expect(linha.parcelaNum).toBe(1);
      expect(linha.parcelaTotal).toBe(1);
    });
  });

  it('é idempotente: chamar duas vezes na mesma competência não duplica', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const { id } = await criarRecorrencia(
        {
          descricao: 'Streaming X',
          valorCentavos: 2990,
          diaDoMes: 10,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-01',
        },
        tx,
      );

      const primeira = await materializarRecorrentes('2099-03', tx);
      const segunda = await materializarRecorrentes('2099-03', tx);

      expect(primeira.criadas).toBe(1);
      expect(segunda.criadas).toBe(0);

      const linhas = await tx.transaction.findMany({
        where: { recorrenciaId: id, competencia: '2099-03' },
      });
      expect(linhas).toHaveLength(1);
    });
  });

  it('não materializa antes do início', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      await criarRecorrencia(
        {
          descricao: 'Teste',
          valorCentavos: 1000,
          diaDoMes: 5,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-06',
        },
        tx,
      );

      const resultado = await materializarRecorrentes('2099-05', tx);
      expect(resultado.criadas).toBe(0);
    });
  });

  it('não materializa depois do fim', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const { id } = await criarRecorrencia(
        {
          descricao: 'Teste',
          valorCentavos: 1000,
          diaDoMes: 5,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-01',
        },
        tx,
      );
      await encerrarRecorrencia(id, '2099-03', tx);

      const resultado = await materializarRecorrentes('2099-04', tx);
      expect(resultado.criadas).toBe(0);
    });
  });

  it('não materializa quando pausada', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const { id } = await criarRecorrencia(
        {
          descricao: 'Teste',
          valorCentavos: 1000,
          diaDoMes: 5,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-01',
        },
        tx,
      );
      await pausarRecorrencia(id, tx);

      const resultado = await materializarRecorrentes('2099-03', tx);
      expect(resultado.criadas).toBe(0);
    });
  });

  it('usa dia seguro quando diaDoMes não existe naquele mês', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const { id } = await criarRecorrencia(
        {
          descricao: 'Teste',
          valorCentavos: 1000,
          diaDoMes: 31,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-01',
        },
        tx,
      );

      // Abril de 2099 tem 30 dias.
      await materializarRecorrentes('2099-04', tx);

      const linha = await tx.transaction.findFirstOrThrow({
        where: { recorrenciaId: id, competencia: '2099-04' },
      });
      expect(linha.data).toBe('2099-04-30');
    });
  });

  it('crédito: garante a fatura do cartão naquela competência e vincula o lançamento a ela', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const cartao = await criarCartao(
        { nome: 'Cartão das fixas', diaFechamento: 10, diaVencimento: 20 },
        tx,
      );
      const { id } = await criarRecorrencia(
        {
          descricao: 'Streaming no crédito',
          valorCentavos: 3990,
          diaDoMes: 15,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'CREDITO',
          cardId: cartao.id,
          inicio: '2099-01',
        },
        tx,
      );

      await materializarRecorrentes('2099-03', tx);

      const linha = await tx.transaction.findFirstOrThrow({
        where: { recorrenciaId: id, competencia: '2099-03' },
        select: { invoiceId: true, cardId: true },
      });
      expect(linha.cardId).toBe(cartao.id);
      expect(linha.invoiceId).not.toBeNull();

      const fatura = await tx.invoice.findUniqueOrThrow({
        where: { id: linha.invoiceId! },
      });
      expect(fatura.competencia).toBe('2099-03');
      expect(await totalDaFatura(fatura.id, tx)).toBe(3990);
    });
  });

  it('materializa mais de uma recorrência vigente no mesmo mês', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      await criarRecorrencia(
        {
          descricao: 'Fixa 1',
          valorCentavos: 1000,
          diaDoMes: 5,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-01',
        },
        tx,
      );
      await criarRecorrencia(
        {
          descricao: 'Fixa 2',
          valorCentavos: 2000,
          diaDoMes: 15,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-01',
        },
        tx,
      );

      const resultado = await materializarRecorrentes('2099-03', tx);
      expect(resultado.criadas).toBe(2);
    });
  });

  it('materializa duas recorrências CREDITO no mesmo cartão sem colidir na criação da fatura', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const cartao = await criarCartao(
        { nome: 'Cartão das fixas', diaFechamento: 10, diaVencimento: 20 },
        tx,
      );
      await criarRecorrencia(
        {
          descricao: 'Netflix',
          valorCentavos: 2990,
          diaDoMes: 5,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'CREDITO',
          cardId: cartao.id,
          inicio: '2099-01',
        },
        tx,
      );
      await criarRecorrencia(
        {
          descricao: 'Spotify',
          valorCentavos: 1990,
          diaDoMes: 8,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'CREDITO',
          cardId: cartao.id,
          inicio: '2099-01',
        },
        tx,
      );

      const resultado = await materializarRecorrentes('2099-03', tx);
      expect(resultado.criadas).toBe(2);

      const linhas = await tx.transaction.findMany({
        where: { competencia: '2099-03', cardId: cartao.id },
        select: { invoiceId: true },
      });
      expect(linhas).toHaveLength(2);
      expect(linhas[0]!.invoiceId).not.toBeNull();
      expect(linhas[0]!.invoiceId).toBe(linhas[1]!.invoiceId);

      const faturas = await tx.invoice.findMany({
        where: { cardId: cartao.id, competencia: '2099-03' },
      });
      expect(faturas).toHaveLength(1);
    });
  });

  it('rejeita competência em formato inválido', async () => {
    await expect(materializarRecorrentes('2099/03')).rejects.toThrow(
      'Competência inválida',
    );
  });

  it('rejeita competência com mês inexistente mesmo sem nenhuma recorrência vigente', async () => {
    await expect(materializarRecorrentes('2099-13')).rejects.toThrow('mês inválido');
  });
});
