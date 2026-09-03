import { describe, expect, it } from 'vitest';
import { competenciaDe, dataCivilEm, formatarDataCivil } from '@/dominio/data';
import { avisosDoMes } from './avisos';
import { criarCartao } from './cartoes';
import { criarCategoria, criarSubcategoria } from './categorias';
import { criarLancamento } from './lancamentos';
import { definirAlocacao } from './orcamentos';
import { resumoDoMes } from './painel';
import { comRollback } from './rollback';
import type { ClientePrisma } from './tipos';

async function categoriaComGasto(
  tx: ClientePrisma,
  nome: string,
  orcadoCentavos: number,
  gastoCentavos: number,
) {
  // Cor personalizada em vez de slot: este helper cria várias categorias na
  // mesma transação (ver 'nunca mostra mais de cinco avisos'), e um slot fixo
  // colidiria com a nova checagem de unicidade — a cor não importa para o
  // que este arquivo testa.
  const cat = await criarCategoria({ nome, corSlot: null, corPersonalizada: '#123456' }, tx);
  const sub = await criarSubcategoria({ budgetCategoryId: cat.id, nome: `${nome}-sub` }, tx);
  await definirAlocacao(
    { budgetCategoryId: cat.id, vigenteDe: '2099-09', valorCentavos: orcadoCentavos },
    tx,
  );
  if (gastoCentavos > 0) {
    await criarLancamento(
      {
        descricao: `Gasto ${nome}`,
        valorCentavos: gastoCentavos,
        data: '2099-09-10',
        metodo: 'PIX',
        cardId: null,
        budgetCategoryId: cat.id,
        subcategoryId: sub.id,
        parcelas: 1,
        reembolsoAlvoCentavos: 0,
      },
      tx,
    );
  }
  return cat;
}

/**
 * Cria uma transação reembolsável (fora de qualquer orçamento, já que estes
 * testes só se importam com o cálculo do pendente de reembolso) e devolve o
 * seu id, para anexar créditos a ela.
 */
async function transacaoReembolsavel(
  tx: ClientePrisma,
  alvoCentavos: number,
  data: string,
): Promise<string> {
  const cat = await criarCategoria({ nome: 'Viagem', corSlot: 1 }, tx);
  const sub = await criarSubcategoria({ budgetCategoryId: cat.id, nome: 'Viagem-sub' }, tx);
  const { ids } = await criarLancamento(
    {
      descricao: 'Hotel compartilhado',
      valorCentavos: alvoCentavos,
      data,
      metodo: 'PIX',
      cardId: null,
      budgetCategoryId: cat.id,
      subcategoryId: sub.id,
      parcelas: 1,
      reembolsoAlvoCentavos: alvoCentavos,
    },
    tx,
  );
  return ids[0];
}

