import { describe, expect, it } from 'vitest';
import { criarCategoria, criarSubcategoria } from './categorias';
import { criarCartao } from './cartoes';
import { listarFaturas, totalDaFatura } from './faturas';
import {
  apagarGrupo,
  criarLancamento,
  listarLancamentos,
} from './lancamentos';
import { comRollback } from './rollback';
import type { ClientePrisma } from './tipos';

async function cenario(tx: ClientePrisma) {
  const categoria = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
  const subcategoria = await criarSubcategoria(
    { budgetCategoryId: categoria.id, nome: 'Delivery' },
    tx,
  );
  const cartao = await criarCartao(
    { nome: 'Nubank', diaFechamento: 25, diaVencimento: 5 },
    tx,
  );
  return { categoria, subcategoria, cartao };
}

describe('criarLancamento — à vista', () => {
  it('grava uma linha só, na competência da própria data', async () => {
    await comRollback(async (tx) => {
      const { categoria, subcategoria } = await cenario(tx);

      const { ids } = await criarLancamento(
        {
          descricao: 'iFood',
          valorCentavos: 2000,
          data: '2026-08-20',
          metodo: 'PIX',
          cardId: null,
          budgetCategoryId: categoria.id,
          subcategoryId: subcategoria.id,
          parcelas: 1,
          reembolsoAlvoCentavos: 0,
        },
        tx,
      );

      expect(ids).toHaveLength(1);
      const lista = await listarLancamentos('2026-08', tx);
      const criado = lista.find((l) => l.id === ids[0]);
      expect(criado?.descricao).toBe('iFood');
      expect(criado?.valorCentavos).toBe(2000);
      expect(criado?.categoriaNome).toBe('Alimentação');
      expect(criado?.subcategoriaNome).toBe('Delivery');
      expect(criado?.cartaoNome).toBeNull();
    });
  });
});

describe('criarLancamento — crédito parcelado', () => {
  it('gera uma linha por parcela, cada uma na sua competência', async () => {
    await comRollback(async (tx) => {
      const { categoria, subcategoria, cartao } = await cenario(tx);

      const { ids } = await criarLancamento(
        {
          descricao: 'TV',
          valorCentavos: 200000,
          data: '2026-08-20',
          metodo: 'CREDITO',
          cardId: cartao.id,
          budgetCategoryId: categoria.id,
          subcategoryId: subcategoria.id,
          parcelas: 10,
          reembolsoAlvoCentavos: 0,
        },
        tx,
      );

      expect(ids).toHaveLength(10);

      // A primeira parcela cai em setembro (compra 20/ago, fecha 25/ago, vence 05/set).
      const setembro = await listarLancamentos('2026-09', tx);
      const primeira = setembro.filter((l) => l.descricao === 'TV');
      expect(primeira).toHaveLength(1);
      expect(primeira[0].valorCentavos).toBe(20000);
      expect(primeira[0].parcelaNum).toBe(1);
      expect(primeira[0].parcelaTotal).toBe(10);

      // A última cai em junho de 2027.
      const junho = await listarLancamentos('2027-06', tx);
      expect(junho.filter((l) => l.descricao === 'TV')).toHaveLength(1);

      // E agosto (mês da compra) não tem nada — a competência é a da fatura.
      const agosto = await listarLancamentos('2026-08', tx);
      expect(agosto.filter((l) => l.descricao === 'TV')).toHaveLength(0);
    });
  });

  it('todas as parcelas compartilham o mesmo grupo', async () => {
    await comRollback(async (tx) => {
      const { categoria, subcategoria, cartao } = await cenario(tx);
      await criarLancamento(
        {
          descricao: 'TV',
          valorCentavos: 200000,
          data: '2026-08-20',
          metodo: 'CREDITO',
          cardId: cartao.id,
          budgetCategoryId: categoria.id,
          subcategoryId: subcategoria.id,
          parcelas: 10,
          reembolsoAlvoCentavos: 0,
        },
        tx,
      );

      const setembro = await listarLancamentos('2026-09', tx);
      const grupo = setembro.find((l) => l.descricao === 'TV')!.grupoParcelamentoId;
      expect(grupo).not.toBeNull();

      const outubro = await listarLancamentos('2026-10', tx);
      expect(outubro.find((l) => l.descricao === 'TV')!.grupoParcelamentoId).toBe(grupo);
    });
  });

  it('cria as faturas necessárias e vincula cada parcela à sua', async () => {
    await comRollback(async (tx) => {
      const { categoria, subcategoria, cartao } = await cenario(tx);
      await criarLancamento(
        {
          descricao: 'TV',
          valorCentavos: 60000,
          data: '2026-08-20',
          metodo: 'CREDITO',
          cardId: cartao.id,
          budgetCategoryId: categoria.id,
          subcategoryId: subcategoria.id,
          parcelas: 3,
          reembolsoAlvoCentavos: 0,
        },
        tx,
      );

      const faturas = await listarFaturas(cartao.id, tx);
      expect(faturas.map((f) => f.competencia)).toEqual([
        '2026-09',
        '2026-10',
        '2026-11',
      ]);

      // Cada fatura recebeu exatamente uma parcela de R$200.
      for (const fatura of faturas) {
        expect(await totalDaFatura(fatura.id, tx)).toBe(20000);
      }
    });
  });
});

