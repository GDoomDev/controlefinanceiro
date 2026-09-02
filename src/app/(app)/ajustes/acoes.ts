'use server';

import { revalidatePath } from 'next/cache';

import { buscarSubcategoria, criarCategoria, criarSubcategoria } from '@/dados/categorias';
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
  const subcategoryId = String(dadosForm.get('subcategoryId') ?? '');

  // O formulário só oferece a escolha de subcategoria (já rotulada com o
  // orçamento pai) — o orçamento em si é derivado dela aqui, em vez de vir de
  // um segundo campo independente que o usuário poderia preencher em
  // desacordo com a subcategoria escolhida.
  const subcategoria = await buscarSubcategoria(subcategoryId);
  if (!subcategoria) {
    throw new Error(`Subcategoria não encontrada: ${subcategoryId}`);
  }

  await criarRecorrencia({
    descricao: String(dadosForm.get('descricao') ?? ''),
    valorCentavos: emCentavos(Number(dadosForm.get('valor') ?? 0)),
    diaDoMes: Number(dadosForm.get('diaDoMes')),
    budgetCategoryId: subcategoria.budgetCategoryId,
    subcategoryId,
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
