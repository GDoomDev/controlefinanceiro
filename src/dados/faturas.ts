import { type Competencia, formatarDataCivil } from '@/dominio/data';
import { faturaDaCompetencia, totalFatura } from '@/dominio/fatura';

import { buscarCartao, regraDoCartao } from './cartoes';
import { prisma } from './prisma';
import type { ClientePrisma } from './tipos';

export type StatusFatura = 'ABERTA' | 'FECHADA' | 'PAGA';

export interface FaturaPersistida {
  id: string;
  cardId: string;
  competencia: Competencia;
  /** "YYYY-MM-DD" */
  dataFechamento: string;
  /** "YYYY-MM-DD" */
  dataVencimento: string;
  status: StatusFatura;
  /** "YYYY-MM-DD" */
  pagaEm: string | null;
}

const CAMPOS = {
  id: true,
  cardId: true,
  competencia: true,
  dataFechamento: true,
  dataVencimento: true,
  status: true,
  pagaEm: true,
} as const;

function validarDataCivil(texto: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    throw new Error(`Data civil inválida, esperado "YYYY-MM-DD": ${texto}`);
  }
}

/**
 * Encontra a fatura daquele cartão naquela competência, ou cria com as datas
 * que o domínio calcula. Idempotente — chamar de novo devolve a mesma fatura.
 */
export async function garantirFatura(
  cardId: string,
  competencia: Competencia,
  cliente: ClientePrisma = prisma,
): Promise<FaturaPersistida> {
  const existente = await cliente.invoice.findUnique({
    where: { cardId_competencia: { cardId, competencia } },
    select: CAMPOS,
  });
  if (existente) return existente;

  const cartao = await buscarCartao(cardId, cliente);
  if (!cartao) {
    throw new Error(`Cartão não encontrado: ${cardId}`);
  }

  const calculada = faturaDaCompetencia(competencia, regraDoCartao(cartao));

  return cliente.invoice.create({
    data: {
      cardId,
      competencia,
      dataFechamento: formatarDataCivil(calculada.fechamento),
      dataVencimento: formatarDataCivil(calculada.vencimento),
    },
    select: CAMPOS,
  });
}

export async function listarFaturas(
  cardId: string,
  cliente: ClientePrisma = prisma,
): Promise<FaturaPersistida[]> {
  return cliente.invoice.findMany({
    where: { cardId },
    orderBy: { competencia: 'asc' },
    select: CAMPOS,
  });
}

/**
 * Mesma coisa que `listarFaturas`, para vários cartões de uma vez — 1
 * consulta em vez de 1 por cartão (a tela de Cartões chamava `listarFaturas`
 * num loop, uma consulta por cartão).
 */
export async function listarFaturasDeCartoes(
  cardIds: string[],
  cliente: ClientePrisma = prisma,
): Promise<Map<string, FaturaPersistida[]>> {
  const resultado = new Map<string, FaturaPersistida[]>();
  if (cardIds.length === 0) return resultado;

  const faturas = await cliente.invoice.findMany({
    where: { cardId: { in: cardIds } },
    orderBy: { competencia: 'asc' },
    select: CAMPOS,
  });

  for (const f of faturas) {
    const lista = resultado.get(f.cardId) ?? [];
    lista.push(f);
    resultado.set(f.cardId, lista);
  }
  return resultado;
}

async function statusAtual(
  id: string,
  cliente: ClientePrisma,
): Promise<StatusFatura> {
  const fatura = await cliente.invoice.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!fatura) {
    throw new Error(`Fatura não encontrada: ${id}`);
  }
  return fatura.status;
}

/** A máquina de estados só anda para frente: ABERTA → FECHADA → PAGA. */
export async function fecharFatura(
  id: string,
  cliente: ClientePrisma = prisma,
): Promise<void> {
  const status = await statusAtual(id, cliente);
  if (status !== 'ABERTA') {
    throw new Error(`Só é possível fechar uma fatura ABERTA; status atual: ${status}`);
  }
  await cliente.invoice.update({ where: { id }, data: { status: 'FECHADA' } });
}

export async function pagarFatura(
  id: string,
  pagaEm: string,
  cliente: ClientePrisma = prisma,
): Promise<void> {
  validarDataCivil(pagaEm);
  const status = await statusAtual(id, cliente);
  if (status !== 'FECHADA') {
    throw new Error(`Só é possível pagar uma fatura FECHADA; status atual: ${status}`);
  }
  await cliente.invoice.update({
    where: { id },
    data: { status: 'PAGA', pagaEm },
  });
}

