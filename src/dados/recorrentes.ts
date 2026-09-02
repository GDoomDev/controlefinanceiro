import {
  type Competencia,
  diaSeguro,
  formatarDataCivil,
  partesDaCompetencia,
} from '@/dominio/data';
import type { MetodoPagamento } from '@/dominio/lancamento';
import { vigenteNoMes } from '@/dominio/recorrencia';

import { buscarCartao } from './cartoes';
import { garantirFatura } from './faturas';
import { prisma } from './prisma';
import type { ClientePrisma } from './tipos';

export interface NovaRecorrencia {
  descricao: string;
  valorCentavos: number;
  /** 1..31 — dia do mês em que a despesa é lançada. */
  diaDoMes: number;
  budgetCategoryId: string;
  subcategoryId: string;
  metodo: MetodoPagamento;
  cardId: string | null;
  /** "YYYY-MM" — primeira competência em que a despesa vale. */
  inicio: Competencia;
}

export interface RecorrenciaListada {
  id: string;
  descricao: string;
  valorCentavos: number;
  diaDoMes: number;
  metodo: MetodoPagamento;
  cardId: string | null;
  cartaoNome: string | null;
  categoriaNome: string;
  subcategoriaNome: string;
  inicio: Competencia;
  fim: Competencia | null;
  ativa: boolean;
}

function validarCompetencia(c: Competencia): void {
  // Delega para partesDaCompetencia — que também valida o mês real (1..12),
  // não só o formato "YYYY-MM". Uma regex local e mais fraca deixaria passar
  // uma competência como "2099-13".
  partesDaCompetencia(c);
}

export async function criarRecorrencia(
  entrada: NovaRecorrencia,
  cliente: ClientePrisma = prisma,
): Promise<{ id: string }> {
  const descricao = entrada.descricao.trim();
  if (descricao.length === 0) {
    throw new Error('Descrição não pode ser vazia');
  }
  if (!Number.isInteger(entrada.valorCentavos) || entrada.valorCentavos <= 0) {
    throw new Error(
      `Valor deve ser inteiro positivo em centavos: ${entrada.valorCentavos}`,
    );
  }
  if (!Number.isInteger(entrada.diaDoMes) || entrada.diaDoMes < 1 || entrada.diaDoMes > 31) {
    throw new Error(`Dia do mês deve ser inteiro entre 1 e 31: ${entrada.diaDoMes}`);
  }
  validarCompetencia(entrada.inicio);

  // Regra de integridade do spec, seção 3: a subcategoria tem de pertencer ao
  // orçamento informado — o banco só barraria um id inexistente, não a
  // combinação trocada.
  const subcategoria = await cliente.subcategory.findUnique({
    where: { id: entrada.subcategoryId },
    select: { budgetCategoryId: true },
  });
  if (!subcategoria) {
    throw new Error(`Subcategoria não encontrada: ${entrada.subcategoryId}`);
  }
  if (subcategoria.budgetCategoryId !== entrada.budgetCategoryId) {
    throw new Error(
      'A subcategoria informada pertence a outro orçamento — a hierarquia é estrita',
    );
  }

  if (entrada.metodo === 'CREDITO') {
    if (!entrada.cardId) {
      throw new Error('Despesa fixa no crédito exige um cartão');
    }
    const cartao = await buscarCartao(entrada.cardId, cliente);
    if (!cartao) {
      throw new Error(`Cartão não encontrado: ${entrada.cardId}`);
    }
  }

  return cliente.recurringExpense.create({
    data: {
      descricao,
      valorCentavos: entrada.valorCentavos,
      diaDoMes: entrada.diaDoMes,
      budgetCategoryId: entrada.budgetCategoryId,
      subcategoryId: entrada.subcategoryId,
      metodo: entrada.metodo,
      // Métodos que não são crédito exigem cardId nulo (mesma regra do
      // lançamento avulso, spec seção 3) — imposto aqui, não só na interface.
      cardId: entrada.metodo === 'CREDITO' ? entrada.cardId : null,
      inicio: entrada.inicio,
    },
    select: { id: true },
  });
}

export async function listarRecorrentes(
  cliente: ClientePrisma = prisma,
): Promise<RecorrenciaListada[]> {
  const linhas = await cliente.recurringExpense.findMany({
    orderBy: { descricao: 'asc' },
    select: {
      id: true,
      descricao: true,
      valorCentavos: true,
      diaDoMes: true,
      metodo: true,
      cardId: true,
      inicio: true,
      fim: true,
      ativa: true,
      budgetCategory: { select: { nome: true } },
      subcategory: { select: { nome: true } },
      card: { select: { nome: true } },
    },
  });

  return linhas.map((r) => ({
    id: r.id,
    descricao: r.descricao,
    valorCentavos: r.valorCentavos,
    diaDoMes: r.diaDoMes,
    metodo: r.metodo,
    cardId: r.cardId,
    cartaoNome: r.card?.nome ?? null,
    categoriaNome: r.budgetCategory.nome,
    subcategoriaNome: r.subcategory.nome,
    inicio: r.inicio,
    fim: r.fim,
    ativa: r.ativa,
  }));
}

