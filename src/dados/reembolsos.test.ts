import { describe, expect, it } from 'vitest';

import { dataCivilEm, diasEntre, lerDataCivil } from '@/dominio/data';

import { criarCategoria, criarSubcategoria } from './categorias';
import { criarLancamento } from './lancamentos';
import { listarReembolsos, registrarRecebimento } from './reembolsos';
import { comRollback } from './rollback';
import type { ClientePrisma } from './tipos';

const DATA = '2099-09-10';
const MES = '2099-09';

async function despesaReembolsavel(
  tx: ClientePrisma,
  valorCentavos: number,
  alvoCentavos: number,
) {
  const categoria = await criarCategoria({ nome: 'Reembolsáveis', corSlot: 1 }, tx);
  const sub = await criarSubcategoria(
    { budgetCategoryId: categoria.id, nome: 'Hotel do time' },
    tx,
  );

  const { ids } = await criarLancamento(
    {
      descricao: 'Hotel do time',
      valorCentavos,
      data: DATA,
      metodo: 'PIX',
      cardId: null,
      budgetCategoryId: categoria.id,
      subcategoryId: sub.id,
      parcelas: 1,
      reembolsoAlvoCentavos: alvoCentavos,
    },
    tx,
  );

  return { id: ids[0], categoria, sub };
}

describe('listarReembolsos', () => {
  it('traz o alvo, o recebido, o pendente e o estado PENDENTE', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 60000);

      const { pendentes } = await listarReembolsos(tx);
      const r = pendentes.find((x) => x.transactionId === id)!;

      expect(r.valorCentavos).toBe(90000);
      expect(r.alvoCentavos).toBe(60000);
      expect(r.recebidoCentavos).toBe(0);
      expect(r.pendenteCentavos).toBe(60000);
      expect(r.estado).toBe('PENDENTE');
      expect(r.descricao).toBe('Hotel do time');
      expect(r.categoriaNome).toBe('Reembolsáveis');
      expect(r.subcategoriaNome).toBe('Hotel do time');
    });
  });

  it('não lista lançamento sem alvo de reembolso', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 0);

      const { pendentes, quitados } = await listarReembolsos(tx);

      expect(pendentes.find((x) => x.transactionId === id)).toBeUndefined();
      expect(quitados.find((x) => x.transactionId === id)).toBeUndefined();
    });
  });

  it('conta os dias parados a partir da data da despesa', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 60000);

      const { pendentes } = await listarReembolsos(tx);
      const r = pendentes.find((x) => x.transactionId === id)!;

      // Comparação contra a função de domínio aplicada aos mesmos dados:
      // prova que a camada de dados ligou a data certa na conta certa, sem
      // depender de quando o teste roda.
      expect(r.diasParado).toBe(diasEntre(lerDataCivil(DATA), dataCivilEm(new Date())));
    });
  });

  it('um crédito de ESTORNO não abate o pendente do reembolso', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 60000);

      await tx.credito.create({
        data: {
          transactionId: id,
          valorCentavos: 60000,
          recebidoEm: DATA,
          competenciaCredito: MES,
          origem: 'ESTORNO',
        },
      });

      const { pendentes } = await listarReembolsos(tx);
      const r = pendentes.find((x) => x.transactionId === id)!;

      expect(r.recebidoCentavos).toBe(0);
      expect(r.pendenteCentavos).toBe(60000);
      expect(r.estado).toBe('PENDENTE');
    });
  });

  it('separa quitados de pendentes', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 60000);
      await registrarRecebimento(
        { transactionId: id, valorCentavos: 60000, recebidoEm: '2099-10-05' },
        tx,
      );

      const { pendentes, quitados } = await listarReembolsos(tx);

      expect(pendentes.find((x) => x.transactionId === id)).toBeUndefined();
      const r = quitados.find((x) => x.transactionId === id)!;
      expect(r.estado).toBe('QUITADO');
      expect(r.pendenteCentavos).toBe(0);
    });
  });

  it('lista os recebimentos com data e competência corrigida', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 60000);
      await registrarRecebimento(
        { transactionId: id, valorCentavos: 25000, recebidoEm: '2099-10-05' },
        tx,
      );

      const { pendentes } = await listarReembolsos(tx);
      const r = pendentes.find((x) => x.transactionId === id)!;

      expect(r.recebimentos).toEqual([
        { valorCentavos: 25000, recebidoEm: '2099-10-05', competenciaCredito: MES },
      ]);
    });
  });

  it('não lista uma parcela cancelada por estorno', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 60000);
      await tx.transaction.update({ where: { id }, data: { status: 'CANCELADA' } });

      const { pendentes, quitados } = await listarReembolsos(tx);

      expect(pendentes.find((x) => x.transactionId === id)).toBeUndefined();
      expect(quitados.find((x) => x.transactionId === id)).toBeUndefined();
    });
  });
});

