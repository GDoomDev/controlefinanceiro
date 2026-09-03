import {
  type Aviso,
  type EntradaAvisos,
  gerarAvisos,
  limitarAvisos,
} from '@/dominio/avisos';
import {
  type Competencia,
  dataCivilEm,
  diasEntre,
  lerDataCivil,
  somarMeses,
} from '@/dominio/data';
import { faturaDaCompra } from '@/dominio/fatura';
import { pendente } from '@/dominio/reembolso';

import { listarCartoes, regraDoCartao } from './cartoes';
import { totaisDasFaturas } from './faturas';
import { resumoDoMes, type ResumoDoMes } from './painel';
import { prisma } from './prisma';
import { receitaPrevistaDoMes } from './receitas';
import type { ClientePrisma } from './tipos';

function validarCompetencia(c: Competencia): void {
  if (!/^\d{4}-\d{2}$/.test(c)) {
    throw new Error(`Competência inválida, esperado "YYYY-MM": ${c}`);
  }
}

/**
 * Avisos do mês (spec, seção 8.1). Busca as quatro fontes e entrega ao
 * domínio, que decide o que vira aviso, com que severidade e em que ordem.
 *
 * `resumoJaCalculado` é opcional: quem já pediu `resumoDoMes` pro mesmo mês
 * (a home page pede os dois) pode passar o resultado (ou a Promise ainda em
 * voo, pra não perder o paralelismo) em vez de deixar `avisosDoMes` calcular
 * tudo de novo por baixo dos panos.
 */
export async function avisosDoMes(
  mes: Competencia,
  cliente: ClientePrisma = prisma,
  resumoJaCalculado?: ResumoDoMes | Promise<ResumoDoMes>,
): Promise<{ visiveis: Aviso[]; ocultos: number }> {
  validarCompetencia(mes);

  const hoje = dataCivilEm(new Date());
  const proximoMes = somarMeses(mes, 1);

  const [resumo, cartoes, previstaProximo, reembolsaveis] = await Promise.all([
    resumoJaCalculado ?? resumoDoMes(mes, cliente),
    listarCartoes(cliente),
    receitaPrevistaDoMes(proximoMes, cliente),
    cliente.transaction.findMany({
      where: { reembolsoAlvoCentavos: { gt: 0 }, status: 'ATIVA' },
      select: {
        data: true,
        reembolsoAlvoCentavos: true,
        creditos: { where: { origem: 'REEMBOLSO' }, select: { valorCentavos: true } },
      },
    }),
  ]);

  // A fatura que uma compra de HOJE pegaria é exatamente a que está aberta e
  // prestes a fechar. Reusar o motor de competência aqui evita somar todas as
  // faturas abertas do cartão — as parcelas futuras também estão ABERTA, e
  // incluí-las inflaria o aviso.
  const abertaPorCartao = new Map(
    cartoes.map((cartao) => [cartao.id, faturaDaCompra(hoje, regraDoCartao(cartao))]),
  );

  // 1 consulta pra achar as faturas de todos os cartões de uma vez (em vez de
  // 1 findUnique por cartão), mais as consultas em lote de `totaisDasFaturas`
  // (em vez de até 3 consultas de total por cartão).
  const faturasEncontradas =
    cartoes.length === 0
      ? []
      : await cliente.invoice.findMany({
          where: {
            OR: cartoes.map((cartao) => ({
              cardId: cartao.id,
              competencia: abertaPorCartao.get(cartao.id)!.competencia,
            })),
          },
          select: { id: true, cardId: true, competencia: true },
        });
  const faturaPorCartao = new Map(faturasEncontradas.map((f) => [f.cardId, f]));
  const totais = await totaisDasFaturas(faturasEncontradas, cliente);

  const faturasProximas = cartoes.map((cartao) => {
    const aberta = abertaPorCartao.get(cartao.id)!;
    const persistida = faturaPorCartao.get(cartao.id);

    return {
      cartaoNome: cartao.nome,
      diasParaFechar: diasEntre(hoje, aberta.fechamento),
      totalCentavos: persistida ? (totais.get(persistida.id) ?? 0) : 0,
    };
  });

  let pendenteTotal = 0;
  let dataMaisAntiga: string | null = null;

  for (const t of reembolsaveis) {
    const restante = pendente(t.reembolsoAlvoCentavos, t.creditos);
    if (restante <= 0) continue;
    pendenteTotal += restante;
    if (dataMaisAntiga === null || t.data < dataMaisAntiga) {
      dataMaisAntiga = t.data;
    }
  }

  const reembolsoPendente =
    pendenteTotal > 0 && dataMaisAntiga !== null
      ? {
          totalCentavos: pendenteTotal,
          diasDoMaisAntigo: diasEntre(lerDataCivil(dataMaisAntiga), hoje),
        }
      : null;

  const entrada: EntradaAvisos = {
    orcamentos: resumo.cards.map((c) => ({
      nome: c.nome,
      orcadoCentavos: c.orcadoCentavos,
      gastoCentavos: c.gastoCentavos,
    })),
    faturasProximas,
    reembolsoPendente,
    receitaPrevistaDoProximoMesInformada: previstaProximo > 0,
    proximoMes,
  };

  return limitarAvisos(gerarAvisos(entrada));
}
