import { type Competencia, lerDataCivil } from '@/dominio/data';
import {
  type ModoCredito,
  type ParcelaEstornavel,
  planejarEstorno,
  planejarEstornoParcial,
} from '@/dominio/reembolso';

import { prisma } from './prisma';
import type { ClientePrisma } from './tipos';

export interface AlvoDoEstorno {
  /** A linha que o usuário clicou. */
  transactionId: string;
  descricao: string;
  grupoParcelamentoId: string | null;
  /** Valor da compra inteira — a soma das parcelas. */
  valorTotalCentavos: number;
  /** Em ordem de competência. */
  parcelas: ParcelaEstornavel[];
}

function validarCompetencia(c: Competencia): void {
  if (!/^\d{4}-\d{2}$/.test(c)) {
    throw new Error(`Competência inválida, esperado "YYYY-MM": ${c}`);
  }
}

/**
 * Quais linhas o estorno atinge. Se a compra é parcelada, é o grupo inteiro —
 * o spec (seção 6.2) diz que a ação existe "no lançamento à vista e no grupo
 * de parcelamento inteiro", nunca numa parcela solta.
 *
 * Parcela sem fatura conta como ABERTA: o spec põe "ABERTA ou ainda não
 * criada" na mesma linha da tabela, e um lançamento no PIX nunca tem fatura.
 */
export async function alvoDoEstorno(
  transactionId: string,
  cliente: ClientePrisma = prisma,
): Promise<AlvoDoEstorno> {
  const clicada = await cliente.transaction.findUnique({
    where: { id: transactionId },
    select: { descricao: true, grupoParcelamentoId: true },
  });

  if (!clicada) {
    throw new Error(`Lançamento não encontrado: ${transactionId}`);
  }

  const linhas = await cliente.transaction.findMany({
    where: clicada.grupoParcelamentoId
      ? { grupoParcelamentoId: clicada.grupoParcelamentoId }
      : { id: transactionId },
    orderBy: { competencia: 'asc' },
    select: {
      id: true,
      competencia: true,
      valorCentavos: true,
      invoice: { select: { status: true } },
    },
  });

  const parcelas: ParcelaEstornavel[] = linhas.map((l) => ({
    id: l.id,
    competencia: l.competencia,
    valorCentavos: l.valorCentavos,
    statusFatura: l.invoice?.status ?? 'ABERTA',
  }));

  return {
    transactionId,
    descricao: clicada.descricao,
    grupoParcelamentoId: clicada.grupoParcelamentoId,
    valorTotalCentavos: parcelas.reduce((total, p) => total + p.valorCentavos, 0),
    parcelas,
  };
}

/**
 * Aplica o plano que o domínio montou. Cancelamentos e créditos entram na
 * mesma transação de banco: um estorno que cancelasse as parcelas futuras e
 * falhasse ao criar os créditos tiraria a compra da projeção sem devolver o
 * dinheiro (spec, seção 13).
 */
export async function aplicarEstorno(
  dados: {
    transactionId: string;
    modo: ModoCredito;
    competenciaCredito: Competencia;
    recebidoEm: string;
  },
  cliente: ClientePrisma = prisma,
): Promise<void> {
  lerDataCivil(dados.recebidoEm);
  validarCompetencia(dados.competenciaCredito);

  const alvo = await alvoDoEstorno(dados.transactionId, cliente);
  const plano = planejarEstorno(alvo.parcelas, dados.modo, dados.competenciaCredito);

  const gravar = async (tx: ClientePrisma): Promise<void> => {
    if (plano.canceladas.length > 0) {
      // Cancelada, nunca apagada: o histórico continua explicando por que a
      // compra sumiu da projeção (spec, seção 13).
      await tx.transaction.updateMany({
        where: { id: { in: plano.canceladas } },
        data: { status: 'CANCELADA' },
      });
    }

    for (const credito of plano.creditos) {
      await tx.credito.create({
        data: {
          transactionId: credito.transactionId,
          valorCentavos: credito.valorCentavos,
          recebidoEm: dados.recebidoEm,
          competenciaCredito: credito.competenciaCredito,
          origem: 'ESTORNO',
        },
      });
    }
  };

  // Mesmo padrão de `criarLancamento`: reaproveita a transação quando já
  // estamos dentro de uma. O `$transaction` só existe no cliente de topo.
  if ('$transaction' in cliente) {
    await cliente.$transaction((tx) => gravar(tx));
  } else {
    await gravar(cliente);
  }
}

/**
 * Estorno parcial em valor (spec, seção 6.2): devolveram um item de uma compra
 * maior. Nenhuma parcela é cancelada — elas seguem sendo cobradas — e o valor
 * vira crédito na competência informada.
 *
 * O teto é o valor da COMPRA inteira, não o da parcela clicada: um item
 * devolvido pode custar mais que uma parcela.
 */
export async function aplicarEstornoParcial(
  dados: {
    transactionId: string;
    valorCentavos: number;
    competenciaCredito: Competencia;
    recebidoEm: string;
  },
  cliente: ClientePrisma = prisma,
): Promise<void> {
  lerDataCivil(dados.recebidoEm);
  validarCompetencia(dados.competenciaCredito);

  const alvo = await alvoDoEstorno(dados.transactionId, cliente);

  // Valida sinal e integralidade; lança se o valor não for positivo.
  const credito = planejarEstornoParcial(
    dados.transactionId,
    dados.valorCentavos,
    dados.competenciaCredito,
  );

  if (credito.valorCentavos > alvo.valorTotalCentavos) {
    throw new Error(
      `Estorno de ${credito.valorCentavos} excede o valor da compra, de ${alvo.valorTotalCentavos}`,
    );
  }

  await cliente.credito.create({
    data: {
      transactionId: credito.transactionId,
      valorCentavos: credito.valorCentavos,
      recebidoEm: dados.recebidoEm,
      competenciaCredito: credito.competenciaCredito,
      origem: 'ESTORNO',
    },
  });
}
