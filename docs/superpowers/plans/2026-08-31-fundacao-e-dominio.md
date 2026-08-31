# Fundação e Domínio — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um app Next.js que sobe, protegido por login Google, com toda a matemática financeira do spec implementada como módulos puros e coberta por testes.

**Architecture:** Três camadas com fronteiras rígidas. `src/dominio/` contém funções puras que não importam Prisma nem React — é onde vive competência de fatura, orçamento vigente e agregação. `src/dados/` (plano 2) fará as consultas. `src/app/` é a interface. Este plano constrói o domínio inteiro por TDD antes de existir qualquer banco, porque essas funções são onde errar sai caro e passa despercebido.

**Tech Stack:** Next.js 15 (App Router), TypeScript strict, Vitest, Prisma 6, Postgres (Neon), Auth.js v5 com provedor Google.

**Spec:** `docs/superpowers/specs/2026-08-31-controle-financeiro-design.md`

## Global Constraints

- **Dinheiro é sempre inteiro em centavos.** Nenhum ponto flutuante representa valor monetário em nenhum ponto do domínio. `R$ 20,00` é `2000`.
- **Fuso fixo `America/Sao_Paulo`** em todo cálculo que converte instante em data ou mês. O Brasil não usa horário de verão desde 2019, então o deslocamento é UTC−3 constante.
- **`src/dominio/` não importa Prisma, React, Next nem nada de I/O.** Só TypeScript puro. Essa restrição é o que mantém o domínio testável em milissegundos.
- **Competência é sempre a string `"YYYY-MM"`**, nunca um `Date`.
- **TypeScript em modo `strict`.** Sem `any` implícito.
- Toda tarefa termina com testes passando e um commit.

---

### Task 1: Scaffolding do projeto

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.env.example`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`
- Create: `src/dominio/versao.ts`
- Test: `src/dominio/versao.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: projeto com `npm test` e `npm run dev` funcionando. Todas as tarefas seguintes rodam `npx vitest run` para testar.

- [ ] **Step 1: Criar o projeto Next.js**

```bash
npx create-next-app@latest . \
  --typescript --app --src-dir --eslint \
  --no-tailwind --no-turbopack --import-alias "@/*"
```

Responda `No` se perguntar sobre sobrescrever arquivos existentes que não sejam do projeto. O diretório já contém `docs/` e `.gitignore` — ambos devem ser preservados.

- [ ] **Step 2: Instalar Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 3: Criar `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 4: Adicionar o script de teste ao `package.json`**

No campo `"scripts"`, acrescente:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Escrever o teste de fumaça**

Crie `src/dominio/versao.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { VERSAO_DOMINIO } from './versao';

describe('versao', () => {
  it('expõe a versão do domínio', () => {
    expect(VERSAO_DOMINIO).toBe('1.0.0');
  });
});
```

- [ ] **Step 6: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/dominio/versao.test.ts`
Expected: FAIL — `Failed to resolve import "./versao"`

- [ ] **Step 7: Criar `src/dominio/versao.ts`**

```ts
export const VERSAO_DOMINIO = '1.0.0';
```

- [ ] **Step 8: Rodar o teste e confirmar que passa**

Run: `npx vitest run`
Expected: PASS — 1 teste.

- [ ] **Step 9: Confirmar que o app sobe**

Run: `npm run dev`
Expected: servidor em `http://localhost:3000` respondendo com a página inicial do Next. Encerre com Ctrl+C.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffolding Next.js + TypeScript + Vitest"
```

---

### Task 2: Datas civis e aritmética de competência

Todo o resto do domínio depende deste módulo. Ele existe porque `Date` do JavaScript é um instante em UTC, e o app raciocina em **datas civis de São Paulo** — "20 de agosto" é 20 de agosto independentemente da hora.

**Files:**
- Create: `src/dominio/data.ts`
- Test: `src/dominio/data.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type Competencia = string` — formato `"YYYY-MM"`
  - `interface DataCivil { ano: number; mes: number; dia: number }` — `mes` é 1..12
  - `dataCivilEm(instante: Date): DataCivil`
  - `competenciaDe(d: DataCivil): Competencia`
  - `criarCompetencia(ano: number, mes: number): Competencia`
  - `partesDaCompetencia(c: Competencia): { ano: number; mes: number }`
  - `somarMeses(c: Competencia, n: number): Competencia`
  - `ultimoDiaDoMes(ano: number, mes: number): number`
  - `diaSeguro(dia: number, ano: number, mes: number): number`
  - `formatarDataCivil(d: DataCivil): string` — `"YYYY-MM-DD"`
  - `lerDataCivil(texto: string): DataCivil`

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/dominio/data.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  competenciaDe,
  criarCompetencia,
  dataCivilEm,
  diaSeguro,
  formatarDataCivil,
  lerDataCivil,
  partesDaCompetencia,
  somarMeses,
  ultimoDiaDoMes,
} from './data';

describe('dataCivilEm', () => {
  it('converte um instante para a data civil de São Paulo', () => {
    expect(dataCivilEm(new Date('2026-08-20T15:00:00Z'))).toEqual({
      ano: 2026,
      mes: 8,
      dia: 20,
    });
  });

  it('mantém a compra das 22h no dia em que ela aconteceu em São Paulo', () => {
    // 2026-08-31T01:30Z é 2026-08-30 22:30 em São Paulo.
    expect(dataCivilEm(new Date('2026-08-31T01:30:00Z'))).toEqual({
      ano: 2026,
      mes: 8,
      dia: 30,
    });
  });
});

describe('competenciaDe', () => {
  it('formata com mês de dois dígitos', () => {
    expect(competenciaDe({ ano: 2026, mes: 9, dia: 5 })).toBe('2026-09');
    expect(competenciaDe({ ano: 2026, mes: 12, dia: 31 })).toBe('2026-12');
  });
});

describe('criarCompetencia e partesDaCompetencia', () => {
  it('faz a volta completa', () => {
    expect(criarCompetencia(2026, 3)).toBe('2026-03');
    expect(partesDaCompetencia('2026-03')).toEqual({ ano: 2026, mes: 3 });
  });

  it('rejeita mês fora de 1..12', () => {
    expect(() => criarCompetencia(2026, 0)).toThrow();
    expect(() => criarCompetencia(2026, 13)).toThrow();
  });

  it('rejeita formato inválido', () => {
    expect(() => partesDaCompetencia('2026-3')).toThrow();
    expect(() => partesDaCompetencia('agosto')).toThrow();
  });
});

describe('somarMeses', () => {
  it('avança dentro do mesmo ano', () => {
    expect(somarMeses('2026-08', 1)).toBe('2026-09');
  });

  it('vira o ano para frente', () => {
    expect(somarMeses('2026-11', 2)).toBe('2027-01');
  });

  it('vira o ano para trás', () => {
    expect(somarMeses('2026-01', -1)).toBe('2025-12');
  });

  it('aceita zero', () => {
    expect(somarMeses('2026-08', 0)).toBe('2026-08');
  });

  it('cobre o alcance de um parcelamento longo', () => {
    expect(somarMeses('2026-09', 9)).toBe('2027-06');
  });
});

describe('ultimoDiaDoMes', () => {
  it('conhece os meses de 30 e 31 dias', () => {
    expect(ultimoDiaDoMes(2026, 1)).toBe(31);
    expect(ultimoDiaDoMes(2026, 4)).toBe(30);
  });

  it('conhece fevereiro em ano comum e bissexto', () => {
    expect(ultimoDiaDoMes(2026, 2)).toBe(28);
    expect(ultimoDiaDoMes(2024, 2)).toBe(29);
  });
});

describe('formatarDataCivil e lerDataCivil', () => {
  it('formata com mês e dia de dois dígitos', () => {
    expect(formatarDataCivil({ ano: 2026, mes: 8, dia: 5 })).toBe('2026-08-05');
    expect(formatarDataCivil({ ano: 2026, mes: 12, dia: 31 })).toBe('2026-12-31');
  });

  it('faz a volta completa sem perder um dia', () => {
    expect(lerDataCivil('2026-08-20')).toEqual({ ano: 2026, mes: 8, dia: 20 });
  });

  it('rejeita formato inválido', () => {
    expect(() => lerDataCivil('2026-8-5')).toThrow();
    expect(() => lerDataCivil('20/08/2026')).toThrow();
  });
});

describe('diaSeguro', () => {
  it('devolve o dia quando ele existe no mês', () => {
    expect(diaSeguro(25, 2026, 8)).toBe(25);
  });

  it('encurta o dia 31 para o último dia de fevereiro', () => {
    expect(diaSeguro(31, 2026, 2)).toBe(28);
    expect(diaSeguro(31, 2024, 2)).toBe(29);
  });

  it('encurta o dia 31 para 30 em meses de 30 dias', () => {
    expect(diaSeguro(31, 2026, 4)).toBe(30);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/dominio/data.test.ts`