export async function encerrarRecorrencia(
  id: string,
  fim: Competencia,
  cliente: ClientePrisma = prisma,
): Promise<void> {
  validarCompetencia(fim);

  const recorrencia = await cliente.recurringExpense.findUnique({
    where: { id },
    select: { inicio: true },
  });
  if (!recorrencia) {
    throw new Error(`Despesa fixa não encontrada: ${id}`);
  }
  if (fim < recorrencia.inicio) {
    throw new Error(`Fim (${fim}) não pode ser anterior ao início (${recorrencia.inicio})`);
  }

  await cliente.recurringExpense.update({ where: { id }, data: { fim } });
}

export async function pausarRecorrencia(
  id: string,
  cliente: ClientePrisma = prisma,
): Promise<void> {
  await cliente.recurringExpense.update({ where: { id }, data: { ativa: false } });
}

export async function retomarRecorrencia(
  id: string,
  cliente: ClientePrisma = prisma,
): Promise<void> {
  await cliente.recurringExpense.update({ where: { id }, data: { ativa: true } });
}

/**
 * Materializa, se ainda não existirem, os lançamentos das despesas fixas
 * vigentes naquele mês (spec, seção 13). Idempotente: a unicidade em banco
 * por (recorrenciaId, competencia) faz o `createMany` da mesma competência
 * nunca duplicar — chamar de novo é sempre seguro.
 *
 * A competência do lançamento é a competência pedida, sem recálculo via
 * janela de fatura — só a fatura daquele cartão naquele mês é garantida
 * (`garantirFatura`), para o lançamento ter onde se vincular.
 */
export async function materializarRecorrentes(
  competencia: Competencia,
  cliente: ClientePrisma = prisma,
): Promise<{ criadas: number }> {
  validarCompetencia(competencia);

  const todas = await cliente.recurringExpense.findMany({
    select: {
      id: true,
      descricao: true,
      valorCentavos: true,
      diaDoMes: true,
      budgetCategoryId: true,
      subcategoryId: true,
      metodo: true,
      cardId: true,
      inicio: true,
      fim: true,
      ativa: true,
    },
  });

  const vigentes = todas.filter((r) => vigenteNoMes(r, competencia));
  if (vigentes.length === 0) {
    return { criadas: 0 };
  }

  const { ano, mes } = partesDaCompetencia(competencia);

  // Sequencial, não `Promise.all`: `garantirFatura` é um check-then-create
  // sem upsert/lock, protegido só pela constraint única do banco em
  // (cardId, competencia). Duas recorrências CREDITO no mesmo cartão no
  // mesmo mês, disparadas em paralelo, veriam "sem fatura" ao mesmo tempo e a
  // segunda `invoice.create` rejeitaria por violação de unicidade — o que
  // derrubaria a chamada inteira via `Promise.all`, não só aquele par. Um
  // laço sequencial (mesmo padrão de `criarLancamento` em lancamentos.ts)
  // garante que a segunda chamada de `garantirFatura` já encontre a fatura
  // criada pela primeira.
  const linhas: Array<{
    tipo: 'DESPESA';
    descricao: string;
    valorCentavos: number;
    data: string;
    metodo: MetodoPagamento;
    cardId: string | null;
    invoiceId: string | null;
    budgetCategoryId: string;
    subcategoryId: string;
    competencia: Competencia;
    reembolsoAlvoCentavos: number;
    parcelaNum: number;
    parcelaTotal: number;
    recorrenciaId: string;
  }> = [];

  for (const r of vigentes) {
    const dia = diaSeguro(r.diaDoMes, ano, mes);
    const invoiceId =
      r.metodo === 'CREDITO' && r.cardId
        ? (await garantirFatura(r.cardId, competencia, cliente)).id
        : null;

    linhas.push({
      tipo: 'DESPESA',
      descricao: r.descricao,
      valorCentavos: r.valorCentavos,
      data: formatarDataCivil({ ano, mes, dia }),
      metodo: r.metodo,
      cardId: r.metodo === 'CREDITO' ? r.cardId : null,
      invoiceId,
      budgetCategoryId: r.budgetCategoryId,
      subcategoryId: r.subcategoryId,
      competencia,
      reembolsoAlvoCentavos: 0,
      parcelaNum: 1,
      parcelaTotal: 1,
      recorrenciaId: r.id,
    });
  }

  const resultado = await cliente.transaction.createMany({
    data: linhas,
    skipDuplicates: true,
  });

  return { criadas: resultado.count };
}
