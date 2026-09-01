'use server';

import { revalidatePath } from 'next/cache';

import { definirAlocacao, removerAlocacao } from '@/dados/orcamentos';
import { emCentavos } from '@/dominio/dinheiro';

export async function acaoDefinirAlocacao(dadosForm: FormData): Promise<void> {
  const bruto = String(dadosForm.get('valor') ?? '').replace(',', '.');
  const numero = Number(bruto);
  if (!Number.isFinite(numero) || numero < 0) {
    throw new Error(`Valor inválido: ${String(dadosForm.get('valor') ?? '')}`);
  }

  await definirAlocacao({
    budgetCategoryId: String(dadosForm.get('budgetCategoryId') ?? ''),
    vigenteDe: String(dadosForm.get('mes') ?? ''),
    valorCentavos: emCentavos(numero),
  });

  revalidatePath('/orcamentos');
  revalidatePath('/');
}

export async function acaoRemoverAlocacao(dadosForm: FormData): Promise<void> {
  await removerAlocacao(
    String(dadosForm.get('budgetCategoryId') ?? ''),
    String(dadosForm.get('mes') ?? ''),
  );

  revalidatePath('/orcamentos');
  revalidatePath('/');
}