Expected: FAIL — `Failed to resolve import "./data"`

- [ ] **Step 3: Implementar `src/dominio/data.ts`**

```ts
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
  return `${ano}-${String(mes).padStart(2, '0')}`;
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
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/dominio/data.test.ts`
Expected: PASS — 19 testes.

- [ ] **Step 5: Commit**

```bash
git add src/dominio/data.ts src/dominio/data.test.ts
git commit -m "feat(dominio): datas civis de São Paulo e aritmética de competência"
```

---

### Task 3: Dinheiro em centavos e divisão de parcelas

**Files:**
- Create: `src/dominio/dinheiro.ts`
- Test: `src/dominio/dinheiro.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type Centavos = number`
  - `emCentavos(reais: number): Centavos`
  - `formatarBRL(valor: Centavos): string`
  - `dividirParcelas(total: Centavos, quantidade: number): Centavos[]`

O ponto sutil aqui é a divisão: `R$ 100,05` em 10 parcelas não divide exato. Os centavos de resto vão **para a primeira parcela**, e a soma das parcelas tem de bater com o total ao centavo.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/dominio/dinheiro.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dividirParcelas, emCentavos, formatarBRL } from './dinheiro';

describe('emCentavos', () => {
  it('converte reais para centavos inteiros', () => {
    expect(emCentavos(20)).toBe(2000);
    expect(emCentavos(20.5)).toBe(2050);
    expect(emCentavos(100.05)).toBe(10005);
  });

  it('arredonda o terceiro decimal em vez de truncar', () => {
    // 0.1 + 0.2 = 0.30000000000000004 em ponto flutuante.
    expect(emCentavos(0.1 + 0.2)).toBe(30);
  });
});

describe('formatarBRL', () => {
  it('formata com separador de milhar e dois decimais', () => {
    expect(formatarBRL(2000)).toBe('R$ 20,00');
    expect(formatarBRL(10005)).toBe('R$ 100,05');
    expect(formatarBRL(220000)).toBe('R$ 2.200,00');
  });

  it('formata zero e negativo', () => {
    expect(formatarBRL(0)).toBe('R$ 0,00');
    expect(formatarBRL(-12000)).toBe('-R$ 120,00');
  });
});

