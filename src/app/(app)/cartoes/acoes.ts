'use server';

import { revalidatePath } from 'next/cache';

import { fecharFatura, pagarFatura } from '@/dados/faturas';

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
