import { prisma } from './prisma';
import type { ClientePrisma } from './tipos';

export interface CategoriaComSubs {
  id: string;
  nome: string;
  ordem: number;
  corSlot: number;
  arquivada: boolean;
  subcategorias: Array<{ id: string; nome: string; arquivada: boolean }>;
}

/** O spec (seção 9) valida exatamente seis cores para daltonismo. */
const COR_SLOT_MIN = 1;
const COR_SLOT_MAX = 6;

function nomeLimpo(nome: string): string {
  const limpo = nome.trim();
  if (limpo.length === 0) {
    throw new Error('Nome não pode ser vazio');
  }
  return limpo;
}

export async function listarCategorias(
  cliente: ClientePrisma = prisma,
): Promise<CategoriaComSubs[]> {
  const linhas = await cliente.budgetCategory.findMany({
    where: { arquivada: false },
    orderBy: { ordem: 'asc' },
    include: {
      subcategorias: {
        where: { arquivada: false },
        orderBy: { nome: 'asc' },
      },
    },
  });

  return linhas.map((c) => ({
    id: c.id,
    nome: c.nome,
    ordem: c.ordem,
    corSlot: c.corSlot,
    arquivada: c.arquivada,
    subcategorias: c.subcategorias.map((s) => ({
      id: s.id,
      nome: s.nome,
      arquivada: s.arquivada,
    })),
  }));
}

export async function criarCategoria(
  dados: { nome: string; corSlot: number },
  cliente: ClientePrisma = prisma,
): Promise<{ id: string }> {
  const nome = nomeLimpo(dados.nome);

  if (
    !Number.isInteger(dados.corSlot) ||
    dados.corSlot < COR_SLOT_MIN ||
    dados.corSlot > COR_SLOT_MAX
  ) {
    throw new Error(
      `corSlot deve ser inteiro entre ${COR_SLOT_MIN} e ${COR_SLOT_MAX}: ${dados.corSlot}`,
    );
  }

  const ultima = await cliente.budgetCategory.findFirst({
    orderBy: { ordem: 'desc' },
    select: { ordem: true },
  });

  const criada = await cliente.budgetCategory.create({
    data: { nome, corSlot: dados.corSlot, ordem: (ultima?.ordem ?? 0) + 1 },
    select: { id: true },
  });

  return criada;
}

export async function criarSubcategoria(
  dados: { budgetCategoryId: string; nome: string },
  cliente: ClientePrisma = prisma,
): Promise<{ id: string }> {
  const nome = nomeLimpo(dados.nome);

  return cliente.subcategory.create({
    data: { budgetCategoryId: dados.budgetCategoryId, nome },
    select: { id: true },
  });
}

export async function arquivarCategoria(
  id: string,
  cliente: ClientePrisma = prisma,
): Promise<void> {
  await cliente.budgetCategory.update({
    where: { id },
    data: { arquivada: true },
  });
}
