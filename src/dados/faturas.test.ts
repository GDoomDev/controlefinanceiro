import { describe, expect, it } from 'vitest';
import { criarCartao } from './cartoes';
import {
  fecharFatura,
  garantirFatura,
  listarFaturas,
  pagarFatura,
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
