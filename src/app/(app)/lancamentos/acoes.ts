'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { buscarSubcategoria } from '@/dados/categorias';
import { criarLancamento } from '@/dados/lancamentos';
import {
  criarRecorrencia,
  editarRecorrencia,
  encerrarRecorrencia,
  pausarRecorrencia,
  retomarRecorrencia,
} from '@/dados/recorrentes';
import { emCentavos } from '@/dominio/dinheiro';
import type { MetodoPagamento } from '@/dominio/lancamento';

export async function acaoCriarLancamento(dadosForm: FormData): Promise<void> {
  const metodo = String(dadosForm.get('metodo')) as MetodoPagamento;
  const cardId = String(dadosForm.get('cardId') ?? '');

  await criarLancamento({
    descricao: String(dadosForm.get('descricao') ?? ''),
    // O campo chega em centavos: o formulário converte antes de enviar.
    valorCentavos: Number(dadosForm.get('valorCentavos')),
    data: String(dadosForm.get('data') ?? ''),
    metodo,
    cardId: metodo === 'CREDITO' && cardId ? cardId : null,
    budgetCategoryId: String(dadosForm.get('budgetCategoryId') ?? ''),
    subcategoryId: String(dadosForm.get('subcategoryId') ?? ''),
    parcelas: Number(dadosForm.get('parcelas') ?? 1),
    reembolsoAlvoCentavos: dadosForm.get('reembolsavel')
      ? Number(dadosForm.get('valorCentavos'))
      : 0,
  });

  revalidatePath('/lancamentos');
  redirect('/lancamentos');
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
  revalidatePath('/lancamentos');
}

export async function acaoEditarRecorrencia(dadosForm: FormData): Promise<void> {
  const metodo = String(dadosForm.get('metodo') ?? 'PIX') as MetodoPagamento;
  const cardIdBruto = String(dadosForm.get('cardId') ?? '');
  const subcategoryId = String(dadosForm.get('subcategoryId') ?? '');

  const subcategoria = await buscarSubcategoria(subcategoryId);
  if (!subcategoria) {
    throw new Error(`Subcategoria não encontrada: ${subcategoryId}`);
  }

  await editarRecorrencia(String(dadosForm.get('id') ?? ''), {
    descricao: String(dadosForm.get('descricao') ?? ''),
    valorCentavos: emCentavos(Number(dadosForm.get('valor') ?? 0)),
    diaDoMes: Number(dadosForm.get('diaDoMes')),
    budgetCategoryId: subcategoria.budgetCategoryId,
    subcategoryId,
    metodo,
    cardId: metodo === 'CREDITO' && cardIdBruto ? cardIdBruto : null,
  });
  revalidatePath('/lancamentos');
}

export async function acaoEncerrarRecorrencia(dadosForm: FormData): Promise<void> {
  await encerrarRecorrencia(
    String(dadosForm.get('id') ?? ''),
    String(dadosForm.get('fim') ?? ''),
  );
  revalidatePath('/lancamentos');
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
  revalidatePath('/lancamentos');
}
