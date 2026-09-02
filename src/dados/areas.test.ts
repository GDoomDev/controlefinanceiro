import { describe, expect, it } from 'vitest';

import { areasDoMes } from './areas';
import { arquivarCategoria, criarCategoria, criarSubcategoria } from './categorias';
import { aplicarEstorno } from './estorno';
import { criarLancamento } from './lancamentos';
import { registrarRecebimento } from './reembolsos';
import { comRollback } from './rollback';
import type { ClientePrisma } from './tipos';

const MES = '2099-09';

async function cenario(tx: ClientePrisma) {
  const alimentacao = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
  const mercado = await criarSubcategoria(
    { budgetCategoryId: alimentacao.id, nome: 'Mercado' },
    tx,
  );
  const delivery = await criarSubcategoria(
    { budgetCategoryId: alimentacao.id, nome: 'Delivery' },
    tx,
  );

  const lazer = await criarCategoria({ nome: 'Lazer', corSlot: 5 }, tx);
  const bar = await criarSubcategoria({ budgetCategoryId: lazer.id, nome: 'Bar' }, tx);

  return { alimentacao, mercado, delivery, lazer, bar };
}

async function gastar(
  tx: ClientePrisma,
  categoriaId: string,
  subcategoryId: string,
  valorCentavos: number,
) {
  return criarLancamento(
    {
      descricao: 'Gasto',
      valorCentavos,
      data: `${MES}-10`,
      metodo: 'PIX',
      cardId: null,
      budgetCategoryId: categoriaId,
      subcategoryId,
      parcelas: 1,
      reembolsoAlvoCentavos: 0,
    },
    tx,
  );
}

