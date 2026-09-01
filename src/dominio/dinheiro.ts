/**
 * Dinheiro é sempre inteiro em centavos. Nenhum valor monetário do domínio
 * é representado em ponto flutuante.
 */

export type Centavos = number;

const formatador = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/**
 * Converte um valor decimal em reais (o formato em que um humano digita ou em
 * que dados de fora chegam) para centavos inteiros. É a fronteira de entrada:
 * use uma vez, no ponto em que o valor decimal entra no sistema — seeds,
 * testes, ou o campo de valor de um formulário. Nunca encadeie cálculos em
 * reais e converta só no final; todo cálculo dentro do domínio já deve estar
 * em centavos.
 */
export function emCentavos(reais: number): Centavos {
  return Math.round(reais * 100);
}

export function formatarBRL(valor: Centavos): string {
  // O Intl separa "R$" do número com espaço NÃO SEPARÁVEL (U+00A0). Normalizamos
  // para espaço comum, senão a comparação de strings falha por um caractere
  // invisível. Use o escape   — nunca digite o caractere literal aqui.
  return formatador.format(valor / 100).replace(/\u00A0/g, ' ');
}

/**
 * Divide um total em parcelas iguais, com os centavos de resto na primeira.
 * A soma das parcelas é sempre exatamente o total.
 */
export function dividirParcelas(total: Centavos, quantidade: number): Centavos[] {
  if (!Number.isInteger(total) || total < 0) {
    throw new Error(`Total deve ser inteiro não negativo em centavos: ${total}`);
  }
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    throw new Error(`Quantidade de parcelas deve ser inteiro >= 1: ${quantidade}`);
  }

  const base = Math.floor(total / quantidade);
  const resto = total - base * quantidade;

  const parcelas = Array<Centavos>(quantidade).fill(base);
  parcelas[0] += resto;
  return parcelas;
}