describe('registrarRecebimento', () => {
  it('grava o crédito na competência ORIGINAL da despesa, não na do recebimento', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 60000);

      // Recebido em dezembro, mas a despesa é de setembro.
      const { id: creditoId } = await registrarRecebimento(
        { transactionId: id, valorCentavos: 60000, recebidoEm: '2099-12-20' },
        tx,
      );

      const credito = await tx.credito.findUnique({
        where: { id: creditoId },
        select: { competenciaCredito: true, recebidoEm: true, origem: true },
      });

      expect(credito).toEqual({
        competenciaCredito: MES,
        recebidoEm: '2099-12-20',
        origem: 'REEMBOLSO',
      });
    });
  });

  it('recebimento parcial deixa o reembolso aberto pelo restante', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 60000);
      await registrarRecebimento(
        { transactionId: id, valorCentavos: 20000, recebidoEm: '2099-10-05' },
        tx,
      );

      const { pendentes } = await listarReembolsos(tx);
      const r = pendentes.find((x) => x.transactionId === id)!;

      expect(r.recebidoCentavos).toBe(20000);
      expect(r.pendenteCentavos).toBe(40000);
      expect(r.estado).toBe('PARCIAL');
    });
  });

  it('recebimentos sucessivos somam até quitar', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 60000);
      await registrarRecebimento(
        { transactionId: id, valorCentavos: 20000, recebidoEm: '2099-10-05' },
        tx,
      );
      await registrarRecebimento(
        { transactionId: id, valorCentavos: 40000, recebidoEm: '2099-11-05' },
        tx,
      );

      const { quitados } = await listarReembolsos(tx);
      const r = quitados.find((x) => x.transactionId === id)!;

      expect(r.recebidoCentavos).toBe(60000);
      expect(r.pendenteCentavos).toBe(0);
      expect(r.estado).toBe('QUITADO');
      expect(r.recebimentos).toHaveLength(2);
    });
  });

  it('rejeita recebimento acima do pendente', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 60000);

      await expect(
        registrarRecebimento(
          { transactionId: id, valorCentavos: 60001, recebidoEm: '2099-10-05' },
          tx,
        ),
      ).rejects.toThrow('excede o pendente');
    });
  });

  it('rejeita recebimento que ultrapassa o pendente depois de um parcial', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 60000);
      await registrarRecebimento(
        { transactionId: id, valorCentavos: 50000, recebidoEm: '2099-10-05' },
        tx,
      );

      await expect(
        registrarRecebimento(
          { transactionId: id, valorCentavos: 10001, recebidoEm: '2099-11-05' },
          tx,
        ),
      ).rejects.toThrow('excede o pendente');
    });
  });

  it('rejeita valor zero ou negativo', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 60000);

      await expect(
        registrarRecebimento(
          { transactionId: id, valorCentavos: 0, recebidoEm: '2099-10-05' },
          tx,
        ),
      ).rejects.toThrow('inteiro positivo');
    });
  });

  it('rejeita data de recebimento em formato inválido', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 60000);

      await expect(
        registrarRecebimento(
          { transactionId: id, valorCentavos: 1000, recebidoEm: '05/10/2099' },
          tx,
        ),
      ).rejects.toThrow('Data civil inválida');
    });
  });

  it('rejeita lançamento inexistente', async () => {
    await comRollback(async (tx) => {
      await expect(
        registrarRecebimento(
          { transactionId: 'nao-existe', valorCentavos: 1000, recebidoEm: '2099-10-05' },
          tx,
        ),
      ).rejects.toThrow('não encontrado');
    });
  });

  it('rejeita recebimento num lançamento sem alvo de reembolso', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 0);

      await expect(
        registrarRecebimento(
          { transactionId: id, valorCentavos: 1000, recebidoEm: '2099-10-05' },
          tx,
        ),
      ).rejects.toThrow('excede o pendente');
    });
  });
});
