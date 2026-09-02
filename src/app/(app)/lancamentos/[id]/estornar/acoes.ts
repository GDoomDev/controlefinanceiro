'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { aplicarEstorno, aplicarEstornoParcial } from '@/dados/estorno';
import { emCentavos } from '@/dominio/dinheiro';
import type { ModoCredito } from '@/dominio/reembolso';

export async function acaoEstornar(dadosForm: FormData): Promise<void> {
  const transactionId = String(dadosForm.get('transactionId') ?? '');
  const competenciaCredito = String(dadosForm.get('competenciaCredito') ?? '');
  const recebidoEm = String(dadosForm.get('recebidoEm') ?? '');
  const parcial = dadosForm.get('parcial') === 'sim';

  if (parcial) {
    const valorCentavos = emCentavos(Number(dadosForm.get('valor') ?? 0));
    await aplicarEstornoParcial({
      transactionId,
      valorCentavos,
      competenciaCredito,
      recebidoEm,
    });
  } else {
    const modo = String(dadosForm.get('modo') ?? 'UNICO') as ModoCredito;
    await aplicarEstorno({ transactionId, modo, competenciaCredito, recebidoEm });
  }

  // O estorno mexe na fatura, no orçamento do mês, na projeção e — quando
  // cancela uma parcela reembolsável ainda ATIVA — na lista de reembolsos.
  revalidatePath('/lancamentos');
  revalidatePath('/cartoes');
  revalidatePath('/');
  revalidatePath('/areas');
  revalidatePath('/fluxo');
  revalidatePath('/reembolsos');

  redirect('/lancamentos');
}
