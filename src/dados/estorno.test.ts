import { describe, expect, it, vi } from 'vitest';

import { criarCartao } from './cartoes';
import { criarCategoria, criarSubcategoria } from './categorias';
import { alvoDoEstorno, aplicarEstorno, aplicarEstornoParcial } from './estorno';
import { fecharFatura, totalDaFatura } from './faturas';
import { criarLancamento } from './lancamentos';
import { prisma } from './prisma';
import { comRollback } from './rollback';
import type { ClientePrisma } from './tipos';

async function compraParcelada(tx: ClientePrisma, parcelas: number, valorCentavos: number) {
  const categoria = await criarCategoria({ nome: 'Estornáveis', corSlot: 1 }, tx);
  const sub = await criarSubcategoria(
    { budgetCategoryId: categoria.id, nome: 'TV grande' },
    tx,
  );
  const cartao = await criarCartao(
    { nome: 'Cartão do estorno', diaFechamento: 25, diaVencimento: 5 },
    tx,
  );

  const { ids } = await criarLancamento(
    {
      descricao: 'TV',
      valorCentavos,
      data: '2099-09-10',
      metodo: 'CREDITO',
      cardId: cartao.id,
      budgetCategoryId: categoria.id,
      subcategoryId: sub.id,
      parcelas,
      reembolsoAlvoCentavos: 0,
    },
    tx,
  );

  return { ids, cartao, categoria, sub };
}

describe('alvoDoEstorno', () => {
  it('traz o grupo inteiro quando a compra é parcelada', async () => {
    await comRollback(async (tx) => {
      const { ids } = await compraParcelada(tx, 10, 200000);

      // Pede pela parcela 3: o alvo tem de ser a compra toda.
      const alvo = await alvoDoEstorno(ids[2], tx);

      expect(alvo.parcelas).toHaveLength(10);
      expect(alvo.valorTotalCentavos).toBe(200000);
      expect(alvo.descricao).toBe('TV');
      expect(alvo.grupoParcelamentoId).not.toBeNull();
    });
  });

  it('as parcelas saem em ordem de competência', async () => {
    await comRollback(async (tx) => {
      const { ids } = await compraParcelada(tx, 4, 40000);

      const alvo = await alvoDoEstorno(ids[0], tx);
      const competencias = alvo.parcelas.map((p) => p.competencia);

      expect(competencias).toEqual([...competencias].sort());
    });
  });

  it('uma compra à vista tem uma parcela só e nenhum grupo', async () => {
    await comRollback(async (tx) => {
      const { ids } = await compraParcelada(tx, 1, 50000);

      const alvo = await alvoDoEstorno(ids[0], tx);

      expect(alvo.parcelas).toHaveLength(1);
      expect(alvo.grupoParcelamentoId).toBeNull();
      expect(alvo.valorTotalCentavos).toBe(50000);
    });
  });

  it('parcela sem fatura conta como ABERTA', async () => {
    await comRollback(async (tx) => {
      const categoria = await criarCategoria({ nome: 'Casa do estorno', corSlot: 2 }, tx);
      const sub = await criarSubcategoria(
        { budgetCategoryId: categoria.id, nome: 'Reforma' },
        tx,
      );
      const { ids } = await criarLancamento(
        {
          descricao: 'Pintura',
          valorCentavos: 30000,
          data: '2099-09-10',
          metodo: 'PIX',
          cardId: null,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          parcelas: 1,
          reembolsoAlvoCentavos: 0,
        },
        tx,
      );

      const alvo = await alvoDoEstorno(ids[0], tx);

      expect(alvo.parcelas[0].statusFatura).toBe('ABERTA');
    });
  });

  it('reflete o status real da fatura de cada parcela', async () => {
    await comRollback(async (tx) => {
      const { ids } = await compraParcelada(tx, 3, 30000);

      const primeira = await tx.transaction.findUniqueOrThrow({
        where: { id: ids[0] },
        select: { invoiceId: true },
      });
      await fecharFatura(primeira.invoiceId!, tx);

      const alvo = await alvoDoEstorno(ids[0], tx);
      const p1 = alvo.parcelas.find((p) => p.id === ids[0])!;
      const p2 = alvo.parcelas.find((p) => p.id === ids[1])!;

      expect(p1.statusFatura).toBe('FECHADA');
      expect(p2.statusFatura).toBe('ABERTA');
    });
  });

  it('rejeita lançamento inexistente', async () => {
    await expect(alvoDoEstorno('nao-existe')).rejects.toThrow('não encontrado');
  });
});