describe('dividirParcelas', () => {
  it('divide exato quando não há resto', () => {
    expect(dividirParcelas(200000, 10)).toEqual(Array(10).fill(20000));
  });

  it('joga os centavos de resto na primeira parcela', () => {
    const parcelas = dividirParcelas(10005, 10);
    expect(parcelas[0]).toBe(1005);
    expect(parcelas.slice(1)).toEqual(Array(9).fill(1000));
  });

  it('sempre soma exatamente o total', () => {
    for (const total of [10005, 99999, 1, 733, 123457]) {
      for (const n of [2, 3, 7, 10, 12]) {
        const soma = dividirParcelas(total, n).reduce((a, b) => a + b, 0);
        expect(soma).toBe(total);
      }
    }
  });

  it('devolve uma única parcela quando quantidade é 1', () => {
    expect(dividirParcelas(10005, 1)).toEqual([10005]);
  });

  it('rejeita quantidade menor que 1', () => {
    expect(() => dividirParcelas(1000, 0)).toThrow();
  });

  it('rejeita total negativo', () => {
    expect(() => dividirParcelas(-1000, 2)).toThrow();
  });

  it('rejeita total não inteiro', () => {
    expect(() => dividirParcelas(100.5, 2)).toThrow();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/dominio/dinheiro.test.ts`
Expected: FAIL — `Failed to resolve import "./dinheiro"`

- [ ] **Step 3: Implementar `src/dominio/dinheiro.ts`**

```ts
/**
 * Dinheiro é sempre inteiro em centavos. Nenhum valor monetário do domínio
 * é representado em ponto flutuante.
 */

export type Centavos = number;

const formatador = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/** Converte reais para centavos. Use só em seeds e testes, nunca em cálculo. */
export function emCentavos(reais: number): Centavos {
  return Math.round(reais * 100);
}

export function formatarBRL(valor: Centavos): string {
  // O Intl separa "R$" do número com espaço NÃO SEPARÁVEL (U+00A0). Normalizamos
  // para espaço comum, senão a comparação de strings falha por um caractere
  // invisível. Use o escape \u00A0 — nunca digite o caractere literal aqui.
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
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/dominio/dinheiro.test.ts`
Expected: PASS — 11 testes.

- [ ] **Step 5: Commit**

```bash
git add src/dominio/dinheiro.ts src/dominio/dinheiro.test.ts
git commit -m "feat(dominio): centavos, formatação BRL e divisão de parcelas"
```

---

### Task 4: Motor de competência de fatura

O coração do app. Decide em que mês-orçamento cai cada compra de cartão.

**Files:**
- Create: `src/dominio/fatura.ts`
- Test: `src/dominio/fatura.test.ts`

**Interfaces:**
- Consumes: `Competencia`, `DataCivil`, `criarCompetencia`, `partesDaCompetencia`, `somarMeses`, `diaSeguro` de `./data`.
- Produces:
  - `interface RegraCartao { diaFechamento: number; diaVencimento: number }`
  - `interface Fatura { competencia: Competencia; fechamento: DataCivil; vencimento: DataCivil }`
  - `faturaDaCompra(compra: DataCivil, regra: RegraCartao): Fatura`
  - `faturaDaCompetencia(c: Competencia, regra: RegraCartao): Fatura`
  - `faturasDasParcelas(compra: DataCivil, regra: RegraCartao, quantidade: number): Fatura[]`

Regras do spec, seção 4:
- A compra entra na fatura que fecha no dia `diaFechamento`; se a compra for **depois** do fechamento deste mês, entra na do mês seguinte.
- O vencimento cai no **mesmo mês** do fechamento quando `diaVencimento > diaFechamento`, e no mês seguinte caso contrário.
- A competência é o **mês do vencimento**.
- Dias 29 a 31 são encurtados para o último dia do mês.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/dominio/fatura.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { faturaDaCompetencia, faturaDaCompra, faturasDasParcelas } from './fatura';

// Cartão do exemplo do spec: fecha 25, vence 5 (vencimento no mês seguinte).
const FECHA_25_VENCE_5 = { diaFechamento: 25, diaVencimento: 5 };
// Cartão em que o vencimento cai no mesmo mês do fechamento.
const FECHA_5_VENCE_15 = { diaFechamento: 5, diaVencimento: 15 };

describe('faturaDaCompra', () => {
  it('compra antes do fechamento vence no mês seguinte', () => {
    const f = faturaDaCompra({ ano: 2026, mes: 8, dia: 20 }, FECHA_25_VENCE_5);
    expect(f.fechamento).toEqual({ ano: 2026, mes: 8, dia: 25 });
    expect(f.vencimento).toEqual({ ano: 2026, mes: 9, dia: 5 });
    expect(f.competencia).toBe('2026-09');
  });

  it('compra depois do fechamento pula uma fatura', () => {
    const f = faturaDaCompra({ ano: 2026, mes: 8, dia: 28 }, FECHA_25_VENCE_5);
    expect(f.fechamento).toEqual({ ano: 2026, mes: 9, dia: 25 });
    expect(f.vencimento).toEqual({ ano: 2026, mes: 10, dia: 5 });
    expect(f.competencia).toBe('2026-10');
  });

  it('compra exatamente no dia do fechamento entra na fatura que fecha', () => {
    const f = faturaDaCompra({ ano: 2026, mes: 8, dia: 25 }, FECHA_25_VENCE_5);
    expect(f.competencia).toBe('2026-09');
  });

  it('vence no mesmo mês quando o dia de vencimento é maior que o de fechamento', () => {
    const f = faturaDaCompra({ ano: 2026, mes: 8, dia: 3 }, FECHA_5_VENCE_15);
    expect(f.fechamento).toEqual({ ano: 2026, mes: 8, dia: 5 });
    expect(f.vencimento).toEqual({ ano: 2026, mes: 8, dia: 15 });
    expect(f.competencia).toBe('2026-08');
  });

  it('vira o ano corretamente', () => {
    const f = faturaDaCompra({ ano: 2026, mes: 12, dia: 28 }, FECHA_25_VENCE_5);
    expect(f.fechamento).toEqual({ ano: 2027, mes: 1, dia: 25 });
    expect(f.competencia).toBe('2027-02');
  });

  it('encurta o fechamento do dia 31 em fevereiro', () => {
    const regra = { diaFechamento: 31, diaVencimento: 10 };
    const f = faturaDaCompra({ ano: 2026, mes: 2, dia: 27 }, regra);
    expect(f.fechamento).toEqual({ ano: 2026, mes: 2, dia: 28 });
    expect(f.vencimento).toEqual({ ano: 2026, mes: 3, dia: 10 });
    expect(f.competencia).toBe('2026-03');
  });

  it('encurta o vencimento do dia 31 em fevereiro', () => {
    const regra = { diaFechamento: 20, diaVencimento: 31 };
    const f = faturaDaCompra({ ano: 2026, mes: 2, dia: 10 }, regra);
    // 31 > 20, então vence no mesmo mês do fechamento — encurtado para 28.
    expect(f.vencimento).toEqual({ ano: 2026, mes: 2, dia: 28 });
    expect(f.competencia).toBe('2026-02');
  });
});

describe('faturaDaCompetencia', () => {
  it('é o inverso de faturaDaCompra', () => {
    const compra = { ano: 2026, mes: 8, dia: 20 };
    const daCompra = faturaDaCompra(compra, FECHA_25_VENCE_5);
    const daCompetencia = faturaDaCompetencia(daCompra.competencia, FECHA_25_VENCE_5);
    expect(daCompetencia).toEqual(daCompra);
  });

  it('é o inverso também quando o vencimento é no mesmo mês', () => {
    const compra = { ano: 2026, mes: 8, dia: 3 };
    const daCompra = faturaDaCompra(compra, FECHA_5_VENCE_15);
    const daCompetencia = faturaDaCompetencia(daCompra.competencia, FECHA_5_VENCE_15);
    expect(daCompetencia).toEqual(daCompra);
  });
});

describe('faturasDasParcelas', () => {
  it('distribui as parcelas em meses consecutivos', () => {
    const faturas = faturasDasParcelas(
      { ano: 2026, mes: 8, dia: 20 },
      FECHA_25_VENCE_5,
      10,
    );
    expect(faturas).toHaveLength(10);
    expect(faturas.map((f) => f.competencia)).toEqual([
      '2026-09', '2026-10', '2026-11', '2026-12',
      '2027-01', '2027-02', '2027-03', '2027-04',
      '2027-05', '2027-06',
    ]);
  });

  it('mantém fechamento e vencimento coerentes em cada parcela', () => {
    const faturas = faturasDasParcelas(
      { ano: 2026, mes: 12, dia: 28 },
      FECHA_25_VENCE_5,
      3,
    );
    expect(faturas[0].vencimento).toEqual({ ano: 2027, mes: 2, dia: 5 });
    expect(faturas[2].vencimento).toEqual({ ano: 2027, mes: 4, dia: 5 });
  });

  it('à vista devolve uma fatura só', () => {
    const faturas = faturasDasParcelas(
      { ano: 2026, mes: 8, dia: 20 },
      FECHA_25_VENCE_5,
      1,
    );
    expect(faturas).toHaveLength(1);
    expect(faturas[0].competencia).toBe('2026-09');
  });

  it('rejeita quantidade menor que 1', () => {
    expect(() =>
      faturasDasParcelas({ ano: 2026, mes: 8, dia: 20 }, FECHA_25_VENCE_5, 0),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/dominio/fatura.test.ts`
Expected: FAIL — `Failed to resolve import "./fatura"`

- [ ] **Step 3: Implementar `src/dominio/fatura.ts`**

```ts
/**
 * Motor de competência de cartão de crédito.
 *
 * A competência de uma compra no crédito é o MÊS DO VENCIMENTO da fatura em que
 * ela cai — não o mês da compra. Ver spec, seção 4.
 */

import {
  type Competencia,
  type DataCivil,
  criarCompetencia,
  diaSeguro,
  partesDaCompetencia,
  somarMeses,
} from './data';

export interface RegraCartao {
  /** Dia do mês em que a fatura fecha. 1..31 */
  diaFechamento: number;
  /** Dia do mês em que a fatura vence. 1..31 */
  diaVencimento: number;
}

export interface Fatura {
  /** Mês do vencimento — é esta a competência do lançamento. */
  competencia: Competencia;
  fechamento: DataCivil;
  vencimento: DataCivil;
}

/**
 * O vencimento cai no mesmo mês do fechamento quando o dia de vencimento é
 * maior que o de fechamento; caso contrário, no mês seguinte. A comparação usa
 * os dias configurados, não os encurtados.
 */
function vencimentoNoMesmoMes(regra: RegraCartao): boolean {
  return regra.diaVencimento > regra.diaFechamento;
}

function montarFatura(competenciaFechamento: Competencia, regra: RegraCartao): Fatura {
  const competenciaVencimento = vencimentoNoMesmoMes(regra)
    ? competenciaFechamento
    : somarMeses(competenciaFechamento, 1);

  const f = partesDaCompetencia(competenciaFechamento);
  const v = partesDaCompetencia(competenciaVencimento);

  return {
    competencia: competenciaVencimento,
    fechamento: { ano: f.ano, mes: f.mes, dia: diaSeguro(regra.diaFechamento, f.ano, f.mes) },
    vencimento: { ano: v.ano, mes: v.mes, dia: diaSeguro(regra.diaVencimento, v.ano, v.mes) },
  };
}

export function faturaDaCompra(compra: DataCivil, regra: RegraCartao): Fatura {
  const fechamentoDesteMes = diaSeguro(regra.diaFechamento, compra.ano, compra.mes);
  const competenciaDaCompra = criarCompetencia(compra.ano, compra.mes);

  // Comprou depois do fechamento? Entra na fatura do mês seguinte.
  const competenciaFechamento =
    compra.dia > fechamentoDesteMes
      ? somarMeses(competenciaDaCompra, 1)
      : competenciaDaCompra;

  return montarFatura(competenciaFechamento, regra);
}

/** Reconstrói a fatura a partir da competência (mês do vencimento). */
export function faturaDaCompetencia(c: Competencia, regra: RegraCartao): Fatura {
  const competenciaFechamento = vencimentoNoMesmoMes(regra) ? c : somarMeses(c, -1);
  return montarFatura(competenciaFechamento, regra);
}

/**
 * Faturas das parcelas de uma compra: a parcela k cai na competência da
 * primeira somada de (k−1) meses.
 */
export function faturasDasParcelas(
  compra: DataCivil,
  regra: RegraCartao,
  quantidade: number,
): Fatura[] {
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    throw new Error(`Quantidade de parcelas deve ser inteiro >= 1: ${quantidade}`);
  }

  const primeira = faturaDaCompra(compra, regra);
  return Array.from({ length: quantidade }, (_, k) =>
    faturaDaCompetencia(somarMeses(primeira.competencia, k), regra),
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/dominio/fatura.test.ts`
Expected: PASS — 13 testes.

- [ ] **Step 5: Commit**

```bash
git add src/dominio/fatura.ts src/dominio/fatura.test.ts
git commit -m "feat(dominio): motor de competência de fatura e distribuição de parcelas"
```

---

### Task 5: Orçamento vigente

Implementa o versionamento da seção 5 do spec: uma linha por mudança, e o valor de um mês é o da última mudança com vigência menor ou igual a ele.

**Files:**
- Create: `src/dominio/orcamento.ts`
- Test: `src/dominio/orcamento.test.ts`

**Interfaces:**
- Consumes: `Competencia` de `./data`, `Centavos` de `./dinheiro`.
- Produces:
  - `interface Alocacao { vigenteDe: Competencia; valorCentavos: Centavos }`
  - `alocacaoVigente(alocacoes: Alocacao[], mes: Competencia): Centavos`
  - `origemDaAlocacao(alocacoes: Alocacao[], mes: Competencia): Competencia | null`

`origemDaAlocacao` devolve a competência da linha que está valendo, e serve para a interface mostrar "herdado de setembro" ou "definido neste mês" (spec, seção 5). Devolve `null` quando não há alocação vigente.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/dominio/orcamento.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { type Alocacao, alocacaoVigente, origemDaAlocacao } from './orcamento';

// O cenário do spec: Alimentação em ago=1000, set=800, dez=600.
const ALIMENTACAO: Alocacao[] = [
  { vigenteDe: '2026-08', valorCentavos: 100000 },
  { vigenteDe: '2026-09', valorCentavos: 80000 },
  { vigenteDe: '2026-12', valorCentavos: 60000 },
];

describe('alocacaoVigente', () => {
  it('reproduz a tabela de herança do spec', () => {
    expect(alocacaoVigente(ALIMENTACAO, '2026-08')).toBe(100000);
    expect(alocacaoVigente(ALIMENTACAO, '2026-09')).toBe(80000);
    expect(alocacaoVigente(ALIMENTACAO, '2026-10')).toBe(80000);
    expect(alocacaoVigente(ALIMENTACAO, '2026-11')).toBe(80000);
    expect(alocacaoVigente(ALIMENTACAO, '2026-12')).toBe(60000);
    expect(alocacaoVigente(ALIMENTACAO, '2027-01')).toBe(60000);
  });

  it('devolve zero antes da primeira alocação', () => {
    expect(alocacaoVigente(ALIMENTACAO, '2026-07')).toBe(0);
  });

  it('devolve zero quando não há alocação nenhuma', () => {
    expect(alocacaoVigente([], '2026-09')).toBe(0);
  });

  it('não depende da ordem de entrada', () => {
    const embaralhado = [ALIMENTACAO[2], ALIMENTACAO[0], ALIMENTACAO[1]];
    expect(alocacaoVigente(embaralhado, '2026-10')).toBe(80000);
  });

  it('aceita alocação de valor zero como uma decisão válida', () => {
    const zerado: Alocacao[] = [
      { vigenteDe: '2026-08', valorCentavos: 100000 },
      { vigenteDe: '2026-09', valorCentavos: 0 },
    ];
    expect(alocacaoVigente(zerado, '2026-10')).toBe(0);
  });
});

describe('origemDaAlocacao', () => {
  it('aponta o próprio mês quando ele define o valor', () => {
    expect(origemDaAlocacao(ALIMENTACAO, '2026-09')).toBe('2026-09');
  });

  it('aponta o mês de origem quando o valor é herdado', () => {
    expect(origemDaAlocacao(ALIMENTACAO, '2026-11')).toBe('2026-09');
  });

  it('devolve null quando não há alocação vigente', () => {
    expect(origemDaAlocacao(ALIMENTACAO, '2026-07')).toBeNull();
    expect(origemDaAlocacao([], '2026-09')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/dominio/orcamento.test.ts`
Expected: FAIL — `Failed to resolve import "./orcamento"`

- [ ] **Step 3: Implementar `src/dominio/orcamento.ts`**

```ts
/**
 * Orçamento versionado por vigência (spec, seção 5).
 *
 * Guardamos uma linha por MUDANÇA, não uma por mês. O valor vigente em um mês é
 * o da última mudança com vigência menor ou igual a ele — é isso que faz alterar
 * dezembro não mexer em outubro.
 */

import type { Competencia } from './data';
import type { Centavos } from './dinheiro';

export interface Alocacao {
  vigenteDe: Competencia;
  valorCentavos: Centavos;
}

/**
 * A competência é `"YYYY-MM"` com mês de dois dígitos, então comparação
 * lexicográfica de string equivale a comparação cronológica.
 */
function vigenteEm(alocacoes: Alocacao[], mes: Competencia): Alocacao | null {
  let escolhida: Alocacao | null = null;
  for (const a of alocacoes) {
    if (a.vigenteDe <= mes && (escolhida === null || a.vigenteDe > escolhida.vigenteDe)) {
      escolhida = a;
    }
  }
  return escolhida;
}

export function alocacaoVigente(alocacoes: Alocacao[], mes: Competencia): Centavos {
  return vigenteEm(alocacoes, mes)?.valorCentavos ?? 0;
}

/** Competência da linha que está valendo — para a interface distinguir herdado de definido. */
export function origemDaAlocacao(
  alocacoes: Alocacao[],
  mes: Competencia,
): Competencia | null {
  return vigenteEm(alocacoes, mes)?.vigenteDe ?? null;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/dominio/orcamento.test.ts`
Expected: PASS — 8 testes.

- [ ] **Step 5: Commit**

```bash
git add src/dominio/orcamento.ts src/dominio/orcamento.test.ts
git commit -m "feat(dominio): resolução de orçamento vigente por competência"
```

---

### Task 6: Agregação e fórmula da sobra

Implementa a seção 7 do spec, incluindo os quatro estados de reembolso da seção 6 e o efeito do estorno.

**Files:**
- Create: `src/dominio/agregacao.ts`
- Test: `src/dominio/agregacao.test.ts`

**Interfaces:**
- Consumes: `Competencia` de `./data`, `Centavos` de `./dinheiro`, `Alocacao` e `alocacaoVigente` de `./orcamento`.
- Produces:
  - `interface DespesaAgregavel { competencia: Competencia; categoriaId: string; valorCentavos: Centavos; cancelada: boolean }`
  - `interface CreditoAgregavel { competenciaCredito: Competencia; categoriaId: string; valorCentavos: Centavos }`
  - `gastoPorCategoria(despesas, creditos, mes): Map<string, Centavos>`
  - `despesaLiquida(despesas, creditos, mes): Centavos`
  - `receitaConsiderada(prevista, realizada, ehMesPassado): Centavos`
  - `sobraRealizada(receitaRealizada, despesaLiquida): Centavos`
  - `sobraProjetada(receita, orcamentos, gastos): Centavos`

Assinaturas exatas:

```ts
function sobraProjetada(
  receita: Centavos,
  orcamentos: Map<string, Centavos>,
  gastos: Map<string, Centavos>,
): Centavos
```

`orcamentos` mapeia `categoriaId` para a alocação vigente naquele mês (obtida com `alocacaoVigente` da Task 5), e `gastos` mapeia `categoriaId` para o gasto líquido (obtido com `gastoPorCategoria`). O somatório percorre a **união** das chaves dos dois mapas.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/dominio/agregacao.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  type CreditoAgregavel,
  type DespesaAgregavel,
  despesaLiquida,
  gastoPorCategoria,
  receitaConsiderada,
  sobraProjetada,
  sobraRealizada,
} from './agregacao';

const despesa = (
  competencia: string,
  categoriaId: string,
  valorCentavos: number,
  cancelada = false,
): DespesaAgregavel => ({ competencia, categoriaId, valorCentavos, cancelada });

const credito = (
  competenciaCredito: string,
  categoriaId: string,
  valorCentavos: number,
): CreditoAgregavel => ({ competenciaCredito, categoriaId, valorCentavos });

describe('gastoPorCategoria', () => {
  it('soma despesas ativas da competência pedida', () => {
    const despesas = [
      despesa('2026-09', 'alimentacao', 60000),
      despesa('2026-09', 'alimentacao', 34000),
      despesa('2026-09', 'lazer', 62000),
      despesa('2026-10', 'alimentacao', 10000),
    ];
    const gastos = gastoPorCategoria(despesas, [], '2026-09');
    expect(gastos.get('alimentacao')).toBe(94000);
    expect(gastos.get('lazer')).toBe(62000);
    expect(gastos.has('2026-10')).toBe(false);
  });

  it('ignora despesas canceladas', () => {
    const despesas = [
      despesa('2026-09', 'eletronicos', 30000),
      despesa('2026-09', 'eletronicos', 20000, true),
    ];
    expect(gastoPorCategoria(despesas, [], '2026-09').get('eletronicos')).toBe(30000);
  });

  it('subtrai crédito de reembolso na competência da despesa', () => {
    const despesas = [despesa('2026-09', 'alimentacao', 30000)];
    const creditos = [credito('2026-09', 'alimentacao', 30000)];
    expect(gastoPorCategoria(despesas, creditos, '2026-09').get('alimentacao')).toBe(0);
  });

  it('subtrai reembolso parcial', () => {
    const despesas = [despesa('2026-09', 'alimentacao', 30000)];
    const creditos = [credito('2026-09', 'alimentacao', 10000)];
    expect(gastoPorCategoria(despesas, creditos, '2026-09').get('alimentacao')).toBe(20000);
  });

  it('soma recebimentos parciais sucessivos até quitar', () => {
    const despesas = [despesa('2026-09', 'alimentacao', 30000)];
    const creditos = [
      credito('2026-09', 'alimentacao', 10000),
      credito('2026-09', 'alimentacao', 20000),
    ];
    expect(gastoPorCategoria(despesas, creditos, '2026-09').get('alimentacao')).toBe(0);
  });

  it('conta o crédito na competência dele, não na da despesa', () => {
    // Estorno com crédito único: a despesa é de setembro, o crédito caiu em novembro.
    const despesas = [despesa('2026-09', 'eletronicos', 60000)];
    const creditos = [credito('2026-11', 'eletronicos', 60000)];
    expect(gastoPorCategoria(despesas, creditos, '2026-09').get('eletronicos')).toBe(60000);
    expect(gastoPorCategoria(despesas, creditos, '2026-11').get('eletronicos')).toBe(-60000);
  });

  it('permite categoria com gasto líquido negativo', () => {
    const despesas = [despesa('2026-11', 'eletronicos', 10000)];
    const creditos = [credito('2026-11', 'eletronicos', 60000)];
    expect(gastoPorCategoria(despesas, creditos, '2026-11').get('eletronicos')).toBe(-50000);
  });
});

describe('despesaLiquida', () => {
  it('soma todas as categorias da competência', () => {
    const despesas = [
      despesa('2026-09', 'alimentacao', 94000),
      despesa('2026-09', 'lazer', 62000),
    ];
    const creditos = [credito('2026-09', 'lazer', 2000)];
    expect(despesaLiquida(despesas, creditos, '2026-09')).toBe(154000);
  });

  it('é zero quando não há nada na competência', () => {
    expect(despesaLiquida([], [], '2026-09')).toBe(0);
  });
});

describe('receitaConsiderada', () => {
  it('usa a realizada em mês passado', () => {
    expect(receitaConsiderada(600000, 590000, true)).toBe(590000);
  });

  it('usa a maior entre prevista e realizada no mês corrente ou futuro', () => {
    // Salário ainda não caiu.
    expect(receitaConsiderada(609000, 0, false)).toBe(609000);
    // Bônus acima do previsto.
    expect(receitaConsiderada(609000, 750000, false)).toBe(750000);
    // Sem previsão cadastrada, mas já recebido.
    expect(receitaConsiderada(0, 609000, false)).toBe(609000);
  });
});

describe('sobraRealizada', () => {
  it('é receita menos despesa líquida', () => {
    expect(sobraRealizada(609000, 441500)).toBe(167500);
  });

  it('pode ser negativa', () => {
    expect(sobraRealizada(100000, 150000)).toBe(-50000);
  });
});

describe('sobraProjetada', () => {
  it('usa o orçamento quando ele ainda não foi consumido', () => {
    const orcamentos = new Map([['alimentacao', 120000]]);
    const gastos = new Map([['alimentacao', 94000]]);
    // 609000 − máx(120000, 94000) = 489000
    expect(sobraProjetada(609000, orcamentos, gastos)).toBe(489000);
  });

  it('usa o comprometido quando ele passou do orçamento', () => {
    // Parcela de 300 já lançada num orçamento de 200.
    const orcamentos = new Map([['eletronicos', 20000]]);
    const gastos = new Map([['eletronicos', 30000]]);
    expect(sobraProjetada(609000, orcamentos, gastos)).toBe(579000);
  });

  it('não soma orçamento e comprometido duas vezes', () => {
    const orcamentos = new Map([['eletronicos', 20000]]);
    const gastos = new Map([['eletronicos', 30000]]);
    // Se somasse, daria 609000 − 50000 = 559000.
    expect(sobraProjetada(609000, orcamentos, gastos)).not.toBe(559000);
  });

  it('inclui categoria que tem gasto mas não tem orçamento', () => {
    const orcamentos = new Map<string, number>();
    const gastos = new Map([['arquivada', 15000]]);
    expect(sobraProjetada(100000, orcamentos, gastos)).toBe(85000);
  });

  it('inclui categoria que tem orçamento mas não tem gasto', () => {
    const orcamentos = new Map([['saude', 30000]]);
    const gastos = new Map<string, number>();
    expect(sobraProjetada(100000, orcamentos, gastos)).toBe(70000);
  });

  it('reproduz o mês de exemplo do spec', () => {
    const orcamentos = new Map([
      ['moradia', 220000],
      ['alimentacao', 120000],
      ['lazer', 50000],
      ['transporte', 40000],
      ['assinaturas', 18000],
      ['saude', 30000],
    ]);
    const gastos = new Map([
      ['moradia', 220000],
      ['alimentacao', 94000],
      ['lazer', 62000],
      ['transporte', 38500],
      ['assinaturas', 18000],
      ['saude', 9000],
    ]);
    // máx por categoria: 220000 + 120000 + 62000 + 40000 + 18000 + 30000 = 490000
    expect(sobraProjetada(609000, orcamentos, gastos)).toBe(119000);
  });

  it('trata gasto líquido negativo sem quebrar o máximo', () => {
    const orcamentos = new Map([['eletronicos', 20000]]);
    const gastos = new Map([['eletronicos', -50000]]);
    // máx(20000, −50000) = 20000
    expect(sobraProjetada(100000, orcamentos, gastos)).toBe(80000);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/dominio/agregacao.test.ts`
Expected: FAIL — `Failed to resolve import "./agregacao"`

- [ ] **Step 3: Implementar `src/dominio/agregacao.ts`**

```ts
/**
 * Agregação mensal e fórmula da sobra (spec, seção 7).
 *
 * Duas regras não óbvias moram aqui:
 *  1. Créditos são somados pela SUA competência, não pela da despesa. No
 *     reembolso as duas coincidem; no estorno com crédito único, não.
 *  2. A projeção usa máx(orçamento, comprometido) por categoria — somar os dois
 *     contaria a parcela já lançada duas vezes.
 */

import type { Competencia } from './data';
import type { Centavos } from './dinheiro';

export interface DespesaAgregavel {
  competencia: Competencia;
  categoriaId: string;
  valorCentavos: Centavos;
  cancelada: boolean;
}

export interface CreditoAgregavel {
  competenciaCredito: Competencia;
  categoriaId: string;
  valorCentavos: Centavos;
}

function somarNoMapa(mapa: Map<string, Centavos>, chave: string, valor: Centavos): void {
  mapa.set(chave, (mapa.get(chave) ?? 0) + valor);
}

/**
 * Gasto líquido por categoria na competência: despesas ativas menos créditos.
 * O resultado pode ser negativo quando um estorno cai num mês de pouco gasto.
 */
export function gastoPorCategoria(
  despesas: DespesaAgregavel[],
  creditos: CreditoAgregavel[],
  mes: Competencia,
): Map<string, Centavos> {
  const gastos = new Map<string, Centavos>();

  for (const d of despesas) {
    if (d.cancelada || d.competencia !== mes) continue;
    somarNoMapa(gastos, d.categoriaId, d.valorCentavos);
  }

  for (const c of creditos) {
    if (c.competenciaCredito !== mes) continue;
    somarNoMapa(gastos, c.categoriaId, -c.valorCentavos);
  }

  return gastos;
}

export function despesaLiquida(
  despesas: DespesaAgregavel[],
  creditos: CreditoAgregavel[],
  mes: Competencia,
): Centavos {
  let total = 0;
  for (const valor of gastoPorCategoria(despesas, creditos, mes).values()) {
    total += valor;
  }
  return total;
}

/**
 * Mês passado usa o que de fato entrou. Mês corrente e futuros usam o maior
 * entre previsto e realizado — cobre receita ainda não recebida, já recebida,
 * e bônus acima do previsto.
 */
export function receitaConsiderada(
  prevista: Centavos,
  realizada: Centavos,
  ehMesPassado: boolean,
): Centavos {
  return ehMesPassado ? realizada : Math.max(prevista, realizada);
}

export function sobraRealizada(
  receitaRealizada: Centavos,
  despesaLiquidaDoMes: Centavos,
): Centavos {
  return receitaRealizada - despesaLiquidaDoMes;
}

/**
 * Sobra projetada: receita menos o somatório de máx(orçamento, comprometido)
 * sobre a união das categorias com orçamento e das categorias com gasto.
 */
export function sobraProjetada(
  receita: Centavos,
  orcamentos: Map<string, Centavos>,
  gastos: Map<string, Centavos>,
): Centavos {
  const categorias = new Set([...orcamentos.keys(), ...gastos.keys()]);

  let comprometido = 0;
  for (const categoriaId of categorias) {
    comprometido += Math.max(orcamentos.get(categoriaId) ?? 0, gastos.get(categoriaId) ?? 0);
  }

  return receita - comprometido;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run`
Expected: PASS — toda a suíte, 72 testes.

- [ ] **Step 5: Commit**

```bash
git add src/dominio/agregacao.ts src/dominio/agregacao.test.ts
git commit -m "feat(dominio): agregação mensal e fórmula da sobra"
```

---

### Task 7: Pendência de reembolso e partição de estorno

Fecha a seção 6 do spec. A Task 6 sabe somar créditos; falta saber **quanto ainda está pendente** e, no estorno de um parcelamento, **quais parcelas são canceladas e quais viram crédito**.

**Files:**
- Create: `src/dominio/reembolso.ts`
- Test: `src/dominio/reembolso.test.ts`

**Interfaces:**
- Consumes: `Competencia` de `./data`, `Centavos` de `./dinheiro`.
- Produces:
  - `interface Recebimento { valorCentavos: Centavos }`
  - `recebido(recebimentos: Recebimento[]): Centavos`
  - `pendente(alvoCentavos: Centavos, recebimentos: Recebimento[]): Centavos`
  - `validarRecebimento(valorCentavos, alvoCentavos, recebimentos): void` — lança em valor inválido
  - `type StatusFaturaParcela = 'ABERTA' | 'FECHADA' | 'PAGA'`
  - `interface ParcelaEstornavel { id: string; competencia: Competencia; valorCentavos: Centavos; statusFatura: StatusFaturaParcela }`
  - `type ModoCredito = 'UNICO' | 'POR_FATURA'`
  - `interface PlanoEstorno { canceladas: string[]; creditos: Array<{ transactionId: string; valorCentavos: Centavos; competenciaCredito: Competencia }> }`
  - `planejarEstorno(parcelas, modo, competenciaDoCredito): PlanoEstorno`

Regra do spec, seção 6.2: parcela em fatura `ABERTA` é cancelada; em fatura `FECHADA` ou `PAGA` vira crédito. `modo = 'UNICO'` põe todos os créditos em `competenciaDoCredito`; `'POR_FATURA'` deixa cada um na competência da sua parcela.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/dominio/reembolso.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  type ParcelaEstornavel,
  pendente,
  planejarEstorno,
  recebido,
  validarRecebimento,
} from './reembolso';

describe('recebido e pendente', () => {
  it('sem recebimentos, o pendente é o alvo inteiro', () => {
    expect(recebido([])).toBe(0);
    expect(pendente(30000, [])).toBe(30000);
  });

  it('soma recebimentos parciais sucessivos', () => {
    const recebimentos = [{ valorCentavos: 10000 }, { valorCentavos: 5000 }];
    expect(recebido(recebimentos)).toBe(15000);
    expect(pendente(30000, recebimentos)).toBe(15000);
  });

  it('zera o pendente quando o alvo é atingido', () => {
    expect(pendente(30000, [{ valorCentavos: 30000 }])).toBe(0);
  });

  it('alvo zero significa não reembolsável', () => {
    expect(pendente(0, [])).toBe(0);
  });
});

describe('validarRecebimento', () => {
  it('aceita valor dentro do pendente', () => {
    expect(() => validarRecebimento(10000, 30000, [])).not.toThrow();
    expect(() => validarRecebimento(30000, 30000, [])).not.toThrow();
  });

  it('rejeita valor zero ou negativo', () => {
    expect(() => validarRecebimento(0, 30000, [])).toThrow();
    expect(() => validarRecebimento(-100, 30000, [])).toThrow();
  });

  it('rejeita valor acima do pendente', () => {
    expect(() => validarRecebimento(30001, 30000, [])).toThrow();
    expect(() =>
      validarRecebimento(20001, 30000, [{ valorCentavos: 10000 }]),
    ).toThrow();
  });

  it('rejeita valor não inteiro', () => {
    expect(() => validarRecebimento(100.5, 30000, [])).toThrow();
  });
});

// TV de R$2.000 em 10x de R$200, competências set/2026 a jun/2027.
// As três primeiras já foram cobradas; o resto está em faturas abertas.
const PARCELAS: ParcelaEstornavel[] = [
  { id: 'p1', competencia: '2026-09', valorCentavos: 20000, statusFatura: 'PAGA' },
  { id: 'p2', competencia: '2026-10', valorCentavos: 20000, statusFatura: 'PAGA' },
  { id: 'p3', competencia: '2026-11', valorCentavos: 20000, statusFatura: 'FECHADA' },
  { id: 'p4', competencia: '2026-12', valorCentavos: 20000, statusFatura: 'ABERTA' },
  { id: 'p5', competencia: '2027-01', valorCentavos: 20000, statusFatura: 'ABERTA' },
];

describe('planejarEstorno', () => {
  it('cancela as parcelas de faturas abertas', () => {
    const plano = planejarEstorno(PARCELAS, 'UNICO', '2026-11');
    expect(plano.canceladas).toEqual(['p4', 'p5']);
  });

  it('credita as parcelas já cobradas', () => {
    const plano = planejarEstorno(PARCELAS, 'UNICO', '2026-11');
    expect(plano.creditos.map((c) => c.transactionId)).toEqual(['p1', 'p2', 'p3']);
    const total = plano.creditos.reduce((a, c) => a + c.valorCentavos, 0);
    expect(total).toBe(60000);
  });

  it('modo UNICO põe todos os créditos na mesma competência', () => {
    const plano = planejarEstorno(PARCELAS, 'UNICO', '2026-11');
    expect(plano.creditos.map((c) => c.competenciaCredito)).toEqual([
      '2026-11', '2026-11', '2026-11',
    ]);
  });

  it('modo POR_FATURA deixa cada crédito na competência da sua parcela', () => {
    const plano = planejarEstorno(PARCELAS, 'POR_FATURA', '2026-11');
    expect(plano.creditos.map((c) => c.competenciaCredito)).toEqual([
      '2026-09', '2026-10', '2026-11',
    ]);
  });

  it('parcelamento inteiro ainda não cobrado só gera cancelamentos', () => {
    const futuras: ParcelaEstornavel[] = [
      { id: 'f1', competencia: '2026-12', valorCentavos: 20000, statusFatura: 'ABERTA' },
      { id: 'f2', competencia: '2027-01', valorCentavos: 20000, statusFatura: 'ABERTA' },
    ];
    const plano = planejarEstorno(futuras, 'UNICO', '2026-12');
    expect(plano.canceladas).toEqual(['f1', 'f2']);
    expect(plano.creditos).toEqual([]);
  });

  it('compra à vista já cobrada gera um crédito e nenhum cancelamento', () => {
    const avista: ParcelaEstornavel[] = [
      { id: 'a1', competencia: '2026-09', valorCentavos: 8000, statusFatura: 'PAGA' },
    ];
    const plano = planejarEstorno(avista, 'POR_FATURA', '2026-09');
    expect(plano.canceladas).toEqual([]);
    expect(plano.creditos).toEqual([
      { transactionId: 'a1', valorCentavos: 8000, competenciaCredito: '2026-09' },
    ]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/dominio/reembolso.test.ts`
Expected: FAIL — `Failed to resolve import "./reembolso"`

- [ ] **Step 3: Implementar `src/dominio/reembolso.ts`**

```ts
/**
 * Pendência de reembolso e planejamento de estorno (spec, seção 6).
 *
 * O reembolso não é um interruptor: é um alvo menos o que já foi recebido. O
 * estado (pendente, parcial, quitado) é sempre DERIVADO, nunca armazenado.
 */

import type { Competencia } from './data';
import type { Centavos } from './dinheiro';

export interface Recebimento {
  valorCentavos: Centavos;
}

export function recebido(recebimentos: Recebimento[]): Centavos {
  return recebimentos.reduce((total, r) => total + r.valorCentavos, 0);
}

export function pendente(alvoCentavos: Centavos, recebimentos: Recebimento[]): Centavos {
  return alvoCentavos - recebido(recebimentos);
}

export function validarRecebimento(
  valorCentavos: Centavos,
  alvoCentavos: Centavos,
  recebimentos: Recebimento[],
): void {
  if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) {
    throw new Error(`Recebimento deve ser inteiro positivo em centavos: ${valorCentavos}`);
  }
  const restante = pendente(alvoCentavos, recebimentos);
  if (valorCentavos > restante) {
    throw new Error(`Recebimento de ${valorCentavos} excede o pendente de ${restante}`);
  }
}

export type StatusFaturaParcela = 'ABERTA' | 'FECHADA' | 'PAGA';

export interface ParcelaEstornavel {
  id: string;
  competencia: Competencia;
  valorCentavos: Centavos;
  statusFatura: StatusFaturaParcela;
}

/** Como a operadora devolveu: tudo numa fatura só, ou parcela a parcela. */
export type ModoCredito = 'UNICO' | 'POR_FATURA';

export interface PlanoEstorno {
  /** Ids das parcelas que viram CANCELADA — nunca chegaram a ser cobradas. */
  canceladas: string[];
  creditos: Array<{
    transactionId: string;
    valorCentavos: Centavos;
    competenciaCredito: Competencia;
  }>;
}

/**
 * O que decide o tratamento de cada parcela não é a operadora, é se aquele
 * dinheiro já foi cobrado. A operadora só decide ONDE os créditos aparecem.
 */
export function planejarEstorno(
  parcelas: ParcelaEstornavel[],
  modo: ModoCredito,
  competenciaDoCredito: Competencia,
): PlanoEstorno {
  const plano: PlanoEstorno = { canceladas: [], creditos: [] };

  for (const parcela of parcelas) {
    if (parcela.statusFatura === 'ABERTA') {
      plano.canceladas.push(parcela.id);
      continue;
    }
    plano.creditos.push({
      transactionId: parcela.id,
      valorCentavos: parcela.valorCentavos,
      competenciaCredito: modo === 'UNICO' ? competenciaDoCredito : parcela.competencia,
    });
  }

  return plano;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run`
Expected: PASS — toda a suíte, 87 testes.

- [ ] **Step 5: Commit**

```bash
git add src/dominio/reembolso.ts src/dominio/reembolso.test.ts
git commit -m "feat(dominio): pendência de reembolso e planejamento de estorno"
```

---

### Task 8: Schema Prisma e banco Postgres

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/dados/prisma.ts`
- Modify: `.env.example`, `.gitignore`
- Test: `src/dados/prisma.test.ts`

**Interfaces:**
- Consumes: nada do domínio — o schema é a materialização da seção 3 do spec.
- Produces: cliente Prisma exportado como `prisma` de `@/dados/prisma`; todos os modelos da seção 3 do spec.

- [ ] **Step 1: Criar o banco no Neon**

Acesse `https://neon.tech`, crie uma conta gratuita e um projeto chamado `controlefinanceiro`. Copie a connection string (formato `postgresql://usuario:senha@host/banco?sslmode=require`).

Crie o arquivo `.env` na raiz (ele já está coberto pelo `.gitignore`):

```
DATABASE_URL="postgresql://...cole aqui..."
```

E registre o formato em `.env.example`, que **vai** para o git:

```
DATABASE_URL="postgresql://usuario:senha@host/banco?sslmode=require"
AUTH_SECRET=""
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""
EMAIL_AUTORIZADO=""
```

- [ ] **Step 2: Instalar o Prisma**

```bash
npm install -D prisma
npm install @prisma/client
```

- [ ] **Step 3: Escrever `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Auth.js ────────────────────────────────────────────────────────────────

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  accounts      Account[]
  sessions      Session[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

// ─── Domínio ────────────────────────────────────────────────────────────────

enum TipoTransacao {
  DESPESA
  RECEITA
}

enum MetodoPagamento {
  CREDITO
  DEBITO
  PIX
  DINHEIRO
  BOLETO
}

enum StatusTransacao {
  ATIVA
  CANCELADA
}

enum StatusFatura {
  ABERTA
  FECHADA
  PAGA
}

enum OrigemCredito {
  REEMBOLSO
  ESTORNO
}

model BudgetCategory {
  id          String              @id @default(cuid())
  nome        String              @unique
  ordem       Int
  /// 1..6 — slot da paleta categórica. Ver spec, seção 9.
  corSlot     Int
  arquivada   Boolean             @default(false)
  subcategorias Subcategory[]
  alocacoes   BudgetAllocation[]
  transacoes  Transaction[]
  recorrentes RecurringExpense[]
}

model Subcategory {
  id               String          @id @default(cuid())
  budgetCategoryId String
  nome             String
  arquivada        Boolean         @default(false)
  budgetCategory   BudgetCategory  @relation(fields: [budgetCategoryId], references: [id])
  transacoes       Transaction[]
  recorrentes      RecurringExpense[]

  @@unique([budgetCategoryId, nome])
}

model BudgetAllocation {
  id               String         @id @default(cuid())
  budgetCategoryId String
  /// "YYYY-MM"
  vigenteDe        String
  valorCentavos    Int
  budgetCategory   BudgetCategory @relation(fields: [budgetCategoryId], references: [id])

  @@unique([budgetCategoryId, vigenteDe])
}

model Card {
  id             String    @id @default(cuid())
  nome           String    @unique
  diaFechamento  Int
  diaVencimento  Int
  ativo          Boolean   @default(true)
  faturas        Invoice[]
  transacoes     Transaction[]
  recorrentes    RecurringExpense[]
}

model Invoice {
  id             String        @id @default(cuid())
  cardId         String
  /// "YYYY-MM" — mês do vencimento
  competencia    String
  /// "YYYY-MM-DD"
  dataFechamento String
  /// "YYYY-MM-DD"
  dataVencimento String
  status         StatusFatura  @default(ABERTA)
  /// "YYYY-MM-DD"
  pagaEm         String?
  card           Card          @relation(fields: [cardId], references: [id])
  transacoes     Transaction[]

  @@unique([cardId, competencia])
}

model Transaction {
  id                    String           @id @default(cuid())
  tipo                  TipoTransacao
  descricao             String
  valorCentavos         Int
  /// "YYYY-MM-DD" — data civil de São Paulo, nunca DateTime
  data                  String
  metodo                MetodoPagamento
  cardId                String?
  invoiceId             String?
  budgetCategoryId      String?
  subcategoryId         String?
  /// "YYYY-MM" — carimbada na gravação, nunca recalculada sozinha
  competencia           String
  status                StatusTransacao  @default(ATIVA)
  /// 0 = não é reembolsável
  reembolsoAlvoCentavos Int              @default(0)
  grupoParcelamentoId   String?
  parcelaNum            Int              @default(1)
  parcelaTotal          Int              @default(1)
  recorrenciaId         String?

  card             Card?             @relation(fields: [cardId], references: [id])
  invoice          Invoice?          @relation(fields: [invoiceId], references: [id])
  budgetCategory   BudgetCategory?   @relation(fields: [budgetCategoryId], references: [id])
  subcategory      Subcategory?      @relation(fields: [subcategoryId], references: [id])
  recorrencia      RecurringExpense? @relation(fields: [recorrenciaId], references: [id])
  creditos         Credito[]

  @@unique([recorrenciaId, competencia])
  @@index([competencia])
  @@index([grupoParcelamentoId])
}

model Credito {
  id                 String        @id @default(cuid())
  transactionId      String
  valorCentavos      Int
  /// "YYYY-MM-DD"
  recebidoEm         String
  /// "YYYY-MM" — competência em que o crédito é contabilizado
  competenciaCredito String
  origem             OrigemCredito
  transaction        Transaction   @relation(fields: [transactionId], references: [id])

  @@index([competenciaCredito])
}

model ExpectedIncome {
  id            String @id @default(cuid())
  /// "YYYY-MM"
  competencia   String
  descricao     String
  valorCentavos Int

  @@index([competencia])
}

model RecurringExpense {
  id               String          @id @default(cuid())
  descricao        String
  valorCentavos    Int
  diaDoMes         Int
  budgetCategoryId String
  subcategoryId    String
  metodo           MetodoPagamento
  cardId           String?
  /// "YYYY-MM"
  inicio           String
  /// "YYYY-MM"
  fim              String?
  ativa            Boolean         @default(true)

  budgetCategory BudgetCategory @relation(fields: [budgetCategoryId], references: [id])
  subcategory    Subcategory    @relation(fields: [subcategoryId], references: [id])
  card           Card?          @relation(fields: [cardId], references: [id])
  transacoes     Transaction[]
}
```

- [ ] **Step 4: Rodar a migração**

```bash
npx prisma migrate dev --name inicial
```

Expected: cria `prisma/migrations/<timestamp>_inicial/` e aplica no Neon sem erro.

- [ ] **Step 5: Criar o cliente Prisma singleton**

Crie `src/dados/prisma.ts`. O singleton evita esgotar o pool de conexões durante o hot reload do Next em desenvolvimento:

```ts
import { PrismaClient } from '@prisma/client';

const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalParaPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalParaPrisma.prisma = prisma;
}
```

- [ ] **Step 6: Escrever o teste de conexão**

Crie `src/dados/prisma.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { prisma } from './prisma';

describe('conexão com o banco', () => {
  it('responde a uma consulta trivial', async () => {
    const resultado = await prisma.$queryRaw`SELECT 1 AS um`;
    expect(resultado).toEqual([{ um: 1 }]);
  });

  it('tem as tabelas do domínio criadas', async () => {
    // Asserta que a tabela existe e responde — não que está vazia, senão o
    // teste passa a depender da ordem de execução.
    await expect(prisma.budgetCategory.count()).resolves.toBeTypeOf('number');
    await expect(prisma.transaction.count()).resolves.toBeTypeOf('number');
    await expect(prisma.credito.count()).resolves.toBeTypeOf('number');
  });
});
```

- [ ] **Step 7: Fazer o Vitest carregar o `.env`**

Modifique `vitest.config.ts` para que o `DATABASE_URL` chegue aos testes:

```ts
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    env: loadEnv(mode, process.cwd(), ''),
  },
}));
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `npx vitest run`
Expected: PASS — toda a suíte, incluindo os 2 testes novos de banco.

- [ ] **Step 9: Commit**

```bash
git add prisma src/dados vitest.config.ts .env.example
git commit -m "feat(dados): schema Prisma completo e conexão com Postgres"
```

---

### Task 9: Login com Google e guarda de usuário único

**Files:**
- Create: `src/auth.ts`, `src/middleware.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/app/login/page.tsx`
- Modify: `src/app/page.tsx`
- Test: `src/auth.test.ts`

**Interfaces:**
- Consumes: `prisma` de `@/dados/prisma`.
- Produces: `auth`, `handlers`, `signIn`, `signOut` de `@/auth`; `emailAutorizado(email, autorizado)` de `@/auth` — função pura, testável sem rede.

O app tem um usuário só. Não existe cadastro: uma variável de ambiente define o e-mail autorizado e qualquer outra conta é rejeitada no callback de login.

- [ ] **Step 1: Instalar Auth.js e o adaptador Prisma**

```bash
npm install next-auth@beta @auth/prisma-adapter
```

- [ ] **Step 2: Gerar o segredo de sessão**

```bash
npx auth secret
```

Isso escreve `AUTH_SECRET` no `.env`. Confirme que apareceu.

- [ ] **Step 3: Criar as credenciais OAuth no Google**

1. Acesse `https://console.cloud.google.com/apis/credentials`
2. Crie um projeto (ou use um existente)
3. **Create Credentials → OAuth client ID → Web application**
4. Em *Authorized redirect URIs*, adicione `http://localhost:3000/api/auth/callback/google`
5. Copie o Client ID e o Client Secret para o `.env`:

```
AUTH_GOOGLE_ID="...apps.googleusercontent.com"
AUTH_GOOGLE_SECRET="..."
EMAIL_AUTORIZADO="seu-email@gmail.com"
```

- [ ] **Step 4: Escrever o teste da guarda de e-mail**

Crie `src/auth.test.ts`. Testamos a função pura, não o fluxo OAuth — o valor está na regra, e ela precisa ser inequívoca:

```ts
import { describe, expect, it } from 'vitest';
import { emailAutorizado } from './auth';

describe('emailAutorizado', () => {
  it('aceita o e-mail configurado', () => {
    expect(emailAutorizado('gabriel@exemplo.com', 'gabriel@exemplo.com')).toBe(true);
  });

  it('ignora diferença de maiúsculas e espaços em volta', () => {
    expect(emailAutorizado(' Gabriel@Exemplo.com ', 'gabriel@exemplo.com')).toBe(true);
  });

  it('recusa qualquer outro e-mail', () => {
    expect(emailAutorizado('estranho@exemplo.com', 'gabriel@exemplo.com')).toBe(false);
  });

  it('recusa quando o e-mail vem vazio ou nulo', () => {
    expect(emailAutorizado(null, 'gabriel@exemplo.com')).toBe(false);
    expect(emailAutorizado(undefined, 'gabriel@exemplo.com')).toBe(false);
    expect(emailAutorizado('', 'gabriel@exemplo.com')).toBe(false);
  });

  it('recusa tudo quando não há e-mail autorizado configurado', () => {
    // Sem essa regra, um deploy sem a variável liberaria o app para qualquer um.
    expect(emailAutorizado('qualquer@exemplo.com', undefined)).toBe(false);
    expect(emailAutorizado('qualquer@exemplo.com', '')).toBe(false);
  });
});
```

- [ ] **Step 5: Rodar e confirmar que falha**

Run: `npx vitest run src/auth.test.ts`
Expected: FAIL — `Failed to resolve import "./auth"`

- [ ] **Step 6: Implementar `src/auth.ts`**

```ts
import { PrismaAdapter } from '@auth/prisma-adapter';
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

import { prisma } from '@/dados/prisma';

/**
 * O app tem um usuário só. Não existe cadastro: só o e-mail configurado entra.
 * Sem `autorizado` definido, ninguém entra — um deploy que esqueceu a variável
 * deve ficar trancado, não aberto.
 */
export function emailAutorizado(
  email: string | null | undefined,
  autorizado: string | undefined,
): boolean {
  if (!email || !autorizado) return false;
  return email.trim().toLowerCase() === autorizado.trim().toLowerCase();
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    signIn({ profile }) {
      return emailAutorizado(profile?.email, process.env.EMAIL_AUTORIZADO);
    },
  },
});
```

- [ ] **Step 7: Rodar e confirmar que passa**

Run: `npx vitest run src/auth.test.ts`
Expected: PASS — 5 testes.

- [ ] **Step 8: Criar a rota de autenticação**

Crie `src/app/api/auth/[...nextauth]/route.ts`:

```ts
export { GET, POST } from '@/auth';
```

- [ ] **Step 9: Criar o middleware que protege todas as rotas**

Crie `src/middleware.ts`:

```ts
export { auth as middleware } from '@/auth';

export const config = {
  // Protege tudo, menos os arquivos internos do Next, a própria rota de auth,
  // e os estáticos do PWA.
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.json).*)'],
};
```

- [ ] **Step 10: Criar a página de login**

Crie `src/app/login/page.tsx`:

```tsx
import { signIn } from '@/auth';

export default function Login() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh' }}>
      <form
        action={async () => {
          'use server';
          await signIn('google', { redirectTo: '/' });
        }}
      >
        <button type="submit">Entrar com Google</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 11: Mostrar o usuário logado na página inicial**

Substitua o conteúdo de `src/app/page.tsx`:

```tsx
import { auth, signOut } from '@/auth';

export default async function Painel() {
  const sessao = await auth();

  return (
    <main style={{ padding: 24 }}>
      <h1>Controle Financeiro</h1>
      <p>Logado como {sessao?.user?.email}</p>
      <form
        action={async () => {
          'use server';
          await signOut({ redirectTo: '/login' });
        }}
      >
        <button type="submit">Sair</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 12: Verificar o fluxo completo no navegador**

Run: `npm run dev`

Confira, nesta ordem:
1. Abrir `http://localhost:3000` redireciona para `/login`.
2. "Entrar com Google" leva ao consentimento do Google.
3. Entrar com o e-mail de `EMAIL_AUTORIZADO` volta para `/` mostrando o e-mail.
4. Recarregar mantém a sessão.
5. "Sair" volta para `/login`.
6. Entrar com **outra** conta Google é recusado — confirma que a guarda funciona.

O passo 6 é o que realmente importa. Se qualquer conta entrar, o app está aberto para a internet inteira.

- [ ] **Step 13: Rodar a suíte inteira**

Run: `npx vitest run`
Expected: PASS — todos os testes de todas as tarefas.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat(auth): login Google com guarda de usuário único"
```

---

## Ao terminar

Este plano entrega um app que sobe, exige login, e carrega todo o domínio financeiro testado. Ainda não há tela de lançamento nem consulta ao banco a partir da interface — isso é o Plano 2.

Antes de começar o Plano 2, confirme:

- [ ] `npx vitest run` passa inteiro
- [ ] Uma conta Google não autorizada é recusada no login
- [ ] `prisma/migrations/` está commitado
- [ ] `.env` **não** está commitado, e `.env.example` está
