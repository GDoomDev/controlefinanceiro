'use server';

import { revalidatePath } from 'next/cache';

import { criarCategoria, criarSubcategoria } from '@/dados/categorias';
import { criarCartao } from '@/dados/cartoes';
import { emCentavos } from '@/dominio/dinheiro';
import type { MetodoPagamento } from '@/dominio/lancamento';
import {
  criarRecorrencia,
  encerrarRecorrencia,
  pausarRecorrencia,
  retomarRecorrencia,
} from '@/dados/recorrentes';

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

export async function acaoCriarRecorrencia(dadosForm: FormData): Promise<void> {
  const metodo = String(dadosForm.get('metodo') ?? 'PIX') as MetodoPagamento;
  const cardIdBruto = String(dadosForm.get('cardId') ?? '');

  await criarRecorrencia({
    descricao: String(dadosForm.get('descricao') ?? ''),
    valorCentavos: emCentavos(Number(dadosForm.get('valor') ?? 0)),
    diaDoMes: Number(dadosForm.get('diaDoMes')),
    budgetCategoryId: String(dadosForm.get('budgetCategoryId') ?? ''),
    subcategoryId: String(dadosForm.get('subcategoryId') ?? ''),
    metodo,
    cardId: metodo === 'CREDITO' && cardIdBruto ? cardIdBruto : null,
    inicio: String(dadosForm.get('inicio') ?? ''),
  });
  revalidatePath('/ajustes');
}

export async function acaoEncerrarRecorrencia(dadosForm: FormData): Promise<void> {
  await encerrarRecorrencia(
    String(dadosForm.get('id') ?? ''),
    String(dadosForm.get('fim') ?? ''),
  );
  revalidatePath('/ajustes');
}

export async function acaoAlternarRecorrencia(dadosForm: FormData): Promise<void> {
  const id = String(dadosForm.get('id') ?? '');
  // O campo carrega o estado ATUAL (antes deste clique): se estava ativa,
  // este clique pausa; se estava pausada, este clique retoma.
  const estavaAtiva = dadosForm.get('ativa') === '1';
  if (estavaAtiva) {
    await pausarRecorrencia(id);
  } else {
    await retomarRecorrencia(id);
  }
  revalidatePath('/ajustes');
}
