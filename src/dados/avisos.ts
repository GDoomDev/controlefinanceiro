import {
  type Aviso,
  type EntradaAvisos,
  gerarAvisos,
  limitarAvisos,
} from '@/dominio/avisos';
import {
  type Competencia,
  type DataCivil,
  dataCivilEm,
  lerDataCivil,
  somarMeses,
} from '@/dominio/data';
import { faturaDaCompra } from '@/dominio/fatura';
import { pendente } from '@/dominio/reembolso';

import { listarCartoes, regraDoCartao } from './cartoes';
import { totalDaFatura } from './faturas';
import { resumoDoMes } from './painel';
import { prisma } from './prisma';
import { receitaPrevistaDoMes } from './receitas';
import type { ClientePrisma } from './tipos';

function validarCompetencia(c: Competencia): void {
  if (!/^\d{4}-\d{2}$/.test(c)) {
    throw new Error(`Competência inválida, esperado "YYYY-MM": ${c}`);
  }
}

/** Converte uma data civil num número de dias absoluto, para subtrair datas. */
function emDiasAbsolutos(d: DataCivil): number {
  return Math.floor(Date.UTC(d.ano, d.mes - 1, d.dia) / 86400000);
}

/**
 * Avisos do mês (spec, seção 8.1). Busca as quatro fontes e entrega ao
 * domínio, que decide o que vira aviso, com que severidade e em que ordem.
 */
export async function avisosDoMes(
  mes: Competencia,
  cliente: ClientePrisma = prisma,
): Promise<{ visiveis: Aviso[]; ocultos: number }> {
  validarCompetencia(mes);

  const hoje = dataCivilEm(new Date());
  const proximoMes = somarMeses(mes, 1);

  const [resumo, cartoes, previstaProximo, reembolsaveis] = await Promise.all([
    resumoDoMes(mes, cliente),
    listarCartoes(cliente),
    receitaPrevistaDoMes(proximoMes, cliente),
    cliente.transaction.findMany({
      where: { reembolsoAlvoCentavos: { gt: 0 }, status: 'ATIVA' },
      select: {
        data: true,
        reembolsoAlvoCentavos: true,
        creditos: { select: { valorCentavos: true } },
      },
    }),
  ]);

  const faturasProximas = await Promise.all(
    cartoes.map(async (cartao) => {
      // A fatura que uma compra de HOJE pegaria é exatamente a que está aberta
      // e prestes a fechar. Reusar o motor de competência aqui evita somar
      // todas as faturas abertas do cartão — as parcelas futuras também estão
      // ABERTA, e incluí-las inflaria o aviso.
      const aberta = faturaDaCompra(hoje, regraDoCartao(cartao));

      const persistida = await cliente.invoice.findUnique({
        where: {
          cardId_competencia: { cardId: cartao.id, competencia: aberta.competencia },
        },
        select: { id: true },
      });

      return {
        cartaoNome: cartao.nome,
        diasParaFechar: emDiasAbsolutos(aberta.fechamento) - emDiasAbsolutos(hoje),
        totalCentavos: persistida ? await totalDaFatura(persistida.id, cliente) : 0,
      };
    }),
  );

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
          diasDoMaisAntigo:
            emDiasAbsolutos(hoje) - emDiasAbsolutos(lerDataCivil(dataMaisAntiga)),
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