describe('aplicarEstorno', () => {
  it('cancela as parcelas ainda não cobradas, sem apagar nenhuma linha', async () => {
    await comRollback(async (tx) => {
      const { ids } = await compraParcelada(tx, 3, 30000);

      await aplicarEstorno(
        {
          transactionId: ids[0],
          modo: 'UNICO',
          competenciaCredito: '2099-10',
          recebidoEm: '2099-10-15',
        },
        tx,
      );

      const linhas = await tx.transaction.findMany({
        where: { id: { in: ids } },
        select: { id: true, status: true },
      });

      // Nenhuma sumiu do banco.
      expect(linhas).toHaveLength(3);
      expect(linhas.every((l) => l.status === 'CANCELADA')).toBe(true);
    });
  });

  it('parcela já cobrada permanece ATIVA e vira crédito de ESTORNO', async () => {
    await comRollback(async (tx) => {
      const { ids } = await compraParcelada(tx, 3, 30000);

      const primeira = await tx.transaction.findUniqueOrThrow({
        where: { id: ids[0] },
        select: { invoiceId: true },
      });
      await fecharFatura(primeira.invoiceId!, tx);

      await aplicarEstorno(
        {
          transactionId: ids[0],
          modo: 'UNICO',
          competenciaCredito: '2099-11',
          recebidoEm: '2099-11-15',
        },
        tx,
      );

      const cobrada = await tx.transaction.findUniqueOrThrow({
        where: { id: ids[0] },
        select: { status: true },
      });
      expect(cobrada.status).toBe('ATIVA');

      const creditos = await tx.credito.findMany({
        where: { transactionId: ids[0] },
        select: { valorCentavos: true, origem: true, competenciaCredito: true },
      });
      expect(creditos).toEqual([
        { valorCentavos: 10000, origem: 'ESTORNO', competenciaCredito: '2099-11' },
      ]);
    });
  });

  it('no modo POR_FATURA cada crédito herda a competência da sua parcela', async () => {
    await comRollback(async (tx) => {
      const { ids } = await compraParcelada(tx, 3, 30000);

      // Fecha as faturas das duas primeiras parcelas.
      for (const id of [ids[0], ids[1]]) {
        const t = await tx.transaction.findUniqueOrThrow({
          where: { id },
          select: { invoiceId: true },
        });
        await fecharFatura(t.invoiceId!, tx);
      }

      await aplicarEstorno(
        {
          transactionId: ids[0],
          modo: 'POR_FATURA',
          competenciaCredito: '2099-12',
          recebidoEm: '2099-12-15',
        },
        tx,
      );

      const creditos = await tx.credito.findMany({
        where: { transactionId: { in: ids } },
        orderBy: { competenciaCredito: 'asc' },
        select: { transactionId: true, competenciaCredito: true },
      });

      const parcelas = await tx.transaction.findMany({
        where: { id: { in: [ids[0], ids[1]] } },
        select: { id: true, competencia: true },
      });

      // Cada crédito caiu na competência da sua própria parcela, não na
      // competência única informada.
      for (const c of creditos) {
        const parcela = parcelas.find((p) => p.id === c.transactionId)!;
        expect(c.competenciaCredito).toBe(parcela.competencia);
      }
      expect(creditos).toHaveLength(2);
    });
  });

  it('o crédito de ESTORNO abate a fatura da sua competência', async () => {
    await comRollback(async (tx) => {
      const { ids } = await compraParcelada(tx, 1, 50000);

      const t = await tx.transaction.findUniqueOrThrow({
        where: { id: ids[0] },
        select: { invoiceId: true, competencia: true },
      });
      await fecharFatura(t.invoiceId!, tx);

      const antes = await totalDaFatura(t.invoiceId!, tx);
      expect(antes).toBe(50000);

      await aplicarEstorno(
        {
          transactionId: ids[0],
          modo: 'UNICO',
          competenciaCredito: t.competencia,
          recebidoEm: '2099-10-15',
        },
        tx,
      );

      expect(await totalDaFatura(t.invoiceId!, tx)).toBe(0);
    });
  });

  it('rejeita data de estorno em formato inválido', async () => {
    await comRollback(async (tx) => {
      const { ids } = await compraParcelada(tx, 1, 50000);

      await expect(
        aplicarEstorno(
          {
            transactionId: ids[0],
            modo: 'UNICO',
            competenciaCredito: '2099-10',
            recebidoEm: '15/10/2099',
          },
          tx,
        ),
      ).rejects.toThrow('Data civil inválida');
    });
  });

  it('rejeita competência de crédito em formato inválido', async () => {
    await comRollback(async (tx) => {
      const { ids } = await compraParcelada(tx, 1, 50000);

      await expect(
        aplicarEstorno(
          {
            transactionId: ids[0],
            modo: 'UNICO',
            competenciaCredito: '2099/10',
            recebidoEm: '2099-10-15',
          },
          tx,
        ),
      ).rejects.toThrow('Competência inválida');
    });
  });
});

