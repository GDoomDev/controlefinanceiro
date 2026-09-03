'use server';

import { revalidatePath } from 'next/cache';

import {
  arquivarCategoria,
  buscarSubcategoria,
  criarCategoria,
  criarSubcategoria,
  editarSubcategoria,
  arquivarSubcategoria,
} from '@/dados/categorias';
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
  const corSlotBruto = String(dadosForm.get('corSlot') ?? '');
  const corPersonalizadaBruta = String(dadosForm.get('corPersonalizada') ?? '');

  await criarCategoria({
    nome: String(dadosForm.get('nome') ?? ''),
    corSlot: corSlotBruto ? Number(corSlotBruto) : null,
    corPersonalizada: corPersonalizadaBruta ? corPersonalizadaBruta : null,
  });
  revalidatePath('/ajustes');
  revalidatePath('/');
  revalidatePath('/areas');
  revalidatePath('/orcamentos');
  revalidatePath('/lancamentos/novo');
}

export async function acaoCriarSubcategoria(dadosForm: FormData): Promise<void> {
  await criarSubcategoria({
    budgetCategoryId: String(dadosForm.get('budgetCategoryId') ?? ''),
    nome: String(dadosForm.get('nome') ?? ''),
  });
  revalidatePath('/ajustes');
}

export async function acaoEditarSubcategoria(dadosForm: FormData): Promise<void> {
  await editarSubcategoria(String(dadosForm.get('id') ?? ''), {
    nome: String(dadosForm.get('nome') ?? ''),
  });
  revalidatePath('/ajustes');
}

export async function acaoArquivarSubcategoria(dadosForm: FormData): Promise<void> {
  await arquivarSubcategoria(String(dadosForm.get('id') ?? ''));
  revalidatePath('/ajustes');
  // A subcategoria some do seletor de Despesa Fixa (mesma tela) e do seletor de
  // subcategoria em Lançamentos — ambos revalidados aqui.
  revalidatePath('/lancamentos/novo');
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

export async function acaoExcluirCategoria(dadosForm: FormData): Promise<void> {
  await arquivarCategoria(String(dadosForm.get('id') ?? ''));
  revalidatePath('/ajustes');
  // Toda tela que lista orçamentos ativos também precisa parar de oferecer
  // esta categoria como opção.
  revalidatePath('/');
  revalidatePath('/areas');
  revalidatePath('/orcamentos');
  revalidatePath('/lancamentos/novo');
}
