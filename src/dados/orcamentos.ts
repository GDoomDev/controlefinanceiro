import type { Competencia } from '@/dominio/data';
import {
  type Alocacao,
  alocacaoVigente,
  origemDaAlocacao,
} from '@/dominio/orcamento';

import { prisma } from './prisma';
import type { ClientePrisma } from './tipos';

export interface OrcamentoDoMes {
  categoriaId: string;
  nome: string;
  corSlot: number | null;
  corPersonalizada?: string | null;
  valorCentavos: number;
  /**
   * Competência da linha que está valendo — igual a `mes` quando foi definida
   * ali, anterior quando é herdada, e `null` quando não há alocação nenhuma.
   */
  vigenteDe: Competencia | null;
}

function validarCompetencia(c: Competencia): void {
  if (!/^\d{4}-\d{2}$/.test(c)) {
    throw new Error(`Competência inválida, esperado "YYYY-MM": ${c}`);
  }
}

export async function listarAlocacoes(
  budgetCategoryId: string,
  cliente: ClientePrisma = prisma,
): Promise<Alocacao[]> {
  return cliente.budgetAllocation.findMany({
    where: { budgetCategoryId },
    orderBy: { vigenteDe: 'asc' },
    select: { vigenteDe: true, valorCentavos: true },
  });
}

/** Upsert na chave (categoria, vigência): redefinir o mesmo mês substitui. */
export async function definirAlocacao(
  dados: { budgetCategoryId: string; vigenteDe: Competencia; valorCentavos: number },
  cliente: ClientePrisma = prisma,
): Promise<void> {
  validarCompetencia(dados.vigenteDe);

  if (!Number.isInteger(dados.valorCentavos) || dados.valorCentavos < 0) {
    throw new Error(
      `Valor do orçamento deve ser inteiro não negativo em centavos: ${dados.valorCentavos}`,
    );
  }

  await cliente.budgetAllocation.upsert({
    where: {
      budgetCategoryId_vigenteDe: {
        budgetCategoryId: dados.budgetCategoryId,
        vigenteDe: dados.vigenteDe,
      },
    },
    create: dados,
    update: { valorCentavos: dados.valorCentavos },
  });
}

export async function removerAlocacao(
  budgetCategoryId: string,
  vigenteDe: Competencia,
  cliente: ClientePrisma = prisma,
): Promise<void> {
  await cliente.budgetAllocation.deleteMany({
    where: { budgetCategoryId, vigenteDe },
  });
}

/**
 * Orçamento vigente de cada categoria naquele mês. Quem decide qual linha vale
 * é o domínio (`alocacaoVigente`); aqui só buscamos as linhas.
 */
export async function orcamentosDoMes(
  mes: Competencia,
  cliente: ClientePrisma = prisma,
): Promise<OrcamentoDoMes[]> {
  validarCompetencia(mes);

  const categorias = await cliente.budgetCategory.findMany({
    where: { arquivada: false },
    orderBy: { ordem: 'asc' },
    select: {
      id: true,
      nome: true,
      corSlot: true,
      corPersonalizada: true,
      alocacoes: { select: { vigenteDe: true, valorCentavos: true } },
    },
  });

  return categorias.map((c) => ({
    categoriaId: c.id,
    nome: c.nome,
    corSlot: c.corSlot,
    corPersonalizada: c.corPersonalizada,
    valorCentavos: alocacaoVigente(c.alocacoes, mes),
    vigenteDe: origemDaAlocacao(c.alocacoes, mes),
  }));
}
