import { describe, expect, it } from 'vitest';
import { criarCategoria, criarSubcategoria } from './categorias';
import { criarLancamento } from './lancamentos';
import { definirAlocacao } from './orcamentos';
import { resumoDoMes } from './painel';
import { criarReceita, criarReceitaPrevista } from './receitas';
import { comRollback } from './rollback';
import type { ClientePrisma } from './tipos';

async function cenario(tx: ClientePrisma) {
  const alimentacao = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
  const delivery = await criarSubcategoria(
    { budgetCategoryId: alimentacao.id, nome: 'Delivery' },
    tx,
  );
  const lazer = await criarCategoria({ nome: 'Lazer', corSlot: 3 }, tx);
  const bar = await criarSubcategoria({ budgetCategoryId: lazer.id, nome: 'Bar' }, tx);

  await definirAlocacao(
    { budgetCategoryId: alimentacao.id, vigenteDe: '2026-09', valorCentavos: 120000 },
    tx,
  );
  await definirAlocacao(
    { budgetCategoryId: lazer.id, vigenteDe: '2026-09', valorCentavos: 50000 },
    tx,
  );

  return { alimentacao, delivery, lazer, bar };
}

async function gastar(
  tx: ClientePrisma,
  categoriaId: string,
  subcategoriaId: string,
  valorCentavos: number,
) {
  await criarLancamento(
    {
      descricao: 'Gasto',
      valorCentavos,
      data: '2026-09-10',
      metodo: 'PIX',
      cardId: null,
      budgetCategoryId: categoriaId,
      subcategoryId: subcategoriaId,
      parcelas: 1,
      reembolsoAlvoCentavos: 0,
    },
    tx,
  );
}

describe('resumoDoMes', () => {
  it('monta os cards com orçado, gasto e restante', async () => {
    await comRollback(async (tx) => {
      const { alimentacao, delivery } = await cenario(tx);
      await gastar(tx, alimentacao.id, delivery.id, 94000);

      const resumo = await resumoDoMes('2026-09', tx);
      const card = resumo.cards.find((c) => c.categoriaId === alimentacao.id)!;
      expect(card.orcadoCentavos).toBe(120000);
      expect(card.gastoCentavos).toBe(94000);
      expect(card.restanteCentavos).toBe(26000);
      expect(card.estado).toBe('ATIVO');
    });
  });

  it('ordena os cards por criticidade — estourado primeiro', async () => {
    await comRollback(async (tx) => {
      const { alimentacao, delivery, lazer, bar } = await cenario(tx);
      await gastar(tx, alimentacao.id, delivery.id, 94000);
      await gastar(tx, lazer.id, bar.id, 62000);

      const resumo = await resumoDoMes('2026-09', tx);
      const nomes = resumo.cards
        .filter((c) => [alimentacao.id, lazer.id].includes(c.categoriaId))
        .map((c) => c.nome);
      expect(nomes[0]).toBe('Lazer');
    });
  });

  it('soma a despesa líquida do mês', async () => {
    await comRollback(async (tx) => {
      const { alimentacao, delivery, lazer, bar } = await cenario(tx);
      await gastar(tx, alimentacao.id, delivery.id, 94000);
      await gastar(tx, lazer.id, bar.id, 62000);

      const resumo = await resumoDoMes('2026-09', tx);
      expect(resumo.despesaLiquida).toBe(156000);
    });
  });

  it('usa a receita realizada e a prevista, e considera a maior no mês futuro', async () => {
    await comRollback(async (tx) => {
      await criarReceita(
        { descricao: 'Salário', valorCentavos: 609000, data: '2026-09-05', metodo: 'PIX' },
        tx,
      );
      await criarReceitaPrevista(
        { competencia: '2026-09', descricao: 'Salário', valorCentavos: 600000 },
        tx,
      );

      const resumo = await resumoDoMes('2026-09', tx);
      expect(resumo.receitaRealizada).toBe(609000);
      expect(resumo.receitaPrevista).toBe(600000);
      // Mês não passado usa máx(prevista, realizada).
      if (!resumo.ehMesPassado) {
        expect(resumo.receitaConsiderada).toBe(609000);
      }
    });
  });

  it('as três faixas do herói somam exatamente a receita considerada', async () => {
    await comRollback(async (tx) => {
      const { alimentacao, delivery, lazer, bar } = await cenario(tx);
      await gastar(tx, alimentacao.id, delivery.id, 94000);
      await gastar(tx, lazer.id, bar.id, 62000);
      await criarReceita(
        { descricao: 'Salário', valorCentavos: 609000, data: '2026-09-05', metodo: 'PIX' },
        tx,
      );

      const r = await resumoDoMes('2026-09', tx);
      expect(
        r.faixas.gastoCentavos + r.faixas.comprometidoCentavos + r.faixas.livreCentavos,
      ).toBe(r.receitaConsiderada);
    });
  });

  it('a faixa livre é a própria sobra projetada', async () => {
    await comRollback(async (tx) => {
      const { alimentacao, delivery } = await cenario(tx);
      await gastar(tx, alimentacao.id, delivery.id, 94000);
      await criarReceita(
        { descricao: 'Salário', valorCentavos: 609000, data: '2026-09-05', metodo: 'PIX' },
        tx,
      );

      const r = await resumoDoMes('2026-09', tx);
      expect(r.faixas.livreCentavos).toBe(r.sobraProjetada);
    });
  });

  it('a sobra realizada é receita menos despesa líquida', async () => {
    await comRollback(async (tx) => {
      const { alimentacao, delivery } = await cenario(tx);
      await gastar(tx, alimentacao.id, delivery.id, 94000);
      await criarReceita(
        { descricao: 'Salário', valorCentavos: 609000, data: '2026-09-05', metodo: 'PIX' },
        tx,
      );

      const r = await resumoDoMes('2026-09', tx);
      expect(r.sobraRealizada).toBe(609000 - 94000);
    });
  });

  it('um mês vazio devolve zeros sem quebrar', async () => {
    await comRollback(async (tx) => {
      const r = await resumoDoMes('2027-06', tx);
      expect(r.despesaLiquida).toBe(0);
      expect(r.receitaRealizada).toBe(0);
      expect(r.faixas.gastoCentavos).toBe(0);
    });
  });

  it('marca corretamente um mês claramente passado', async () => {
    await comRollback(async (tx) => {
      const r = await resumoDoMes('2020-01', tx);
      expect(r.ehMesPassado).toBe(true);
    });
  });

  it('rejeita competência inválida', async () => {
    await comRollback(async (tx) => {
      await expect(resumoDoMes('09/2026', tx)).rejects.toThrow();
    });
  });
});