/**
 * Total da fatura (spec, seção 4): transações ativas menos os créditos de
 * origem ESTORNO cuja competenciaCredito é a desta fatura. Reembolso não
 * abate — aquele dinheiro veio por fora do cartão. A conta é do domínio;
 * aqui só buscamos as linhas.
 *
 * Importante: o crédito NÃO é buscado a partir das transações vinculadas à
 * fatura. Um estorno consolidado (modo 'UNICO' em `planejarEstorno`) carimba
 * `competenciaCredito` com o mês em que a operadora de fato lançou o
 * estorno — que pode ser diferente do mês da compra original. É a fatura
 * daquela competência que deve ser abatida, mesmo que nenhuma transação
 * própria esteja vinculada a ela.
 */
export async function totalDaFatura(
  id: string,
  cliente: ClientePrisma = prisma,
): Promise<number> {
  const fatura = await cliente.invoice.findUnique({
    where: { id },
    select: { competencia: true, cardId: true },
  });
  if (!fatura) {
    throw new Error(`Fatura não encontrada: ${id}`);
  }

  const transacoes = await cliente.transaction.findMany({
    where: { invoiceId: id },
    select: { status: true, valorCentavos: true },
  });

  const creditos = await cliente.credito.findMany({
    where: {
      competenciaCredito: fatura.competencia,
      transaction: { cardId: fatura.cardId },
    },
    select: { origem: true, valorCentavos: true },
  });

  return totalFatura(
    transacoes.map((t) => ({
      ativa: t.status === 'ATIVA',
      valorCentavos: t.valorCentavos,
    })),
    creditos.map((c) => ({ origem: c.origem, valorCentavos: c.valorCentavos })),
  );
}

/**
 * Mesma conta de `totalDaFatura`, para várias faturas de uma vez — 2
 * consultas no total (transações + créditos, cada uma trazendo todas as
 * faturas pedidas de uma vez), em vez de 3 consultas POR fatura. A tela de
 * Cartões chamava `totalDaFatura` num loop; com várias faturas por cartão,
 * isso virava dezenas de consultas sequenciais numa única visita à tela.
 *
 * Recebe a fatura já carregada (não busca de novo por id) — quem já tem a
 * lista de `listarFaturas`/`listarFaturasDeCartoes` não paga essa consulta
 * outra vez.
 */
export async function totaisDasFaturas(
  faturas: Array<Pick<FaturaPersistida, 'id' | 'competencia' | 'cardId'>>,
  cliente: ClientePrisma = prisma,
): Promise<Map<string, number>> {
  const resultado = new Map<string, number>();
  if (faturas.length === 0) return resultado;

  const ids = faturas.map((f) => f.id);
  const cardIds = [...new Set(faturas.map((f) => f.cardId))];
  const competencias = [...new Set(faturas.map((f) => f.competencia))];

  const [transacoes, creditos] = await Promise.all([
    cliente.transaction.findMany({
      where: { invoiceId: { in: ids } },
      select: { invoiceId: true, status: true, valorCentavos: true },
    }),
    cliente.credito.findMany({
      where: {
        competenciaCredito: { in: competencias },
        transaction: { cardId: { in: cardIds } },
      },
      select: {
        origem: true,
        valorCentavos: true,
        competenciaCredito: true,
        transaction: { select: { cardId: true } },
      },
    }),
  ]);

  const transacoesPorFatura = new Map<string, typeof transacoes>();
  for (const t of transacoes) {
    if (!t.invoiceId) continue;
    const lista = transacoesPorFatura.get(t.invoiceId) ?? [];
    lista.push(t);
    transacoesPorFatura.set(t.invoiceId, lista);
  }

  // Créditos não têm invoiceId — casam por (cardId, competenciaCredito),
  // igual à busca individual de `totalDaFatura`. Agrupar pela mesma chave
  // aqui evita que o crédito de uma fatura vaze pra outra do mesmo cartão.
  const creditosPorCartaoCompetencia = new Map<string, typeof creditos>();
  for (const c of creditos) {
    const chave = `${c.transaction.cardId}::${c.competenciaCredito}`;
    const lista = creditosPorCartaoCompetencia.get(chave) ?? [];
    lista.push(c);
    creditosPorCartaoCompetencia.set(chave, lista);
  }

  for (const f of faturas) {
    const transacoesDaFatura = transacoesPorFatura.get(f.id) ?? [];
    const creditosDaFatura =
      creditosPorCartaoCompetencia.get(`${f.cardId}::${f.competencia}`) ?? [];

    resultado.set(
      f.id,
      totalFatura(
        transacoesDaFatura.map((t) => ({
          ativa: t.status === 'ATIVA',
          valorCentavos: t.valorCentavos,
        })),
        creditosDaFatura.map((c) => ({
          origem: c.origem,
          valorCentavos: c.valorCentavos,
        })),
      ),
    );
  }

  return resultado;
}
