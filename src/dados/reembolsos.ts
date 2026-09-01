import {
  type Competencia,
  dataCivilEm,
  diasEntre,
  lerDataCivil,
} from '@/dominio/data';
import {
  type EstadoReembolso,
  estadoDoReembolso,
  ordenarPorAntiguidade,
  pendente,
  recebido,
  validarRecebimento,
} from '@/dominio/reembolso';

import { prisma } from './prisma';
import type { ClientePrisma } from './tipos';

export interface RecebimentoListado {
  valorCentavos: number;
  /** "YYYY-MM-DD" — quando o dinheiro entrou. */
  recebidoEm: string;
  /** O mês corrigido: sempre a competência da despesa (spec, seção 6.1). */
  competenciaCredito: Competencia;
}

export interface ReembolsoListado {
  transactionId: string;
  descricao: string;
  /** "YYYY-MM-DD" da despesa. */
  data: string;
  competencia: Competencia;
  valorCentavos: number;
  alvoCentavos: number;
  recebidoCentavos: number;
  pendenteCentavos: number;
  estado: EstadoReembolso;
  /** Dias desde a despesa — há quanto tempo esse dinheiro está fora. */
  diasParado: number;
  categoriaNome: string;
  subcategoriaNome: string;
  parcelaNum: number;
  parcelaTotal: number;
  recebimentos: RecebimentoListado[];
}

/**
 * Só o crédito de REEMBOLSO abate a pendência. Um ESTORNO na mesma transação
 * é outro dinheiro — a compra foi desfeita, ninguém te devia nada (spec,
 * seção 6). Este filtro é a razão de o `where` existir, não uma otimização.
 */
const CREDITOS_DE_REEMBOLSO = {
  where: { origem: 'REEMBOLSO' },
  orderBy: { recebidoEm: 'asc' },
  select: { valorCentavos: true, recebidoEm: true, competenciaCredito: true },
} as const;

/**
 * Todos os lançamentos reembolsáveis, separados entre o que ainda deve entrar
 * e o que já entrou. Quem decide o estado e a ordem é o domínio.
 */
export async function listarReembolsos(
  cliente: ClientePrisma = prisma,
): Promise<{ pendentes: ReembolsoListado[]; quitados: ReembolsoListado[] }> {
  const linhas = await cliente.transaction.findMany({
    where: {
      tipo: 'DESPESA',
      status: 'ATIVA',
      reembolsoAlvoCentavos: { gt: 0 },
    },
    orderBy: { data: 'desc' },
    select: {
      id: true,
      descricao: true,
      data: true,
      competencia: true,
      valorCentavos: true,
      reembolsoAlvoCentavos: true,
      parcelaNum: true,
      parcelaTotal: true,
      budgetCategory: { select: { nome: true } },
      subcategory: { select: { nome: true } },
      creditos: CREDITOS_DE_REEMBOLSO,
    },
  });

  const hoje = dataCivilEm(new Date());

  const todos: ReembolsoListado[] = linhas.map((l) => ({
    transactionId: l.id,
    descricao: l.descricao,
    data: l.data,
    competencia: l.competencia,
    valorCentavos: l.valorCentavos,
    alvoCentavos: l.reembolsoAlvoCentavos,
    recebidoCentavos: recebido(l.creditos),
    pendenteCentavos: pendente(l.reembolsoAlvoCentavos, l.creditos),
    estado: estadoDoReembolso(l.reembolsoAlvoCentavos, l.creditos),
    diasParado: diasEntre(lerDataCivil(l.data), hoje),
    categoriaNome: l.budgetCategory?.nome ?? '',
    subcategoriaNome: l.subcategory?.nome ?? '',
    parcelaNum: l.parcelaNum,
    parcelaTotal: l.parcelaTotal,
    recebimentos: l.creditos.map((c) => ({
      valorCentavos: c.valorCentavos,
      recebidoEm: c.recebidoEm,
      competenciaCredito: c.competenciaCredito,
    })),
  }));

  return {
    // A cobrar: mais parado primeiro, que é a ordem de quem precisa ser cobrado.
    pendentes: ordenarPorAntiguidade(todos.filter((r) => r.estado !== 'QUITADO')),
    // Já resolvido: a consulta já veio por data decrescente, e ali a pergunta
    // é "o que eu já resolvi", não "o que devo cobrar".
    quitados: todos.filter((r) => r.estado === 'QUITADO'),
  };
}

/**
 * Grava um recebimento. Dois pontos que o spec (seção 6.1) fixa e que são
 * fáceis de errar:
 *
 *  - a competência do crédito é a da DESPESA, não a do mês em que o dinheiro
 *    entrou — é isso que faz um reembolso de outubro corrigir setembro;
 *  - só os créditos de REEMBOLSO entram na conta do que já foi recebido.
 */
export async function registrarRecebimento(
  dados: { transactionId: string; valorCentavos: number; recebidoEm: string },
  cliente: ClientePrisma = prisma,
): Promise<{ id: string }> {
  // Lança se o formato estiver errado — é a validação da data civil.
  lerDataCivil(dados.recebidoEm);

  const transacao = await cliente.transaction.findUnique({
    where: { id: dados.transactionId },
    select: {
      competencia: true,
      reembolsoAlvoCentavos: true,
      creditos: CREDITOS_DE_REEMBOLSO,
    },
  });

  if (!transacao) {
    throw new Error(`Lançamento não encontrado: ${dados.transactionId}`);
  }

  validarRecebimento(
    dados.valorCentavos,
    transacao.reembolsoAlvoCentavos,
    transacao.creditos,
  );

  return cliente.credito.create({
    data: {
      transactionId: dados.transactionId,
      valorCentavos: dados.valorCentavos,
      recebidoEm: dados.recebidoEm,
      competenciaCredito: transacao.competencia,
      origem: 'REEMBOLSO',
    },
    select: { id: true },
  });
}
