import { describe, expect, it } from 'vitest';
import { criarCartao } from './cartoes';
import {
  fecharFatura,
  garantirFatura,
  listarFaturas,
  listarFaturasDeCartoes,
  pagarFatura,
  totaisDasFaturas,
  totalDaFatura,
} from './faturas';
import { comRollback } from './rollback';
import type { ClientePrisma } from './tipos';

async function cartaoDeTeste(tx: ClientePrisma) {
  return criarCartao({ nome: 'Nubank', diaFechamento: 25, diaVencimento: 5 }, tx);
}

describe('garantirFatura', () => {
  it('cria a fatura com as datas que o domínio calcula', async () => {
    await comRollback(async (tx) => {
      const cartao = await cartaoDeTeste(tx);
      const fatura = await garantirFatura(cartao.id, '2026-09', tx);

      expect(fatura.competencia).toBe('2026-09');
      // Fecha 25 e vence 5: a fatura que vence em 05/set fechou em 25/ago.
      expect(fatura.dataFechamento).toBe('2026-08-25');
      expect(fatura.dataVencimento).toBe('2026-09-05');
      expect(fatura.status).toBe('ABERTA');
      expect(fatura.pagaEm).toBeNull();
    });
  });

  it('é idempotente — chamar duas vezes devolve a mesma fatura', async () => {
    await comRollback(async (tx) => {
      const cartao = await cartaoDeTeste(tx);
      const primeira = await garantirFatura(cartao.id, '2026-09', tx);
      const segunda = await garantirFatura(cartao.id, '2026-09', tx);
      expect(segunda.id).toBe(primeira.id);

      const lista = await listarFaturas(cartao.id, tx);
      expect(lista).toHaveLength(1);
    });
  });

  it('cria faturas distintas para competências distintas', async () => {
    await comRollback(async (tx) => {
      const cartao = await cartaoDeTeste(tx);
      await garantirFatura(cartao.id, '2026-09', tx);
      await garantirFatura(cartao.id, '2026-10', tx);
      const lista = await listarFaturas(cartao.id, tx);
      expect(lista.map((f) => f.competencia).sort()).toEqual(['2026-09', '2026-10']);
    });
  });

  it('rejeita cartão inexistente', async () => {
    await comRollback(async (tx) => {
      await expect(garantirFatura('nao-existe', '2026-09', tx)).rejects.toThrow();
    });
  });
});

describe('máquina de estados da fatura', () => {
  it('fecha uma fatura aberta', async () => {
    await comRollback(async (tx) => {
      const cartao = await cartaoDeTeste(tx);
      const fatura = await garantirFatura(cartao.id, '2026-09', tx);
      await fecharFatura(fatura.id, tx);

      const [depois] = await listarFaturas(cartao.id, tx);
      expect(depois.status).toBe('FECHADA');
    });
  });

  it('paga uma fatura fechada e registra a data', async () => {
    await comRollback(async (tx) => {
      const cartao = await cartaoDeTeste(tx);
      const fatura = await garantirFatura(cartao.id, '2026-09', tx);
      await fecharFatura(fatura.id, tx);
      await pagarFatura(fatura.id, '2026-09-05', tx);

      const [depois] = await listarFaturas(cartao.id, tx);
      expect(depois.status).toBe('PAGA');
      expect(depois.pagaEm).toBe('2026-09-05');
    });
  });

  it('recusa pagar uma fatura ainda aberta', async () => {
    await comRollback(async (tx) => {
      const cartao = await cartaoDeTeste(tx);
      const fatura = await garantirFatura(cartao.id, '2026-09', tx);
      await expect(pagarFatura(fatura.id, '2026-09-05', tx)).rejects.toThrow();
    });
  });

  it('recusa fechar uma fatura já fechada', async () => {
    await comRollback(async (tx) => {
      const cartao = await cartaoDeTeste(tx);
      const fatura = await garantirFatura(cartao.id, '2026-09', tx);
      await fecharFatura(fatura.id, tx);
      await expect(fecharFatura(fatura.id, tx)).rejects.toThrow();
    });
  });

  it('recusa data de pagamento em formato inválido', async () => {
    await comRollback(async (tx) => {
      const cartao = await cartaoDeTeste(tx);
      const fatura = await garantirFatura(cartao.id, '2026-09', tx);
      await fecharFatura(fatura.id, tx);
      await expect(pagarFatura(fatura.id, '05/09/2026', tx)).rejects.toThrow();
    });
  });
});

