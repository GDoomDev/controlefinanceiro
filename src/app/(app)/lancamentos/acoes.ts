'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { criarLancamento } from '@/dados/lancamentos';
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
