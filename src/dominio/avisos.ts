/**
 * Central de avisos (spec, seção 8.1).
 *
 * Transforma o estado do mês numa lista ordenada de avisos. É puro de
 * propósito: os gatilhos são regra de negócio, e o que a interface faz é só
 * desenhar a lista que sai daqui.
 */

import type { Competencia } from './data';
import { type Centavos, formatarBRL } from './dinheiro';

export type Severidade = 'VERMELHO' | 'AMARELO' | 'AZUL' | 'CINZA';

export interface Aviso {
  severidade: Severidade;
  texto: string;
  href: string;
  /** Usado só para ordenar dentro da mesma severidade. */
  valorOrdenacao: Centavos;
}

export interface EntradaAvisos {
  orcamentos: Array<{ nome: string; orcadoCentavos: Centavos; gastoCentavos: Centavos }>;
  faturasProximas: Array<{
    cartaoNome: string;
    diasParaFechar: number;
    totalCentavos: Centavos;
  }>;
  reembolsoPendente: { totalCentavos: Centavos; diasDoMaisAntigo: number } | null;
  receitaPrevistaDoProximoMesInformada: boolean;
  proximoMes: Competencia;
}

/** Um orçamento entra em atenção a partir deste percentual consumido. */
const LIMIAR_ATENCAO = 0.9;
/** Uma fatura vira aviso quando falta este tanto de dias para fechar. */
const DIAS_FATURA_PROXIMA = 2;
/** Um reembolso vira aviso depois deste tanto de dias sem receber. */
const DIAS_REEMBOLSO_PARADO = 30;

export const MAXIMO_AVISOS_VISIVEIS = 5;

const PESO_DA_SEVERIDADE: Record<Severidade, number> = {
  VERMELHO: 0,
  AMARELO: 1,
  AZUL: 2,
  CINZA: 3,
};

export function gerarAvisos(entrada: EntradaAvisos): Aviso[] {
  const avisos: Aviso[] = [];

  for (const o of entrada.orcamentos) {
    const excesso = o.gastoCentavos - o.orcadoCentavos;

    if (excesso > 0) {
      avisos.push({
        severidade: 'VERMELHO',
        texto: `${o.nome} estourou ${formatarBRL(excesso)}`,
        href: '/lancamentos',
        valorOrdenacao: excesso,
      });
      continue;
    }

    // Sem orçamento e sem gasto não há nada a avisar; a divisão abaixo também
    // não faria sentido.
    if (o.orcadoCentavos === 0) continue;

    if (o.gastoCentavos / o.orcadoCentavos >= LIMIAR_ATENCAO) {
      const restante = o.orcadoCentavos - o.gastoCentavos;
      avisos.push({
        severidade: 'AMARELO',
        texto: `${o.nome} com apenas ${formatarBRL(restante)} restantes`,
        href: '/lancamentos',
        valorOrdenacao: restante,
      });
    }
  }

  for (const f of entrada.faturasProximas) {
    if (f.diasParaFechar > DIAS_FATURA_PROXIMA) continue;
    const quando = f.diasParaFechar <= 0 ? 'fecha hoje' : `fecha em ${f.diasParaFechar}d`;
    avisos.push({
      severidade: 'AMARELO',
      texto: `Fatura do ${f.cartaoNome} ${quando} — ${formatarBRL(f.totalCentavos)}`,
      href: '/cartoes',
      valorOrdenacao: f.totalCentavos,
    });
  }

  if (
    entrada.reembolsoPendente !== null &&
    entrada.reembolsoPendente.diasDoMaisAntigo > DIAS_REEMBOLSO_PARADO
  ) {
    const r = entrada.reembolsoPendente;
    avisos.push({
      severidade: 'AZUL',
      texto: `${formatarBRL(r.totalCentavos)} em reembolsos pendentes, o mais antigo há ${r.diasDoMaisAntigo} dias`,
      href: '/lancamentos',
      valorOrdenacao: r.totalCentavos,
    });
  }

  if (!entrada.receitaPrevistaDoProximoMesInformada) {
    avisos.push({
      severidade: 'CINZA',
      texto: `Receita prevista de ${entrada.proximoMes} ainda não informada`,
      href: '/receitas',
      valorOrdenacao: 0,
    });
  }

  return avisos.sort((a, b) => {
    if (a.severidade !== b.severidade) {
      return PESO_DA_SEVERIDADE[a.severidade] - PESO_DA_SEVERIDADE[b.severidade];
    }
    return b.valorOrdenacao - a.valorOrdenacao;
  });
}

/** No máximo cinco visíveis; o resto vira uma contagem (spec, seção 8.1). */
export function limitarAvisos(avisos: Aviso[]): {
  visiveis: Aviso[];
  ocultos: number;
} {
  return {
    visiveis: avisos.slice(0, MAXIMO_AVISOS_VISIVEIS),
    ocultos: Math.max(0, avisos.length - MAXIMO_AVISOS_VISIVEIS),
  };
}