describe('criarLancamento — validação', () => {
  it('rejeita crédito sem cartão', async () => {
    await comRollback(async (tx) => {
      const { categoria, subcategoria } = await cenario(tx);
      await expect(
        criarLancamento(
          {
            descricao: 'X',
            valorCentavos: 1000,
            data: '2026-08-20',
            metodo: 'CREDITO',
            cardId: null,
            budgetCategoryId: categoria.id,
            subcategoryId: subcategoria.id,
            parcelas: 1,
            reembolsoAlvoCentavos: 0,
          },
          tx,
        ),
      ).rejects.toThrow();
    });
  });

  it('rejeita data em formato inválido', async () => {
    await comRollback(async (tx) => {
      const { categoria, subcategoria } = await cenario(tx);
      await expect(
        criarLancamento(
          {
            descricao: 'X',
            valorCentavos: 1000,
            data: '20/08/2026',
            metodo: 'PIX',
            cardId: null,
            budgetCategoryId: categoria.id,
            subcategoryId: subcategoria.id,
            parcelas: 1,
            reembolsoAlvoCentavos: 0,
          },
          tx,
        ),
      ).rejects.toThrow();
    });
  });

  it('rejeita subcategoria que pertence a outro orçamento', async () => {
    await comRollback(async (tx) => {
      const { subcategoria } = await cenario(tx);
      // Um segundo orçamento, sem relação com a subcategoria "Delivery".
      const outro = await criarCategoria({ nome: 'Transporte', corSlot: 4 }, tx);

      await expect(
        criarLancamento(
          {
            descricao: 'Uber',
            valorCentavos: 1000,
            data: '2026-08-20',
            metodo: 'PIX',
            cardId: null,
            budgetCategoryId: outro.id,
            subcategoryId: subcategoria.id,
            parcelas: 1,
            reembolsoAlvoCentavos: 0,
          },
          tx,
        ),
      ).rejects.toThrow();
    });
  });

  it('rejeita alvo de reembolso maior que o valor', async () => {
    await comRollback(async (tx) => {
      const { categoria, subcategoria } = await cenario(tx);
      await expect(
        criarLancamento(
          {
            descricao: 'X',
            valorCentavos: 1000,
            data: '2026-08-20',
            metodo: 'PIX',
            cardId: null,
            budgetCategoryId: categoria.id,
            subcategoryId: subcategoria.id,
            parcelas: 1,
            reembolsoAlvoCentavos: 5000,
          },
          tx,
        ),
      ).rejects.toThrow();
    });
  });
});

describe('apagarGrupo', () => {
  it('apaga todas as parcelas de uma compra parcelada', async () => {
    await comRollback(async (tx) => {
      const { categoria, subcategoria, cartao } = await cenario(tx);
      await criarLancamento(
        {
          descricao: 'TV',
          valorCentavos: 60000,
          data: '2026-08-20',
          metodo: 'CREDITO',
          cardId: cartao.id,
          budgetCategoryId: categoria.id,
          subcategoryId: subcategoria.id,
          parcelas: 3,
          reembolsoAlvoCentavos: 0,
        },
        tx,
      );

      const setembro = await listarLancamentos('2026-09', tx);
      const grupo = setembro.find((l) => l.descricao === 'TV')!.grupoParcelamentoId!;

      await apagarGrupo(grupo, tx);

      for (const competencia of ['2026-09', '2026-10', '2026-11']) {
        const lista = await listarLancamentos(competencia, tx);
        expect(lista.filter((l) => l.descricao === 'TV')).toHaveLength(0);
      }
    });
  });
});
