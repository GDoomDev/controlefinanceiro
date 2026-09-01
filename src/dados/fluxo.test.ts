import { describe, expect, it } from 'vitest';

import { MESES_PARA_TRAS } from '@/dominio/fluxo';

import { arquivarCategoria, criarCategoria, criarSubcategoria } from './categorias';
import { fluxoDeMeses } from './fluxo';
import { criarLancamento } from './lancamentos';
import { definirAlocacao } from './orcamentos';
import { resumoDoMes } from './painel';
import { criarReceita, criarReceitaPrevista } from './receitas';
import { comRollback } from './rollback';
import type { ClientePrisma } from './tipos';

async function cenario(tx: ClientePrisma, mes: string) {
  const categoria = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
  const sub = await criarSubcategoria(
    { budgetCategoryId: categoria.id, nome: 'Mercado' },
    tx,
  );
  await definirAlocacao(
    { budgetCategoryId: categoria.id, vigenteDe: mes, valorCentavos: 120000 },
    tx,
  );
  return { categoria, sub };
}

async function gastar(
  tx: ClientePrisma,
  categoriaId: string,
  subcategoryId: string,
  data: string,
  valorCentavos: number,
) {
  await criarLancamento(
    {
      descricao: 'Gasto',
      valorCentavos,
      data,
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

describe('fluxoDeMeses', () => {
  it('devolve treze pontos com o central no meio, em ordem cronológica', async () => {
    await comRollback(async (tx) => {
      const fluxo = await fluxoDeMeses('2099-09', tx);

      expect(fluxo.pontos).toHaveLength(13);
      expect(fluxo.central).toBe('2099-09');
      expect(fluxo.pontos[MESES_PARA_TRAS].competencia).toBe('2099-09');
      expect(fluxo.pontos[0].competencia).toBe('2099-03');
      expect(fluxo.pontos[12].competencia).toBe('2100-03');
    });
  });

  it('o ponto central bate com resumoDoMes num mês futuro', async () => {
    await comRollback(async (tx) => {
      const c = await cenario(tx, '2099-09');
      await gastar(tx, c.categoria.id, c.sub.id, '2099-09-10', 45000);
      await criarReceitaPrevista(
        { competencia: '2099-09', descricao: 'Salário', valorCentavos: 500000 },
        tx,
      );

      const fluxo = await fluxoDeMeses('2099-09', tx);
      const resumo = await resumoDoMes('2099-09', tx);

      const central = fluxo.pontos[MESES_PARA_TRAS];
      expect(central.momento).toBe('FUTURO');
      expect(central.sobraCentavos).toBe(resumo.sobraProjetada);
      expect(central.receitaCentavos).toBe(resumo.receitaConsiderada);
    });
  });

  it('o ponto central bate com resumoDoMes num mês passado', async () => {
    await comRollback(async (tx) => {
      const c = await cenario(tx, '2020-01');
      await gastar(tx, c.categoria.id, c.sub.id, '2020-01-10', 45000);
      await criarReceita(
        {
          descricao: 'Salário',
          valorCentavos: 500000,
          data: '2020-01-05',
          metodo: 'PIX',
        },
        tx,
      );

      const fluxo = await fluxoDeMeses('2020-01', tx);
      const resumo = await resumoDoMes('2020-01', tx);

      const central = fluxo.pontos[MESES_PARA_TRAS];
      expect(central.momento).toBe('PASSADO');
      expect(central.sobraCentavos).toBe(resumo.sobraRealizada);
      expect(central.receitaCentavos).toBe(resumo.receitaRealizada);
      // Num mês passado a "despesa" da tabela é exatamente a despesa líquida.
      // Esta é a asserção que prova que a subtração não é só uma identidade
      // algébrica: ela bate com um número calculado por outro caminho.
      expect(central.despesaCentavos).toBe(resumo.despesaLiquida);
    });
  });

  it('categoria arquivada com gasto entra na projeção, igual ao resumoDoMes', async () => {
    await comRollback(async (tx) => {
      const c = await cenario(tx, '2099-09');
      await gastar(tx, c.categoria.id, c.sub.id, '2099-09-10', 45000);
      await arquivarCategoria(c.categoria.id, tx);

      const fluxo = await fluxoDeMeses('2099-09', tx);
      const resumo = await resumoDoMes('2099-09', tx);

      expect(fluxo.pontos[MESES_PARA_TRAS].sobraCentavos).toBe(resumo.sobraProjetada);
    });
  });

  // Guarda estrutural: hoje `despesaCentavos` é definido como a subtração, então
  // esta invariante é verdadeira por construção. Ela existe para o dia em que
  // alguém calcular a despesa por outro caminho — aí ela deixa de ser trivial.
  // A asserção que realmente confere o número é a de `despesaLiquida` acima.
  it('receita menos despesa é a sobra em todos os pontos', async () => {
    await comRollback(async (tx) => {
      const c = await cenario(tx, '2099-09');
      await gastar(tx, c.categoria.id, c.sub.id, '2099-09-10', 45000);
      await gastar(tx, c.categoria.id, c.sub.id, '2099-10-10', 200000);
      await criarReceitaPrevista(
        { competencia: '2099-09', descricao: 'Salário', valorCentavos: 500000 },
        tx,
      );

      const fluxo = await fluxoDeMeses('2099-09', tx);

      for (const p of fluxo.pontos) {
        expect(p.receitaCentavos - p.despesaCentavos).toBe(p.sobraCentavos);
      }
    });
  });

  it('classifica cada ponto como passado, corrente ou futuro em ordem', async () => {
    await comRollback(async (tx) => {
      const fluxo = await fluxoDeMeses('2099-09', tx);
      const momentos = fluxo.pontos.map((p) => p.momento);

      // Janela inteiramente no futuro: nenhum passado, nenhum corrente.
      expect(momentos.every((m) => m === 'FUTURO')).toBe(true);

      const passado = await fluxoDeMeses('2020-01', tx);
      expect(passado.pontos.every((p) => p.momento === 'PASSADO')).toBe(true);
    });
  });

  it('a escala é o maior módulo de sobra da janela', async () => {
    await comRollback(async (tx) => {
      const fluxo = await fluxoDeMeses('2099-09', tx);
      const maior = Math.max(...fluxo.pontos.map((p) => Math.abs(p.sobraCentavos)));

      expect(fluxo.escalaCentavos).toBe(maior > 0 ? maior : 1);
    });
  });

  it('rejeita competência fora do formato', async () => {
    await expect(fluxoDeMeses('2099/09')).rejects.toThrow('Competência inválida');
  });

  it('ignora receita cancelada, igual a receitaRealizadaDoMes', async () => {
    await comRollback(async (tx) => {
      await criarReceita(
        { descricao: 'Salário', valorCentavos: 500000, data: '2020-01-05', metodo: 'PIX' },
        tx,
      );
      // Nenhum caminho de escrita hoje soft-cancela uma receita (`apagarReceita`
      // apaga de fato) — criamos a linha direto para simular o dia em que algum
      // caminho futuro deixar uma receita CANCELADA no banco.
      await tx.transaction.create({
        data: {
          tipo: 'RECEITA',
          descricao: 'Cancelada',
          valorCentavos: 999999,
          data: '2020-01-06',
          metodo: 'PIX',
          competencia: '2020-01',
          status: 'CANCELADA',
          cardId: null,
          invoiceId: null,
          budgetCategoryId: null,
          subcategoryId: null,
        },
      });

      const fluxo = await fluxoDeMeses('2020-01', tx);
      const resumo = await resumoDoMes('2020-01', tx);

      const central = fluxo.pontos[MESES_PARA_TRAS];
      expect(central.receitaCentavos).toBe(resumo.receitaRealizada);
    });
  });
});