describe('aplicarEstorno — atomicidade sob falha', () => {
  it('nada sobrevive se uma falhar no meio da criação dos créditos', async () => {
    // Diferente dos demais testes deste arquivo, este NÃO usa `comRollback`.
    //
    // `comRollback` passa para `aplicarEstorno` um `tx` que já é, ele
    // próprio, um cliente de transação (`Prisma.TransactionClient`). Como
    // esse tipo não tem `$transaction`, `aplicarEstorno` sempre cai no ramo
    // `gravar(cliente)` — nunca no ramo `cliente.$transaction(...)`, que é
    // exatamente o que a docstring da função promete ("tudo ou nada", spec
    // seção 13). Um teste que passasse um `tx` de fora não seria capaz de
    // distinguir a versão real (transacional) de uma versão quebrada que
    // chamasse `gravar(cliente)` sem transação nenhuma — os dois casos se
    // comportariam de forma idêntica, porque o `tx` de fora nunca teria
    // `$transaction` de qualquer forma.
    //
    // Por isso este teste chama `aplicarEstorno` sem passar `cliente` (usando
    // o padrão, o `prisma` de topo), forçando o ramo
    // `cliente.$transaction((tx) => gravar(tx))` de verdade. Para injetar uma
    // falha na 2ª de 3 criações de crédito sem poder capturar o `tx` interno
    // do Prisma antes de ele existir (ele só é criado quando `$transaction` é
    // chamado), espionamos `prisma.$transaction` e, na nossa implementação,
    // delegamos para a implementação original — só que envolvendo o `tx` que
    // o Prisma nos entrega com uma versão de `credito.create` que deixa a
    // primeira chamada passar de verdade (chamando a implementação real) e
    // derruba a segunda com um erro proposital. As duas parcelas ainda não
    // cobradas (que a mesma transação cancela ANTES do loop de créditos)
    // também precisam sobreviver ilesas — é a prova de que o cancelamento e
    // os créditos vivem ou morrem juntos.
    const nomeCartao = 'Cartão — teste de atomicidade do estorno';
    const nomeCategoria = 'Categoria — teste de atomicidade do estorno';
    const descricaoCompra = 'TV com falha proposital no meio dos créditos do estorno';

    // Limpeza defensiva: caso uma execução anterior tenha sido interrompida
    // antes do `finally`, isso evita colidir com os nomes únicos usados
    // aqui (a tabela real do Postgres não tem o rollback automático dos
    // outros testes).
    await prisma.transaction.deleteMany({ where: { descricao: descricaoCompra } });
    await prisma.card.deleteMany({ where: { nome: nomeCartao } });
    await prisma.budgetCategory.deleteMany({ where: { nome: nomeCategoria } });

    const categoria = await criarCategoria({ nome: nomeCategoria, corSlot: 4 }, prisma);
    const subcategoria = await criarSubcategoria(
      { budgetCategoryId: categoria.id, nome: 'Sub' },
      prisma,
    );
    const cartao = await criarCartao(
      { nome: nomeCartao, diaFechamento: 25, diaVencimento: 5 },
      prisma,
    );

    const { ids } = await criarLancamento(
      {
        descricao: descricaoCompra,
        valorCentavos: 500000,
        data: '2026-08-20',
        metodo: 'CREDITO',
        cardId: cartao.id,
        budgetCategoryId: categoria.id,
        subcategoryId: subcategoria.id,
        parcelas: 5,
        reembolsoAlvoCentavos: 0,
      },
      prisma,
    );

    // Fecha as faturas das 3 primeiras parcelas — viram crédito. As 2
    // últimas ficam ABERTA — viram cancelamento. Assim o plano tem as duas
    // metades (cancelamentos e créditos) e ao menos 2 créditos, para que a
    // falha proposital no 2º ainda deixe o 1º já gravado de verdade caso a
    // atomicidade esteja quebrada.
    for (const id of [ids[0], ids[1], ids[2]]) {
      const t = await prisma.transaction.findUniqueOrThrow({
        where: { id },
        select: { invoiceId: true },
      });
      await fecharFatura(t.invoiceId!, prisma);
    }

    const transactionOriginal = prisma.$transaction.bind(prisma);
    const espiao = vi
      .spyOn(prisma, '$transaction')
      .mockImplementation(((fnOuArray: unknown, opcoes?: unknown) => {
        if (typeof fnOuArray !== 'function') {
          return transactionOriginal(fnOuArray as never, opcoes as never);
        }
        return transactionOriginal(async (tx) => {
          let chamadas = 0;
          const criarOriginal = tx.credito.create.bind(tx.credito);
          const txComFalha = {
            ...tx,
            credito: {
              ...tx.credito,
              create: (...args: Parameters<typeof criarOriginal>) => {
                chamadas += 1;
                if (chamadas === 2) {
                  throw new Error('falha proposital no meio dos créditos do estorno');
                }
                return criarOriginal(...args);
              },
            },
          };
          return (fnOuArray as (tx: ClientePrisma) => Promise<unknown>)(
            txComFalha as unknown as ClientePrisma,
          );
        }, opcoes as never);
      }) as typeof prisma.$transaction);

    try {
      await expect(
        aplicarEstorno({
          transactionId: ids[0],
          modo: 'UNICO',
          competenciaCredito: '2026-09',
          recebidoEm: '2026-09-01',
        }),
      ).rejects.toThrow('falha proposital no meio dos créditos do estorno');

      // Nada sobreviveu: nem os cancelamentos das 2 parcelas ainda não
      // cobradas, nem o crédito da 1ª parcela fechada (que a espiã criou de
      // verdade antes de falhar na 2ª).
      const linhas = await prisma.transaction.findMany({
        where: { id: { in: ids } },
        select: { status: true },
      });
      expect(linhas.every((l) => l.status === 'ATIVA')).toBe(true);

      const creditos = await prisma.credito.findMany({
        where: { transactionId: { in: ids } },
      });
      expect(creditos).toHaveLength(0);
    } finally {
      espiao.mockRestore();
      await prisma.credito.deleteMany({ where: { transactionId: { in: ids } } });
      await prisma.transaction.deleteMany({ where: { descricao: descricaoCompra } });
      await prisma.invoice.deleteMany({ where: { cardId: cartao.id } });
      await prisma.card.delete({ where: { id: cartao.id } });
      await prisma.subcategory.delete({ where: { id: subcategoria.id } });
      await prisma.budgetCategory.delete({ where: { id: categoria.id } });
    }
  });
});