describe('areasDoMes', () => {
  it('monta a composição por orçamento com a cor de cada categoria', async () => {
    await comRollback(async (tx) => {
      const c = await cenario(tx);
      await gastar(tx, c.alimentacao.id, c.mercado.id, 75000);
      await gastar(tx, c.lazer.id, c.bar.id, 25000);

      const areas = await areasDoMes(MES, null, tx);

      expect(areas.totalCentavos).toBe(100000);

      const alimentacao = areas.composicao.segmentos.find(
        (s) => s.categoriaId === c.alimentacao.id,
      )!;
      expect(alimentacao.corSlot).toBe(2);
      expect(alimentacao.gastoCentavos).toBe(75000);
      expect(alimentacao.percentual).toBe(75);
    });
  });

  it('o ranking traz nome do orçamento-pai e a cor herdada dele', async () => {
    await comRollback(async (tx) => {
      const c = await cenario(tx);
      await gastar(tx, c.alimentacao.id, c.mercado.id, 60000);
      await gastar(tx, c.alimentacao.id, c.delivery.id, 20000);

      const areas = await areasDoMes(MES, null, tx);

      const mercado = areas.ranking.linhas.find(
        (l) => l.subcategoriaId === c.mercado.id,
      )!;
      expect(mercado.nome).toBe('Mercado');
      expect(mercado.nomeDoOrcamento).toBe('Alimentação');
      expect(mercado.corSlot).toBe(2);
      expect(mercado.percentualDoOrcamento).toBe(75);
    });
  });

  it('conta os lançamentos e guarda o maior individual', async () => {
    await comRollback(async (tx) => {
      const c = await cenario(tx);
      await gastar(tx, c.alimentacao.id, c.mercado.id, 12000);
      await gastar(tx, c.alimentacao.id, c.mercado.id, 30000);
      await gastar(tx, c.alimentacao.id, c.mercado.id, 8000);

      const areas = await areasDoMes(MES, null, tx);

      const mercado = areas.ranking.linhas.find(
        (l) => l.subcategoriaId === c.mercado.id,
      )!;
      expect(mercado.quantidade).toBe(3);
      expect(mercado.maiorLancamentoCentavos).toBe(30000);
      expect(mercado.gastoCentavos).toBe(50000);
    });
  });

  it('filtrar por categoria restringe o ranking, não a composição', async () => {
    await comRollback(async (tx) => {
      const c = await cenario(tx);
      await gastar(tx, c.alimentacao.id, c.mercado.id, 75000);
      await gastar(tx, c.lazer.id, c.bar.id, 25000);

      const areas = await areasDoMes(MES, c.lazer.id, tx);

      expect(areas.filtro).toEqual({ categoriaId: c.lazer.id, nome: 'Lazer' });
      expect(areas.ranking.linhas.map((l) => l.subcategoriaId)).toEqual([c.bar.id]);

      // A composição continua inteira: dá para clicar em outro segmento.
      expect(areas.composicao.segmentos).toHaveLength(2);

      // E o percentual continua sendo sobre o mês inteiro, não sobre o filtro.
      expect(areas.ranking.linhas[0].percentualDoMes).toBe(25);
    });
  });

  it('categoria arquivada com gasto no mês continua aparecendo, com nome e cor', async () => {
    await comRollback(async (tx) => {
      const c = await cenario(tx);
      await gastar(tx, c.lazer.id, c.bar.id, 40000);
      await arquivarCategoria(c.lazer.id, tx);

      const areas = await areasDoMes(MES, null, tx);

      const segmento = areas.composicao.segmentos.find(
        (s) => s.categoriaId === c.lazer.id,
      )!;
      expect(segmento.nome).toBe('Lazer');
      expect(segmento.corSlot).toBe(5);
      expect(segmento.gastoCentavos).toBe(40000);
    });
  });

  it('crédito de estorno reduz o gasto da subcategoria de origem', async () => {
    await comRollback(async (tx) => {
      const c = await cenario(tx);
      const compra = await gastar(tx, c.alimentacao.id, c.mercado.id, 50000);

      await tx.credito.create({
        data: {
          transactionId: compra.ids[0],
          valorCentavos: 20000,
          recebidoEm: `${MES}-20`,
          competenciaCredito: MES,
          origem: 'ESTORNO',
        },
      });

      const areas = await areasDoMes(MES, null, tx);

      const mercado = areas.ranking.linhas.find(
        (l) => l.subcategoriaId === c.mercado.id,
      )!;
      expect(mercado.gastoCentavos).toBe(30000);
      // O bruto do maior lançamento não muda com o crédito.
      expect(mercado.maiorLancamentoCentavos).toBe(50000);
    });
  });

  it('mês sem gasto nenhum devolve composição vazia, sem NaN', async () => {
    await comRollback(async (tx) => {
      await cenario(tx);

      const areas = await areasDoMes('2099-11', null, tx);

      expect(areas.composicao.segmentos).toEqual([]);
      expect(areas.ranking.linhas).toEqual([]);
      expect(areas.ranking.outras).toBeNull();
      expect(areas.totalCentavos).toBe(0);
    });
  });

  it('rejeita competência fora do formato', async () => {
    await expect(areasDoMes('2099/09', null)).rejects.toThrow('Competência inválida');
  });

  it('estorno de despesa com reembolso já recebido não deixa crédito residual na composição', async () => {
    await comRollback(async (tx) => {
      const c = await cenario(tx);

      const compra = await criarLancamento(
        {
          descricao: 'Compra reembolsável',
          valorCentavos: 30000,
          data: `${MES}-10`,
          metodo: 'PIX',
          cardId: null,
          budgetCategoryId: c.alimentacao.id,
          subcategoryId: c.mercado.id,
          parcelas: 1,
          reembolsoAlvoCentavos: 20000,
        },
        tx,
      );

      // O reembolso chega antes do estorno — cria um crédito de REEMBOLSO.
      await registrarRecebimento(
        { transactionId: compra.ids[0], valorCentavos: 20000, recebidoEm: `${MES}-15` },
        tx,
      );

      // A despesa é estornada por inteiro (PIX, sem fatura, vira CANCELADA).
      await aplicarEstorno(
        {
          transactionId: compra.ids[0],
          modo: 'UNICO',
          competenciaCredito: MES,
          recebidoEm: `${MES}-20`,
        },
        tx,
      );

      const areas = await areasDoMes(MES, null, tx);

      // A despesa cancelada some (correto); o crédito de REEMBOLSO cuja
      // transação-pai também virou CANCELADA não pode continuar reduzindo a
      // subcategoria — sem gasto nenhum no mês, ela não deve aparecer.
      expect(areas.composicao.creditados).toEqual([]);
      expect(
        areas.ranking.linhas.find((l) => l.subcategoriaId === c.mercado.id),
      ).toBeUndefined();
    });
  });
});
