'use server';

import { revalidatePath } from 'next/cache';

import { criarCategoria, criarSubcategoria } from '@/dados/categorias';
import { criarCartao } from '@/dados/cartoes';

export async function acaoCriarCategoria(dadosForm: FormData): Promise<void> {
  await criarCategoria({
    nome: String(dadosForm.get('nome') ?? ''),
    corSlot: Number(dadosForm.get('corSlot')),
  });
  revalidatePath('/ajustes');
}

export async function acaoCriarSubcategoria(dadosForm: FormData): Promise<void> {
  await criarSubcategoria({
    budgetCategoryId: String(dadosForm.get('budgetCategoryId') ?? ''),
    nome: String(dadosForm.get('nome') ?? ''),
  });
  revalidatePath('/ajustes');
}

export async function acaoCriarCartao(dadosForm: FormData): Promise<void> {
  await criarCartao({
    nome: String(dadosForm.get('nome') ?? ''),
    diaFechamento: Number(dadosForm.get('diaFechamento')),
    diaVencimento: Number(dadosForm.get('diaVencimento')),
  });
  revalidatePath('/ajustes');
}