describe('aplicarEstornoParcial', () => {
  it('cria o crédito e não cancela parcela nenhuma', async () => {
    await comRollback(async (tx) => {
      const { ids } = await compraParcelada(tx, 3, 30000);

      await aplicarEstornoParcial(
        {
          transactionId: ids[0],
          valorCentavos: 5000,
          competenciaCredito: '2099-10',
          recebidoEm: '2099-10-15',
        },
        tx,
      );

      const linhas = await tx.transaction.findMany({
        where: { id: { in: ids } },
        select: { status: true },
      });
      expect(linhas.every((l) => l.status === 'ATIVA')).toBe(true);

      const creditos = await tx.credito.findMany({
        where: { transactionId: ids[0] },
        select: { valorCentavos: true, origem: true },
      });
      expect(creditos).toEqual([{ valorCentavos: 5000, origem: 'ESTORNO' }]);
    });
  });

  it('aceita um valor maior que uma parcela, desde que caiba na compra inteira', async () => {
    await comRollback(async (tx) => {
      // 3 parcelas de R$100; devolveram um item de R$250.
      const { ids } = await compraParcelada(tx, 3, 30000);

      await aplicarEstornoParcial(
        {
          transactionId: ids[0],
          valorCentavos: 25000,
          competenciaCredito: '2099-10',
          recebidoEm: '2099-10-15',
        },
        tx,
      );

      const creditos = await tx.credito.findMany({
        where: { transactionId: ids[0] },
        select: { valorCentavos: true },
      });
      expect(creditos).toEqual([{ valorCentavos: 25000 }]);
    });
  });

  it('rejeita valor acima do total da compra', async () => {
    await comRollback(async (tx) => {
      const { ids } = await compraParcelada(tx, 3, 30000);

      await expect(
        aplicarEstornoParcial(
          {
            transactionId: ids[0],
            valorCentavos: 30001,
            competenciaCredito: '2099-10',
            recebidoEm: '2099-10-15',
          },
          tx,
        ),
      ).rejects.toThrow('excede o valor da compra');
    });
  });

  it('rejeita valor zero ou negativo', async () => {
    await comRollback(async (tx) => {
      const { ids } = await compraParcelada(tx, 1, 50000);

      await expect(
        aplicarEstornoParcial(
          {
            transactionId: ids[0],
            valorCentavos: 0,
            competenciaCredito: '2099-10',
            recebidoEm: '2099-10-15',
          },
          tx,
        ),
      ).rejects.toThrow('inteiro positivo');
    });
  });
});