describe('totalDaFatura', () => {
  it('é zero numa fatura sem lançamentos', async () => {
    await comRollback(async (tx) => {
      const cartao = await cartaoDeTeste(tx);
      const fatura = await garantirFatura(cartao.id, '2026-09', tx);
      expect(await totalDaFatura(fatura.id, tx)).toBe(0);
    });
  });

  it('soma as transações ativas e ignora as canceladas', async () => {
    await comRollback(async (tx) => {
      const cartao = await cartaoDeTeste(tx);
      const fatura = await garantirFatura(cartao.id, '2026-09', tx);

      await tx.transaction.create({
        data: {
          tipo: 'DESPESA',
          descricao: 'Ativa',
          valorCentavos: 30000,
          data: '2026-08-20',
          metodo: 'CREDITO',
          cardId: cartao.id,
          invoiceId: fatura.id,
          competencia: '2026-09',
          status: 'ATIVA',
        },
      });
      await tx.transaction.create({
        data: {
          tipo: 'DESPESA',
          descricao: 'Cancelada',
          valorCentavos: 50000,
          data: '2026-08-21',
          metodo: 'CREDITO',
          cardId: cartao.id,
          invoiceId: fatura.id,
          competencia: '2026-09',
          status: 'CANCELADA',
        },
      });

      expect(await totalDaFatura(fatura.id, tx)).toBe(30000);
    });
  });

  it('crédito de ESTORNO abate a fatura, mas o de REEMBOLSO não', async () => {
    await comRollback(async (tx) => {
      const cartao = await cartaoDeTeste(tx);
      const fatura = await garantirFatura(cartao.id, '2026-09', tx);

      const transacao = await tx.transaction.create({
        data: {
          tipo: 'DESPESA',
          descricao: 'Compra',
          valorCentavos: 100000,
          data: '2026-08-20',
          metodo: 'CREDITO',
          cardId: cartao.id,
          invoiceId: fatura.id,
          competencia: '2026-09',
          status: 'ATIVA',
        },
        select: { id: true },
      });

      await tx.credito.create({
        data: {
          transactionId: transacao.id,
          valorCentavos: 20000,
          recebidoEm: '2026-09-10',
          competenciaCredito: '2026-09',
          origem: 'ESTORNO',
        },
      });
      await tx.credito.create({
        data: {
          transactionId: transacao.id,
          valorCentavos: 30000,
          recebidoEm: '2026-09-11',
          competenciaCredito: '2026-09',
          origem: 'REEMBOLSO',
        },
      });

      // 100000 − 20000 (estorno) = 80000. O reembolso de 30000 não entra:
      // aquele dinheiro veio por fora do cartão.
      expect(await totalDaFatura(fatura.id, tx)).toBe(80000);
    });
  });

  it('estorno consolidado abate a fatura da competenciaCredito, não a da compra original', async () => {
    await comRollback(async (tx) => {
      const cartao = await cartaoDeTeste(tx);
      const faturaSetembro = await garantirFatura(cartao.id, '2026-09', tx);
      const faturaNovembro = await garantirFatura(cartao.id, '2026-11', tx);

      const transacao = await tx.transaction.create({
        data: {
          tipo: 'DESPESA',
          descricao: 'Compra parcelada com estorno consolidado depois',
          valorCentavos: 100000,
          data: '2026-08-20',
          metodo: 'CREDITO',
          cardId: cartao.id,
          invoiceId: faturaSetembro.id,
          competencia: '2026-09',
          status: 'ATIVA',
        },
        select: { id: true },
      });

      // A operadora só consolidou e lançou o estorno dois meses depois, na
      // fatura de novembro — daí competenciaCredito: '2026-11'.
      await tx.credito.create({
        data: {
          transactionId: transacao.id,
          valorCentavos: 20000,
          recebidoEm: '2026-11-10',
          competenciaCredito: '2026-11',
          origem: 'ESTORNO',
        },
      });

      // A fatura de setembro não é afetada: o crédito não é dela.
      expect(await totalDaFatura(faturaSetembro.id, tx)).toBe(100000);

      // A fatura de novembro é abatida, mesmo sem transação própria vinculada.
      expect(await totalDaFatura(faturaNovembro.id, tx)).toBe(-20000);
    });
  });
});

