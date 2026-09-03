import type { RegraCartao } from '@/dominio/fatura';

import { prisma } from './prisma';
import type { ClientePrisma } from './tipos';

export interface Cartao {
  id: string;
  nome: string;
  diaFechamento: number;
  diaVencimento: number;
  ativo: boolean;
}

function validarDia(rotulo: string, dia: number): void {
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
    throw new Error(`${rotulo} deve ser inteiro entre 1 e 31: ${dia}`);
  }
}

export async function listarCartoes(
  cliente: ClientePrisma = prisma,
): Promise<Cartao[]> {
  return cliente.card.findMany({
    where: { ativo: true },
    orderBy: { nome: 'asc' },
    select: {
      id: true,
      nome: true,
      diaFechamento: true,
      diaVencimento: true,
      ativo: true,
    },
  });
}

export async function buscarCartao(
  id: string,
  cliente: ClientePrisma = prisma,
): Promise<Cartao | null> {
  return cliente.card.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      diaFechamento: true,
      diaVencimento: true,
      ativo: true,
    },
  });
}

export async function criarCartao(
  dados: { nome: string; diaFechamento: number; diaVencimento: number },
  cliente: ClientePrisma = prisma,
): Promise<{ id: string }> {
  const nome = dados.nome.trim();
  if (nome.length === 0) {
    throw new Error('Nome do cartão não pode ser vazio');
  }
  validarDia('Dia de fechamento', dados.diaFechamento);
  validarDia('Dia de vencimento', dados.diaVencimento);

  return cliente.card.create({
    data: {
      nome,
      diaFechamento: dados.diaFechamento,
      diaVencimento: dados.diaVencimento,
    },
    select: { id: true },
  });
}

export async function editarCartao(
  id: string,
  dados: { nome: string; diaFechamento: number; diaVencimento: number },
  cliente: ClientePrisma = prisma,
): Promise<void> {
  const nome = dados.nome.trim();
  if (nome.length === 0) {
    throw new Error('Nome do cartão não pode ser vazio');
  }
  validarDia('Dia de fechamento', dados.diaFechamento);
  validarDia('Dia de vencimento', dados.diaVencimento);

  await cliente.card.update({
    where: { id },
    data: {
      nome,
      diaFechamento: dados.diaFechamento,
      diaVencimento: dados.diaVencimento,
    },
  });
}

export async function arquivarCartao(
  id: string,
  cliente: ClientePrisma = prisma,
): Promise<void> {
  await cliente.card.update({
    where: { id },
    data: { ativo: false },
  });
}

/** Ponte entre a linha do banco e o tipo que o domínio espera. Pura. */
export function regraDoCartao(cartao: Cartao): RegraCartao {
  return {
    diaFechamento: cartao.diaFechamento,
    diaVencimento: cartao.diaVencimento,
  };
}
