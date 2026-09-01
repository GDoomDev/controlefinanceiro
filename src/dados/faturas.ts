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
 * origem ESTORNO. Reembolso não abate — aquele dinheiro veio por fora do
 * cartão. A conta é do domínio; aqui só buscamos as linhas.
 */
export async function totalDaFatura(
  id: string,
  cliente: ClientePrisma = prisma,
): Promise<number> {
  const transacoes = await cliente.transaction.findMany({
    where: { invoiceId: id },
    select: { status: true, valorCentavos: true, creditos: true },
  });

  return totalFatura(
    transacoes.map((t) => ({
      ativa: t.status === 'ATIVA',
      valorCentavos: t.valorCentavos,
    })),
    // Os créditos já vêm restritos às transações desta fatura pelo `where`
    // acima, então basta achatá-los. Quem decide que ESTORNO abate e
    // REEMBOLSO não é o domínio, dentro de `totalFatura`.
    transacoes.flatMap((t) =>
      t.creditos.map((c) => ({ origem: c.origem, valorCentavos: c.valorCentavos })),
    ),
  );
}
