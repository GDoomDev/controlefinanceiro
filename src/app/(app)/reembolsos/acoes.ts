'use server';

import { revalidatePath } from 'next/cache';

import { registrarRecebimento } from '@/dados/reembolsos';
import { emCentavos } from '@/dominio/dinheiro';

export async function acaoRegistrarRecebimento(dadosForm: FormData): Promise<void> {
  const transactionId = String(dadosForm.get('transactionId') ?? '');
  const recebidoEm = String(dadosForm.get('recebidoEm') ?? '');
  // O campo chega em reais ("120.00"); centavos é a unidade de dentro.
  const valorCentavos = emCentavos(Number(dadosForm.get('valor') ?? 0));

  await registrarRecebimento({ transactionId, valorCentavos, recebidoEm });

  revalidatePath('/reembolsos');
  // O crédito muda a despesa líquida do mês da despesa, então o Painel e as
  // Áreas daquele mês também mudam.
  revalidatePath('/');
  revalidatePath('/areas');
  revalidatePath('/fluxo');
}
