'use server';

import { revalidatePath } from 'next/cache';

import { fecharFatura, pagarFatura } from '@/dados/faturas';
import { arquivarCartao, criarCartao, editarCartao } from '@/dados/cartoes';

export async function acaoFecharFatura(dadosForm: FormData): Promise<void> {
  await fecharFatura(String(dadosForm.get('id') ?? ''));
  revalidatePath('/cartoes');
}

export async function acaoPagarFatura(dadosForm: FormData): Promise<void> {
  await pagarFatura(
    String(dadosForm.get('id') ?? ''),
    String(dadosForm.get('pagaEm') ?? ''),
  );
  revalidatePath('/cartoes');
}

export async function acaoCriarCartao(dadosForm: FormData): Promise<void> {
  await criarCartao({
    nome: String(dadosForm.get('nome') ?? ''),
    diaFechamento: Number(dadosForm.get('diaFechamento')),
    diaVencimento: Number(dadosForm.get('diaVencimento')),
  });
  revalidatePath('/cartoes');
  // /lancamentos precisa revalidar: a seção Despesas fixas ali mostra/seleciona categorias, subcategorias e cartões.
  revalidatePath('/lancamentos');
}

export async function acaoEditarCartao(dadosForm: FormData): Promise<void> {
  await editarCartao(String(dadosForm.get('id') ?? ''), {
    nome: String(dadosForm.get('nome') ?? ''),
    diaFechamento: Number(dadosForm.get('diaFechamento')),
    diaVencimento: Number(dadosForm.get('diaVencimento')),
  });
  revalidatePath('/cartoes');
  revalidatePath('/');
  // /lancamentos precisa revalidar: a seção Despesas fixas ali mostra/seleciona categorias, subcategorias e cartões.
  revalidatePath('/lancamentos');
}

export async function acaoArquivarCartao(dadosForm: FormData): Promise<void> {
  await arquivarCartao(String(dadosForm.get('id') ?? ''));
  revalidatePath('/lancamentos/novo');
  revalidatePath('/cartoes');
  revalidatePath('/');
  // /lancamentos precisa revalidar: a seção Despesas fixas ali mostra/seleciona categorias, subcategorias e cartões.
  revalidatePath('/lancamentos');
}
