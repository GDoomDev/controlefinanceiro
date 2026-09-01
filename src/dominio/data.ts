/**
 * Datas civis de São Paulo e aritmética de competência.
 *
 * O app raciocina em datas civis ("20 de agosto"), não em instantes. Este módulo
 * é a única fronteira onde um `Date` vira ano/mês/dia, e ele fixa o fuso.
 */

const FUSO = 'America/Sao_Paulo';

/** Competência no formato `"YYYY-MM"`. */
export type Competencia = string;

export interface DataCivil {
  ano: number;
  /** 1..12 */
  mes: number;
  dia: number;
}

const formatador = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function dataCivilEm(instante: Date): DataCivil {
  // 'en-CA' produz exatamente "YYYY-MM-DD".
  const [ano, mes, dia] = formatador.format(instante).split('-').map(Number);
  return { ano, mes, dia };
}

export function criarCompetencia(ano: number, mes: number): Competencia {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new Error(`Mês fora de 1..12: ${mes}`);
  }
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}`;
}

export function competenciaDe(d: DataCivil): Competencia {
  return criarCompetencia(d.ano, d.mes);
}

export function partesDaCompetencia(c: Competencia): { ano: number; mes: number } {
  const casamento = /^(\d{4})-(\d{2})$/.exec(c);
  if (!casamento) {
    throw new Error(`Competência inválida: ${c}`);
  }
  const ano = Number(casamento[1]);
  const mes = Number(casamento[2]);
  if (mes < 1 || mes > 12) {
    throw new Error(`Competência com mês inválido: ${c}`);
  }
  return { ano, mes };
}

export function somarMeses(c: Competencia, n: number): Competencia {
  const { ano, mes } = partesDaCompetencia(c);
  // Converte para um índice absoluto de meses, soma, e volta.
  const indice = ano * 12 + (mes - 1) + n;
  return criarCompetencia(Math.floor(indice / 12), (indice % 12) + 1);
}

export function ultimoDiaDoMes(ano: number, mes: number): number {
  // Dia 0 do mês seguinte é o último dia do mês pedido.
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * Datas civis são persistidas como texto "YYYY-MM-DD", nunca como `Date`.
 * Um `Date` de meia-noite UTC vira o DIA ANTERIOR em São Paulo (UTC−3), e é
 * assim que todo lançamento perderia um dia na volta do banco.
 */
export function formatarDataCivil(d: DataCivil): string {
  const mes = String(d.mes).padStart(2, '0');
  const dia = String(d.dia).padStart(2, '0');
  return `${d.ano}-${mes}-${dia}`;
}

export function lerDataCivil(texto: string): DataCivil {
  const casamento = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!casamento) {
    throw new Error(`Data civil inválida, esperado "YYYY-MM-DD": ${texto}`);
  }
  const [, ano, mes, dia] = casamento.map(Number);
  return { ano, mes, dia };
}

/** Encurta o dia para o último do mês quando ele não existe (31 em fevereiro). */
export function diaSeguro(dia: number, ano: number, mes: number): number {
  return Math.min(dia, ultimoDiaDoMes(ano, mes));
}

/**
 * Diferença em dias civis. Positivo quando `ate` vem depois de `de`.
 *
 * Datas civis não têm hora, então a subtração é exata — nenhum horário de
 * verão ou fuso entra na conta. O `Date.UTC` aqui é só um jeito de numerar
 * dias; nenhum instante real é representado.
 */
export function diasEntre(de: DataCivil, ate: DataCivil): number {
  const emDias = (d: DataCivil): number =>
    Math.floor(Date.UTC(d.ano, d.mes - 1, d.dia) / 86400000);
  return emDias(ate) - emDias(de);
}