describe('totaisDasFaturas', () => {
  it('devolve mapa vazio para lista vazia, sem consultar o banco', async () => {
    await comRollback(async (tx) => {
      const totais = await totaisDasFaturas([], tx);
      expect(totais.size).toBe(0);
    });
  });

  it('bate com totalDaFatura para uma única fatura sem lançamentos', async () => {
    await comRollback(async (tx) => {
      const cartao = await cartaoDeTeste(tx);
      const fatura = await garantirFatura(cartao.id, '2026-09', tx);

      const totais = await totaisDasFaturas([fatura], tx);
      expect(totais.get(fatura.id)).toBe(0);
    });
  });

  it('soma transações ativas e ignora canceladas, igual a totalDaFatura', async () => {
    await comRollback(async (tx) => {
      const cartao = await cartaoDeTeste(tx);
      const fatura = await garantirFatura(cartao.id, '2026-09', tx);

      await tx.transaction.create({
        data: {
          tipo: 'DESPESA',
          descricao: 'Ativa',
          valorCentavos: 30000,
          data: '2026-08-20',
          metodo: 'CREDITO',
          cardId: cartao.id,
          invoiceId: fatura.id,
          competencia: '2026-09',
          status: 'ATIVA',
        },
      });
      await tx.transaction.create({
        data: {
          tipo: 'DESPESA',
          descricao: 'Cancelada',
          valorCentavos: 50000,
          data: '2026-08-21',
          metodo: 'CREDITO',
          cardId: cartao.id,
          invoiceId: fatura.id,
          competencia: '2026-09',
          status: 'CANCELADA',
        },
      });

      const totais = await totaisDasFaturas([fatura], tx);
      expect(totais.get(fatura.id)).toBe(30000);
    });
  });

  it('isola créditos entre faturas diferentes buscadas juntas — não vaza entre cartões nem competências', async () => {
    await comRollback(async (tx) => {
      const cartaoA = await cartaoDeTeste(tx);
      const cartaoB = await criarCartao(
        { nome: 'Itaú', diaFechamento: 10, diaVencimento: 20 },
        tx,
      );

      const faturaASet = await garantirFatura(cartaoA.id, '2026-09', tx);
      const faturaANov = await garantirFatura(cartaoA.id, '2026-11', tx);
      const faturaBSet = await garantirFatura(cartaoB.id, '2026-09', tx);

      // Compra no cartão A, setembro, com estorno consolidado só em novembro
      // (mesmo padrão do teste equivalente de totalDaFatura).
      const compraA = await tx.transaction.create({
        data: {
          tipo: 'DESPESA',
          descricao: 'Compra A',
          valorCentavos: 100000,
          data: '2026-08-20',
          metodo: 'CREDITO',
          cardId: cartaoA.id,
          invoiceId: faturaASet.id,
          competencia: '2026-09',
          status: 'ATIVA',
        },
        select: { id: true },
      });
      await tx.credito.create({
        data: {
          transactionId: compraA.id,
          valorCentavos: 20000,
          recebidoEm: '2026-11-10',
          competenciaCredito: '2026-11',
          origem: 'ESTORNO',
        },
      });

      // Compra no cartão B, também setembro — mesma competência do crédito
      // de A não deveria vazar pra cá, já que é outro cartão.
      const compraB = await tx.transaction.create({
        data: {
          tipo: 'DESPESA',
          descricao: 'Compra B',
          valorCentavos: 40000,
          data: '2026-08-22',
          metodo: 'CREDITO',
          cardId: cartaoB.id,
          invoiceId: faturaBSet.id,
          competencia: '2026-09',
          status: 'ATIVA',
        },
        select: { id: true },
      });
      await tx.credito.create({
        data: {
          transactionId: compraB.id,
          valorCentavos: 5000,
          recebidoEm: '2026-09-25',
          competenciaCredito: '2026-09',
          origem: 'ESTORNO',
        },
      });

      // Busca as três faturas de uma vez só — é exatamente o cenário que a
      // versão em lote precisa acertar: mesmo cartão + competências
      // diferentes, e cartões diferentes na mesma competência.
      const totais = await totaisDasFaturas([faturaASet, faturaANov, faturaBSet], tx);

      expect(totais.get(faturaASet.id)).toBe(100000); // crédito é de novembro, não abate aqui
      expect(totais.get(faturaANov.id)).toBe(-20000); // sem transação própria, só o crédito
      expect(totais.get(faturaBSet.id)).toBe(35000); // 40000 - 5000, isolado do cartão A

      // Confere contra a versão individual, um a um.
      expect(await totalDaFatura(faturaASet.id, tx)).toBe(totais.get(faturaASet.id));
      expect(await totalDaFatura(faturaANov.id, tx)).toBe(totais.get(faturaANov.id));
      expect(await totalDaFatura(faturaBSet.id, tx)).toBe(totais.get(faturaBSet.id));
    });
  });
});

describe('listarFaturasDeCartoes', () => {
  it('devolve mapa vazio para lista vazia, sem consultar o banco', async () => {
    await comRollback(async (tx) => {
      const mapa = await listarFaturasDeCartoes([], tx);
      expect(mapa.size).toBe(0);
    });
  });

  it('agrupa faturas de vários cartões corretamente', async () => {
    await comRollback(async (tx) => {
      const cartaoA = await cartaoDeTeste(tx);
      const cartaoB = await criarCartao(
        { nome: 'Itaú', diaFechamento: 10, diaVencimento: 20 },
        tx,
      );

      await garantirFatura(cartaoA.id, '2026-09', tx);
      await garantirFatura(cartaoA.id, '2026-10', tx);
      await garantirFatura(cartaoB.id, '2026-09', tx);

      const mapa = await listarFaturasDeCartoes([cartaoA.id, cartaoB.id], tx);

      expect(mapa.get(cartaoA.id)?.map((f) => f.competencia).sort()).toEqual([
        '2026-09',
        '2026-10',
      ]);
      expect(mapa.get(cartaoB.id)?.map((f) => f.competencia)).toEqual(['2026-09']);
    });
  });

  it('bate com listarFaturas chamada individualmente', async () => {
    await comRollback(async (tx) => {
      const cartao = await cartaoDeTeste(tx);
      await garantirFatura(cartao.id, '2026-09', tx);
      await garantirFatura(cartao.id, '2026-11', tx);

      const individual = await listarFaturas(cartao.id, tx);
      const emLote = await listarFaturasDeCartoes([cartao.id], tx);

      expect(emLote.get(cartao.id)?.map((f) => f.id).sort()).toEqual(
        individual.map((f) => f.id).sort(),
      );
    });
  });
});
