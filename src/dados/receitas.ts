import { type Competencia, competenciaDe, lerDataCivil } from '@/dominio/data';
import type { MetodoPagamento } from '@/dominio/lancamento';

import { prisma } from './prisma';
import type { ClientePrisma } from './tipos';

export interface NovaReceita {
  descricao: string;
  valorCentavos: number;
  /** "YYYY-MM-DD" */
  data: string;
  metodo: MetodoPagamento;
}

export interface ReceitaListada {
  id: string;
  descricao: string;
  valorCentavos: number;
  data: string;
  competencia: Competencia;
  metodo: MetodoPagamento;
}

export interface ReceitaPrevistaListada {
  id: string;
  competencia: Competencia;
  descricao: string;
  valorCentavos: number;
}

function validarCompetencia(c: Competencia): void {
  if (!/^\d{4}-\d{2}$/.test(c)) {
    throw new Error(`Competência inválida, esperado "YYYY-MM": ${c}`);
  }
}

function validarValor(valorCentavos: number): void {
  if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) {
    throw new Error(`Valor deve ser inteiro positivo em centavos: ${valorCentavos}`);
  }
}

function descricaoLimpa(descricao: string): string {
  const limpa = descricao.trim();
  if (limpa.length === 0) {
    throw new Error('Descrição não pode ser vazia');
  }
  return limpa;
}

/**
 * Receita é uma `Transaction` com `tipo = 'RECEITA'`. Nunca tem categoria,
 * subcategoria, cartão ou fatura (spec, seção 3) — e por não passar por cartão,
 * a competência é sempre o mês da própria data.
 */
export async function criarReceita(
  entrada: NovaReceita,
  cliente: ClientePrisma = prisma,
): Promise<{ id: string }> {
  const descricao = descricaoLimpa(entrada.descricao);
  validarValor(entrada.valorCentavos);
  const data = lerDataCivil(entrada.data);

  return cliente.transaction.create({
    data: {
      tipo: 'RECEITA',
      descricao,
      valorCentavos: entrada.valorCentavos,
      data: entrada.data,
      metodo: entrada.metodo,
      competencia: competenciaDe(data),
      cardId: null,
      invoiceId: null,
      budgetCategoryId: null,
      subcategoryId: null,
    },
    select: { id: true },
  });
}

export async function listarReceitas(
  competencia: Competencia,
  cliente: ClientePrisma = prisma,
): Promise<ReceitaListada[]> {
  validarCompetencia(competencia);

  return cliente.transaction.findMany({
    where: { competencia, tipo: 'RECEITA', status: 'ATIVA' },
    orderBy: [{ data: 'desc' }, { descricao: 'asc' }],
    select: {
      id: true,
      descricao: true,
      valorCentavos: true,
      data: true,
      competencia: true,
      metodo: true,
    },
  });
}

export async function apagarReceita(
  id: string,
  cliente: ClientePrisma = prisma,
): Promise<void> {
  await cliente.transaction.delete({ where: { id } });
}

export async function receitaRealizadaDoMes(
  competencia: Competencia,
  cliente: ClientePrisma = prisma,
): Promise<number> {
  validarCompetencia(competencia);

  const soma = await cliente.transaction.aggregate({
    where: { competencia, tipo: 'RECEITA', status: 'ATIVA' },
    _sum: { valorCentavos: true },
  });

  return soma._sum.valorCentavos ?? 0;
}

/**
 * Receita prevista é `ExpectedIncome` — outra tabela, não um lançamento. Ela
 * existe para dar numerador à projeção de meses que ainda não aconteceram.
 */
export async function criarReceitaPrevista(
  dados: { competencia: Competencia; descricao: string; valorCentavos: number },
  cliente: ClientePrisma = prisma,
): Promise<{ id: string }> {
  validarCompetencia(dados.competencia);
  validarValor(dados.valorCentavos);
  const descricao = descricaoLimpa(dados.descricao);

  return cliente.expectedIncome.create({
    data: { competencia: dados.competencia, descricao, valorCentavos: dados.valorCentavos },
    select: { id: true },
  });
}

export async function listarReceitasPrevistas(
  competencia: Competencia,
  cliente: ClientePrisma = prisma,
): Promise<ReceitaPrevistaListada[]> {
  validarCompetencia(competencia);

  return cliente.expectedIncome.findMany({
    where: { competencia },
    orderBy: { descricao: 'asc' },
    select: { id: true, competencia: true, descricao: true, valorCentavos: true },
  });
}

export async function apagarReceitaPrevista(
  id: string,
  cliente: ClientePrisma = prisma,
): Promise<void> {
  await cliente.expectedIncome.delete({ where: { id } });
}

export async function receitaPrevistaDoMes(
  competencia: Competencia,
  cliente: ClientePrisma = prisma,
): Promise<number> {
  validarCompetencia(competencia);

  const soma = await cliente.expectedIncome.aggregate({
    where: { competencia },
    _sum: { valorCentavos: true },
  });

  return soma._sum.valorCentavos ?? 0;
}
