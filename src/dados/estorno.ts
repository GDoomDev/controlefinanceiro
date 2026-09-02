import { type Competencia, lerDataCivil } from '@/dominio/data';
import {
  type ModoCredito,
  type ParcelaEstornavel,
  estornoJaAplicado,
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
  /**
   * Verdadeiro quando toda parcela do grupo já está CANCELADA ou já tem
   * crédito de ESTORNO — a compra já foi estornada por inteiro antes.
   * `aplicarEstorno` rejeita reaplicação quando isto é verdadeiro.
   */
  estornadoPorInteiro: boolean;
  /**
   * Quanto desta compra já foi liberado: parcelas canceladas (nunca chegaram
   * a ser cobradas) mais créditos de ESTORNO já lançados. É o que abate o
   * teto de um novo estorno parcial — sem isto, estornos parciais repetidos
   * poderiam devolver mais dinheiro do que a compra vale (spec, seção 6.2).
   */
  jaLiberadoCentavos: number;
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
      status: true,
      invoice: { select: { status: true } },
      // Só para saber se esta parcela já foi estornada antes — nenhuma
      // aritmética de dinheiro usa o valor aqui além da soma abaixo.
      creditos: { where: { origem: 'ESTORNO' }, select: { valorCentavos: true } },
    },
  });

  const parcelas: ParcelaEstornavel[] = linhas.map((l) => ({
    id: l.id,
    competencia: l.competencia,
    valorCentavos: l.valorCentavos,
    statusFatura: l.invoice?.status ?? 'ABERTA',
  }));

  const jaLiberadoCentavos = linhas.reduce((total, l) => {
    const jaCreditado = l.creditos.reduce((soma, c) => soma + c.valorCentavos, 0);
    const liberadoPeloCancelamento = l.status === 'CANCELADA' ? l.valorCentavos : 0;
    return total + jaCreditado + liberadoPeloCancelamento;
  }, 0);

  return {
    transactionId,
    descricao: clicada.descricao,
    grupoParcelamentoId: clicada.grupoParcelamentoId,
    valorTotalCentavos: parcelas.reduce((total, p) => total + p.valorCentavos, 0),
    parcelas,
    estornadoPorInteiro: estornoJaAplicado(
      linhas.map((l) => ({
        cancelada: l.status === 'CANCELADA',
        temCreditoEstorno: l.creditos.length > 0,
      })),
    ),
    jaLiberadoCentavos,
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

  // Sem isto, clicar "estornar" de novo numa parcela que ficou ATIVA (foi
  // creditada, não cancelada) mintaria um segundo crédito de ESTORNO para o
  // mesmo dinheiro — a linha continua aparecendo em /lancamentos com o link.
  if (alvo.estornadoPorInteiro) {
    throw new Error('Esta compra já foi estornada');
  }

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

  // O teto é o que ainda não foi liberado desta compra — não o valor total
  // bruto. Sem descontar cancelamentos e créditos de ESTORNO já lançados,
  // estornos parciais repetidos (ou um parcial depois de um estorno por
  // inteiro) devolveriam mais dinheiro do que a compra vale.
  const restante = alvo.valorTotalCentavos - alvo.jaLiberadoCentavos;
  if (credito.valorCentavos > restante) {
    throw new Error(
      `Estorno de ${credito.valorCentavos} excede o valor da compra, de ${restante}`,
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
