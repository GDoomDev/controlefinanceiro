import { hexValido, slotDisponivel } from '@/dominio/paleta';

import { prisma } from './prisma';
import type { ClientePrisma } from './tipos';

export interface CategoriaComSubs {
  id: string;
  nome: string;
  ordem: number;
  corSlot: number | null;
  corPersonalizada: string | null;
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
    corPersonalizada: c.corPersonalizada,
    arquivada: c.arquivada,
    subcategorias: c.subcategorias.map((s) => ({
      id: s.id,
      nome: s.nome,
      arquivada: s.arquivada,
    })),
  }));
}

export interface NovaCategoria {
  nome: string;
  corSlot: number | null;
  corPersonalizada?: string | null;
}

export interface SlotOcupado {
  slot: number;
  categoriaNome: string;
}

/**
 * Quais dos 6 slots da paleta já pertencem a alguma categoria ativa. Uma
 * categoria arquivada libera seu slot; uma categoria com cor personalizada
 * nunca ocupou slot nenhum.
 */
export async function slotsEmUso(
  cliente: ClientePrisma = prisma,
): Promise<SlotOcupado[]> {
  const linhas = await cliente.budgetCategory.findMany({
    where: { arquivada: false, corPersonalizada: null },
    select: { corSlot: true, nome: true },
  });

  const ocupados: SlotOcupado[] = [];
  for (const l of linhas) {
    if (l.corSlot === null) continue;
    ocupados.push({ slot: l.corSlot, categoriaNome: l.nome });
  }
  return ocupados;
}

export async function criarCategoria(
  dados: NovaCategoria,
  cliente: ClientePrisma = prisma,
): Promise<{ id: string }> {
  const nome = nomeLimpo(dados.nome);
  const corPersonalizada = dados.corPersonalizada ?? null;

  const temSlot = dados.corSlot !== null;
  const temPersonalizada = corPersonalizada !== null;

  if (temSlot === temPersonalizada) {
    throw new Error(
      'Informe exatamente uma cor: um slot da paleta ou uma cor personalizada',
    );
  }

  if (temSlot) {
    if (
      !Number.isInteger(dados.corSlot) ||
      dados.corSlot! < COR_SLOT_MIN ||
      dados.corSlot! > COR_SLOT_MAX
    ) {
      throw new Error(
        `corSlot deve ser inteiro entre ${COR_SLOT_MIN} e ${COR_SLOT_MAX}: ${dados.corSlot}`,
      );
    }

    const ocupados = await slotsEmUso(cliente);
    if (!slotDisponivel(ocupados.map((o) => o.slot), dados.corSlot!)) {
      const ocupante = ocupados.find((o) => o.slot === dados.corSlot);
      throw new Error(
        `Slot ${dados.corSlot} já está em uso por "${ocupante?.categoriaNome}"`,
      );
    }
  }

  if (temPersonalizada && !hexValido(corPersonalizada!)) {
    throw new Error(
      `Cor personalizada inválida, esperado "#rrggbb": ${corPersonalizada}`,
    );
  }

  const ultima = await cliente.budgetCategory.findFirst({
    orderBy: { ordem: 'desc' },
    select: { ordem: true },
  });

  const criada = await cliente.budgetCategory.create({
    data: {
      nome,
      corSlot: dados.corSlot,
      corPersonalizada,
      ordem: (ultima?.ordem ?? 0) + 1,
    },
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

export async function buscarSubcategoria(
  id: string,
  cliente: ClientePrisma = prisma,
): Promise<{ id: string; nome: string; budgetCategoryId: string } | null> {
  return cliente.subcategory.findUnique({
    where: { id },
    select: { id: true, nome: true, budgetCategoryId: true },
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
