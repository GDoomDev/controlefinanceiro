/**
 * Planejador de lançamento: decide em quantas parcelas um lançamento se divide,
 * quanto vale cada uma, e em que competência/fatura cada uma cai.
 *
 * É puro de propósito. A mesma função roda no servidor (na hora de gravar) e no
 * navegador (no rodapé ao vivo do formulário), então a prévia que o usuário vê
 * nunca pode divergir do que é de fato persistido.
 */

import { type Competencia, type DataCivil, competenciaDe } from './data';
import { type Centavos, dividirParcelas } from './dinheiro';
import { type Fatura, type RegraCartao, faturasDasParcelas } from './fatura';

export type MetodoPagamento = 'CREDITO' | 'DEBITO' | 'PIX' | 'DINHEIRO' | 'BOLETO';

export interface EntradaLancamento {
  valorCentavos: Centavos;
  data: DataCivil;
  metodo: MetodoPagamento;
  parcelas: number;
}

export interface ParcelaPlanejada {
  parcelaNum: number;
  parcelaTotal: number;
  valorCentavos: Centavos;
  competencia: Competencia;
  /** Null quando o método não é crédito — só compra no crédito entra em fatura. */
  fatura: Fatura | null;
}

export function planejarLancamento(
  entrada: EntradaLancamento,
  regra: RegraCartao | null,
): ParcelaPlanejada[] {
  const { valorCentavos, data, metodo, parcelas } = entrada;

  if (!Number.isInteger(valorCentavos) || valorCentavos < 0) {
    throw new Error(`Valor deve ser inteiro não negativo em centavos: ${valorCentavos}`);
  }
  if (!Number.isInteger(parcelas) || parcelas < 1) {
    throw new Error(`Quantidade de parcelas deve ser inteiro >= 1: ${parcelas}`);
  }

  if (metodo !== 'CREDITO') {
    if (parcelas > 1) {
      throw new Error(`Parcelamento só existe no crédito; método recebido: ${metodo}`);
    }
    return [
      {
        parcelaNum: 1,
        parcelaTotal: 1,
        valorCentavos,
        competencia: competenciaDe(data),
        fatura: null,
      },
    ];
  }

  if (regra === null) {
    throw new Error('Lançamento no crédito exige a regra de fechamento do cartão');
  }

  const faturas = faturasDasParcelas(data, regra, parcelas);
  const valores = dividirParcelas(valorCentavos, parcelas);

  return faturas.map((fatura, indice) => ({
    parcelaNum: indice + 1,
    parcelaTotal: parcelas,
    valorCentavos: valores[indice],
    competencia: fatura.competencia,
    fatura,
  }));
}
