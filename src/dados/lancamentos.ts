import { randomUUID } from 'node:crypto';

import { type Competencia, lerDataCivil } from '@/dominio/data';
import { type MetodoPagamento, planejarLancamento } from '@/dominio/lancamento';

import { buscarCartao, regraDoCartao } from './cartoes';
import { garantirFatura } from './faturas';
import { prisma } from './prisma';
import type { ClientePrisma } from './tipos';

export interface NovoLancamento {
  descricao: string;
  valorCentavos: number;
  /** "YYYY-MM-DD" */
  data: string;
  metodo: MetodoPagamento;
  cardId: string | null;
  budgetCategoryId: string;
  subcategoryId: string;
  parcelas: number;
  reembolsoAlvoCentavos: number;
}

export interface LancamentoListado {
  id: string;
  descricao: string;
  valorCentavos: number;
  data: string;
  competencia: Competencia;
  metodo: MetodoPagamento;
  parcelaNum: number;
  parcelaTotal: number;
  grupoParcelamentoId: string | null;
  categoriaNome: string;
  subcategoriaNome: string;
  cartaoNome: string | null;
}

/**
 * Cria um lançamento. Se for parcelado, gera uma linha por parcela — todas com
 * o mesmo grupo, cada uma na competência e fatura que o domínio determinou, e
 * todas dentro de uma única transação: as dez entram ou nenhuma entra.
 */
export async function criarLancamento(
  entrada: NovoLancamento,
  cliente: ClientePrisma = prisma,
): Promise<{ ids: string[] }> {
  const descricao = entrada.descricao.trim();
  if (descricao.length === 0) {
    throw new Error('Descrição não pode ser vazia');
  }
  if (
    !Number.isInteger(entrada.reembolsoAlvoCentavos) ||
    entrada.reembolsoAlvoCentavos < 0 ||
    entrada.reembolsoAlvoCentavos > entrada.valorCentavos
  ) {
    throw new Error(
      `Alvo de reembolso deve ficar entre 0 e o valor do lançamento: ${entrada.reembolsoAlvoCentavos}`,
    );
  }

  // Lança se o formato estiver errado — é a validação da data civil.
  const data = lerDataCivil(entrada.data);

  // Regra de integridade do spec, seção 3: a subcategoria tem de pertencer ao
  // orçamento informado. O banco só barraria um id inexistente, não a
  // combinação trocada — que é o erro que a interface pode cometer sozinha ao
  // trocar o orçamento e deixar a subcategoria antiga selecionada.
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

  const regra =
    entrada.metodo === 'CREDITO'
      ? await (async () => {
          if (!entrada.cardId) {
            throw new Error('Lançamento no crédito exige um cartão');
          }
          const cartao = await buscarCartao(entrada.cardId, cliente);
          if (!cartao) {
            throw new Error(`Cartão não encontrado: ${entrada.cardId}`);
          }
          return regraDoCartao(cartao);
        })()
      : null;

  const plano = planejarLancamento(
    {
      valorCentavos: entrada.valorCentavos,
      data,
      metodo: entrada.metodo,
      parcelas: entrada.parcelas,
    },
    regra,
  );

  const grupoParcelamentoId = plano.length > 1 ? randomUUID() : null;

  const gravar = async (tx: ClientePrisma): Promise<string[]> => {
    const ids: string[] = [];

    for (const parcela of plano) {
      const invoiceId =
        entrada.cardId && parcela.fatura
          ? (await garantirFatura(entrada.cardId, parcela.competencia, tx)).id
          : null;

      const criada = await tx.transaction.create({
        data: {
          tipo: 'DESPESA',
          descricao,
          valorCentavos: parcela.valorCentavos,
          data: entrada.data,
          metodo: entrada.metodo,
          cardId: entrada.cardId,
          invoiceId,
          budgetCategoryId: entrada.budgetCategoryId,
          subcategoryId: entrada.subcategoryId,
          competencia: parcela.competencia,
          // O alvo de reembolso vale para a compra inteira, então fica na
          // primeira parcela — só ela representa a dívida de terceiro.
          reembolsoAlvoCentavos:
            parcela.parcelaNum === 1 ? entrada.reembolsoAlvoCentavos : 0,
          grupoParcelamentoId,
          parcelaNum: parcela.parcelaNum,
          parcelaTotal: parcela.parcelaTotal,
        },
        select: { id: true },
      });

      ids.push(criada.id);
    }

    return ids;
  };

  // Se já estamos dentro de uma transação (`cliente` veio de fora), reaproveita.
  // O `$transaction` só existe no PrismaClient de topo.
  const ids =
    '$transaction' in cliente
      ? await cliente.$transaction((tx) => gravar(tx))
      : await gravar(cliente);

  return { ids };
}

export async function listarLancamentos(
  competencia: Competencia,
  cliente: ClientePrisma = prisma,
): Promise<LancamentoListado[]> {
  const linhas = await cliente.transaction.findMany({
    where: { competencia, tipo: 'DESPESA', status: 'ATIVA' },
    orderBy: [{ data: 'desc' }, { descricao: 'asc' }],
    select: {
      id: true,
      descricao: true,
      valorCentavos: true,
      data: true,
      competencia: true,
      metodo: true,
      parcelaNum: true,
      parcelaTotal: true,
      grupoParcelamentoId: true,
      budgetCategory: { select: { nome: true } },
      subcategory: { select: { nome: true } },
      card: { select: { nome: true } },
    },
  });

  return linhas.map((l) => ({
    id: l.id,
    descricao: l.descricao,
    valorCentavos: l.valorCentavos,
    data: l.data,
    competencia: l.competencia,
    metodo: l.metodo,
    parcelaNum: l.parcelaNum,
    parcelaTotal: l.parcelaTotal,
    grupoParcelamentoId: l.grupoParcelamentoId,
    categoriaNome: l.budgetCategory?.nome ?? '',
    subcategoriaNome: l.subcategory?.nome ?? '',
    cartaoNome: l.card?.nome ?? null,
  }));
}

export async function apagarLancamento(
  id: string,
  cliente: ClientePrisma = prisma,
): Promise<void> {
  await cliente.transaction.delete({ where: { id } });
}

export async function apagarGrupo(
  grupoParcelamentoId: string,
  cliente: ClientePrisma = prisma,
): Promise<void> {
  await cliente.transaction.deleteMany({ where: { grupoParcelamentoId } });
}