describe('avisosDoMes', () => {
  it('avisa sobre orçamento estourado', async () => {
    await comRollback(async (tx) => {
      await categoriaComGasto(tx, 'Lazer', 50000, 62000);
      const { visiveis } = await avisosDoMes('2099-09', tx);
      const estouro = visiveis.find((a) => a.texto.includes('Lazer'));
      expect(estouro?.severidade).toBe('VERMELHO');
    });
  });

  it('avisa sobre orçamento perto do limite', async () => {
    await comRollback(async (tx) => {
      await categoriaComGasto(tx, 'Transporte', 40000, 38500);
      const { visiveis } = await avisosDoMes('2099-09', tx);
      const atencao = visiveis.find((a) => a.texto.includes('Transporte'));
      expect(atencao?.severidade).toBe('AMARELO');
    });
  });

  it('não avisa sobre orçamento tranquilo', async () => {
    await comRollback(async (tx) => {
      await categoriaComGasto(tx, 'Saúde', 30000, 9000);
      const { visiveis } = await avisosDoMes('2099-09', tx);
      expect(visiveis.find((a) => a.texto.includes('Saúde'))).toBeUndefined();
    });
  });

  it('avisa sobre fatura perto de fechar, com o total real da fatura aberta', async () => {
    await comRollback(async (tx) => {
      const hoje = dataCivilEm(new Date());
      const amanha = dataCivilEm(new Date(Date.now() + 24 * 60 * 60 * 1000));
      const mesAtual = competenciaDe(hoje);

      // O dia de fechamento é calculado a partir de "amanhã" (e não fixo,
      // tipo 25), para a fatura que uma compra de HOJE abriria fechar em ~1
      // dia — dentro do limiar de 2 dias que dispara o aviso — não importa em
      // que dia real este teste rodar. `dataCivilEm` já lida com virada de
      // mês/ano.
      const cartao = await criarCartao(
        { nome: 'Cartão Teste Fatura Próxima', diaFechamento: amanha.dia, diaVencimento: 10 },
        tx,
      );

      const cat = await criarCategoria({ nome: 'Compras', corSlot: 1 }, tx);
      const sub = await criarSubcategoria(
        { budgetCategoryId: cat.id, nome: 'Compras-sub' },
        tx,
      );

      // Compra de hoje no crédito: cai exatamente na fatura "aberta" que
      // avisosDoMes calcula via faturaDaCompra — a mesma que está prestes a
      // fechar.
      await criarLancamento(
        {
          descricao: 'Compra no crédito',
          valorCentavos: 15000,
          data: formatarDataCivil(hoje),
          metodo: 'CREDITO',
          cardId: cartao.id,
          budgetCategoryId: cat.id,
          subcategoryId: sub.id,
          parcelas: 1,
          reembolsoAlvoCentavos: 0,
        },
        tx,
      );

      const { visiveis } = await avisosDoMes(mesAtual, tx);
      const aviso = visiveis.find((a) => a.texto.includes('Cartão Teste Fatura Próxima'));
      expect(aviso).toBeDefined();
      expect(aviso?.severidade).toBe('AMARELO');
      expect(aviso?.texto).toContain('R$ 150,00');
    });
  });

  it('avisa quando falta a receita prevista do mês seguinte', async () => {
    await comRollback(async (tx) => {
      const { visiveis } = await avisosDoMes('2099-09', tx);
      const cinza = visiveis.find((a) => a.severidade === 'CINZA');
      expect(cinza?.texto).toContain('2099-10');
    });
  });

  it('para de avisar quando a receita prevista do mês seguinte existe', async () => {
    await comRollback(async (tx) => {
      await tx.expectedIncome.create({
        data: { competencia: '2099-10', descricao: 'Salário', valorCentavos: 609000 },
      });
      const { visiveis } = await avisosDoMes('2099-09', tx);
      expect(visiveis.find((a) => a.severidade === 'CINZA')).toBeUndefined();
    });
  });

  it('nunca mostra mais de cinco avisos', async () => {
    await comRollback(async (tx) => {
      for (const nome of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
        await categoriaComGasto(tx, nome, 10000, 20000);
      }
      const { visiveis, ocultos } = await avisosDoMes('2099-09', tx);
      expect(visiveis).toHaveLength(5);
      expect(ocultos).toBeGreaterThan(0);
    });
  });

  it('devolve nada quando não há o que avisar', async () => {
    await comRollback(async (tx) => {
      await tx.expectedIncome.create({
        data: { competencia: '2099-10', descricao: 'Salário', valorCentavos: 609000 },
      });
      const { visiveis, ocultos } = await avisosDoMes('2099-09', tx);
      expect(visiveis).toEqual([]);
      expect(ocultos).toBe(0);
    });
  });

  it('rejeita competência inválida', async () => {
    await comRollback(async (tx) => {
      await expect(avisosDoMes('09/2026', tx)).rejects.toThrow();
    });
  });

  it('crédito de ESTORNO não abate reembolso pendente', async () => {
    await comRollback(async (tx) => {
      // Data bem antiga para garantir que o "há N dias" passe do limiar de 30
      // dias e o aviso de reembolso apareça.
      const transactionId = await transacaoReembolsavel(tx, 30000, '2026-06-01');

      // Um estorno é a operadora desfazendo a compra — não é alguém pagando
      // de volta o reembolso. Se ele abatesse o alvo, mascararia um
      // reembolso que ainda não foi recebido de verdade.
      await tx.credito.create({
        data: {
          transactionId,
          valorCentavos: 30000,
          recebidoEm: '2026-06-10',
          competenciaCredito: '2026-06',
          origem: 'ESTORNO',
        },
      });

      const { visiveis } = await avisosDoMes('2099-09', tx);
      const aviso = visiveis.find((a) => a.texto.includes('reembolsos pendentes'));
      expect(aviso).toBeDefined();
      expect(aviso?.texto).toContain('R$ 300,00');
    });
  });

  it('crédito de REEMBOLSO abate o pendente corretamente', async () => {
    await comRollback(async (tx) => {
      const transactionId = await transacaoReembolsavel(tx, 30000, '2026-06-01');

      await tx.credito.create({
        data: {
          transactionId,
          valorCentavos: 10000,
          recebidoEm: '2026-06-10',
          competenciaCredito: '2026-06',
          origem: 'REEMBOLSO',
        },
      });

      const { visiveis } = await avisosDoMes('2099-09', tx);
      const aviso = visiveis.find((a) => a.texto.includes('reembolsos pendentes'));
      expect(aviso).toBeDefined();
      expect(aviso?.texto).toContain('R$ 200,00');
    });
  });
});

describe('avisosDoMes com resumo pré-calculado', () => {
  it('devolve o mesmo resultado passando o resumo já pronto (evita recalcular)', async () => {
    await comRollback(async (tx) => {
      await categoriaComGasto(tx, 'Compras', 100000, 90000);

      const semReuso = await avisosDoMes('2099-09', tx);

      const resumo = await resumoDoMes('2099-09', tx);
      const comReuso = await avisosDoMes('2099-09', tx, resumo);

      expect(comReuso).toEqual(semReuso);
    });
  });

  it('devolve o mesmo resultado passando a Promise do resumo, ainda não resolvida', async () => {
    await comRollback(async (tx) => {
      await categoriaComGasto(tx, 'Compras', 100000, 90000);

      const semReuso = await avisosDoMes('2099-09', tx);

      const resumoPromise = resumoDoMes('2099-09', tx);
      const comReuso = await avisosDoMes('2099-09', tx, resumoPromise);

      expect(comReuso).toEqual(semReuso);
    });
  });
});
