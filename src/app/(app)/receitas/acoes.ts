'use server';

import { revalidatePath } from 'next/cache';

import {
  apagarReceita,
  apagarReceitaPrevista,
  criarReceita,
  criarReceitaPrevista,
} from '@/dados/receitas';
import type { MetodoPagamento } from '@/dominio/lancamento';
import { emCentavos } from '@/dominio/dinheiro';

function lerValorEmCentavos(dadosForm: FormData, campo: string): number {
  const bruto = String(dadosForm.get(campo) ?? '').replace(',', '.');
  const numero = Number(bruto);
  if (!Number.isFinite(numero) || numero <= 0) {
    throw new Error(`Valor inválido: ${String(dadosForm.get(campo) ?? '')}`);
  }
  return emCentavos(numero);
}

function revalidar(): void {
  revalidatePath('/receitas');
  revalidatePath('/');
}

export async function acaoCriarReceita(dadosForm: FormData): Promise<void> {
  await criarReceita({
    descricao: String(dadosForm.get('descricao') ?? ''),
    valorCentavos: lerValorEmCentavos(dadosForm, 'valor'),
    data: String(dadosForm.get('data') ?? ''),
    metodo: String(dadosForm.get('metodo') ?? 'PIX') as MetodoPagamento,
  });
  revalidar();
}

export async function acaoApagarReceita(dadosForm: FormData): Promise<void> {
  await apagarReceita(String(dadosForm.get('id') ?? ''));
  revalidar();
}

export async function acaoCriarReceitaPrevista(dadosForm: FormData): Promise<void> {
  await criarReceitaPrevista({
    competencia: String(dadosForm.get('competencia') ?? ''),
    descricao: String(dadosForm.get('descricao') ?? ''),
    valorCentavos: lerValorEmCentavos(dadosForm, 'valor'),
  });
  revalidar();
}

export async function acaoApagarReceitaPrevista(dadosForm: FormData): Promise<void> {
  await apagarReceitaPrevista(String(dadosForm.get('id') ?? ''));
  revalidar();
}
