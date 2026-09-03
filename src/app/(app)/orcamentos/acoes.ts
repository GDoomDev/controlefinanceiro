'use server';

import { revalidatePath } from 'next/cache';

import {
  arquivarCategoria,
  arquivarSubcategoria,
  criarCategoria,
  criarSubcategoria,
  editarSubcategoria,
} from '@/dados/categorias';
import { definirAlocacao, removerAlocacao } from '@/dados/orcamentos';
import { emCentavos } from '@/dominio/dinheiro';

export async function acaoCriarCategoria(dadosForm: FormData): Promise<void> {
  const corSlotBruto = String(dadosForm.get('corSlot') ?? '');
  const corPersonalizadaBruta = String(dadosForm.get('corPersonalizada') ?? '');

  await criarCategoria({
    nome: String(dadosForm.get('nome') ?? ''),
    corSlot: corSlotBruto ? Number(corSlotBruto) : null,
    corPersonalizada: corPersonalizadaBruta ? corPersonalizadaBruta : null,
  });
  revalidatePath('/orcamentos');
  revalidatePath('/');
  revalidatePath('/areas');
  revalidatePath('/lancamentos/novo');
}

export async function acaoCriarSubcategoria(dadosForm: FormData): Promise<void> {
  await criarSubcategoria({
    budgetCategoryId: String(dadosForm.get('budgetCategoryId') ?? ''),
    nome: String(dadosForm.get('nome') ?? ''),
  });
  revalidatePath('/orcamentos');
  // /lancamentos precisa revalidar: a seção Despesas fixas ali mostra/seleciona categorias, subcategorias e cartões.
  revalidatePath('/lancamentos');
  revalidatePath('/lancamentos/novo');
}

export async function acaoEditarSubcategoria(dadosForm: FormData): Promise<void> {
  await editarSubcategoria(String(dadosForm.get('id') ?? ''), {
    nome: String(dadosForm.get('nome') ?? ''),
  });
  revalidatePath('/orcamentos');
  // /lancamentos precisa revalidar: a seção Despesas fixas ali mostra/seleciona categorias, subcategorias e cartões.
  revalidatePath('/lancamentos');
  revalidatePath('/lancamentos/novo');
}

export async function acaoArquivarSubcategoria(dadosForm: FormData): Promise<void> {
  await arquivarSubcategoria(String(dadosForm.get('id') ?? ''));
  revalidatePath('/orcamentos');
  // /lancamentos precisa revalidar: a seção Despesas fixas ali mostra/seleciona categorias, subcategorias e cartões.
  revalidatePath('/lancamentos');
  revalidatePath('/lancamentos/novo');
}

export async function acaoExcluirCategoria(dadosForm: FormData): Promise<void> {
  await arquivarCategoria(String(dadosForm.get('id') ?? ''));
  revalidatePath('/orcamentos');
  revalidatePath('/');
  revalidatePath('/areas');
  // /lancamentos precisa revalidar: a seção Despesas fixas ali mostra/seleciona categorias, subcategorias e cartões.
  revalidatePath('/lancamentos');
  revalidatePath('/lancamentos/novo');
}

export async function acaoDefinirAlocacao(dadosForm: FormData): Promise<void> {
  const bruto = String(dadosForm.get('valor') ?? '').replace(',', '.');
  const numero = Number(bruto);
  if (!Number.isFinite(numero) || numero < 0) {
    throw new Error(`Valor inválido: ${String(dadosForm.get('valor') ?? '')}`);
  }

  await definirAlocacao({
    budgetCategoryId: String(dadosForm.get('budgetCategoryId') ?? ''),
    vigenteDe: String(dadosForm.get('mes') ?? ''),
    valorCentavos: emCentavos(numero),
  });

  revalidatePath('/orcamentos');
  revalidatePath('/');
}

export async function acaoRemoverAlocacao(dadosForm: FormData): Promise<void> {
  await removerAlocacao(
    String(dadosForm.get('budgetCategoryId') ?? ''),
    String(dadosForm.get('mes') ?? ''),
  );

  revalidatePath('/orcamentos');
  revalidatePath('/');
}
