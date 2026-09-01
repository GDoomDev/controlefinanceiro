# Lançamentos e Cartões — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poder registrar uma despesa de verdade no app — incluindo compra parcelada no crédito, que se distribui sozinha pelas faturas certas — e ver o que foi registrado.

**Architecture:** Três camadas com fronteiras rígidas, continuando o Plano 1. `src/dominio/` ganha um planejador puro (`planejarLancamento`) que decide, sem tocar em banco, em que competência e fatura cada parcela cai. `src/dados/` traduz linhas do Prisma para os tipos do domínio e persiste o que o planejador decidiu. `src/app/` são as telas. O planejador roda tanto no servidor (na gravação) quanto no navegador (no rodapé ao vivo do formulário) — é a mesma função, então a prévia nunca diverge do que é gravado.

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions), TypeScript strict, Vitest, Prisma 6.19.3, Postgres (Neon).

**Spec:** `docs/superpowers/specs/2026-08-31-controle-financeiro-design.md`
**Plano anterior:** `docs/superpowers/plans/2026-08-31-fundacao-e-dominio.md` (completo, mergeado)

## Global Constraints

- **Dinheiro é sempre inteiro em centavos.** Nenhum ponto flutuante representa valor monetário. `R$ 20,00` é `2000`.
- **Fuso fixo `America/Sao_Paulo`** em todo cálculo que converte instante em data ou mês.
- **Competência é sempre a string `"YYYY-MM"`.** Data civil é sempre a string `"YYYY-MM-DD"`. Nunca `Date` no banco nem no domínio.
- **`src/dominio/` não importa Prisma, React, Next nem nada de I/O.** Só TypeScript puro.
- **`src/dados/` não contém regra de negócio.** Toda aritmética de dinheiro, data e competência vem de `src/dominio/`. Se você está prestes a escrever um `+` sobre centavos ou um cálculo de mês dentro de `src/dados/`, pare — a função já existe no domínio.
- **A competência é carimbada na gravação e nunca recalculada sozinha.**
- **Toda função de escrita em `src/dados/` aceita um cliente Prisma opcional** (`cliente: ClientePrisma = prisma`), para poder participar de uma transação maior. É isso que torna a criação das parcelas atômica e os testes reversíveis.
- **Testes de `src/dados/` rodam dentro de uma transação com rollback.** Nunca truncar tabelas, nunca apagar dados por fora do próprio teste — o banco de desenvolvimento é o banco real do usuário.
- **TypeScript em modo `strict`.** Sem `any` implícito.
- **Prisma fixado em `6.19.3`** (sem `^`). Não atualize; se algum comando falhar por versão, pare e reporte em vez de migrar de major.
- Toda tarefa termina com testes passando e um commit.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/dominio/lancamento.ts` | **Novo.** Planejador puro: dado um lançamento e a regra do cartão, devolve as parcelas com competência e fatura. Nenhum I/O. |
| `src/dados/rollback.ts` | **Novo.** Helper de teste: roda um corpo dentro de uma transação e desfaz tudo ao final. |
| `src/dados/tipos.ts` | **Novo.** O tipo `ClientePrisma` compartilhado por toda a camada de dados. |
| `src/dados/categorias.ts` | **Novo.** CRUD de orçamentos e subcategorias. |
| `src/dados/cartoes.ts` | **Novo.** CRUD de cartões e a tradução para `RegraCartao` do domínio. |
| `src/dados/faturas.ts` | **Novo.** Encontrar-ou-criar fatura, fechar, pagar, totalizar. |
| `src/dados/lancamentos.ts` | **Novo.** Criar (com parcelamento atômico), listar, apagar. |
| `src/app/(app)/layout.tsx` | **Novo.** Casca com navegação, compartilhada por todas as telas autenticadas. |
| `src/app/(app)/ajustes/page.tsx` | **Novo.** Cadastro de orçamentos, subcategorias e cartões. |
| `src/app/(app)/lancamentos/novo/page.tsx` | **Novo.** Formulário de lançamento. |
| `src/app/(app)/lancamentos/formulario.tsx` | **Novo.** Client Component do formulário, com o rodapé ao vivo. |
| `src/app/(app)/lancamentos/page.tsx` | **Novo.** Lista de lançamentos por competência. |
| `src/app/(app)/cartoes/page.tsx` | **Novo.** Cartões e suas faturas, com fechar e pagar. |

**Fora do escopo deste plano:** o Painel com orçamentos e a sobra do mês, a aba de Áreas, a de Fluxo, reembolsos e estorno na interface, despesas recorrentes, e o PWA. Tudo isso é Plano 3. O rodapé do formulário mostra competência e fatura, mas **ainda não** mostra "sobram R$260 em Alimentação" — isso depende dos orçamentos, que só existem no Plano 3.

---

### Task 1: Planejador de lançamento (domínio puro)

O coração deste plano. Decide, sem tocar em banco, em quantas parcelas um lançamento se divide, quanto vale cada uma, em que competência cai e em que fatura entra. Roda no servidor e no navegador.

**Files:**
- Create: `src/dominio/lancamento.ts`
- Test: `src/dominio/lancamento.test.ts`

**Interfaces:**
- Consumes, de `./data`: `type Competencia`, `type DataCivil`, `competenciaDe(d: DataCivil): Competencia`.
- Consumes, de `./dinheiro`: `type Centavos`, `dividirParcelas(total: Centavos, quantidade: number): Centavos[]`.
- Consumes, de `./fatura`: `type Fatura` (`{ competencia: Competencia; fechamento: DataCivil; vencimento: DataCivil }`), `type RegraCartao` (`{ diaFechamento: number; diaVencimento: number }`), `faturasDasParcelas(compra: DataCivil, regra: RegraCartao, quantidade: number): Fatura[]`.
- Produces:
  - `type MetodoPagamento = 'CREDITO' | 'DEBITO' | 'PIX' | 'DINHEIRO' | 'BOLETO'`
  - `interface EntradaLancamento { valorCentavos: Centavos; data: DataCivil; metodo: MetodoPagamento; parcelas: number }`
  - `interface ParcelaPlanejada { parcelaNum: number; parcelaTotal: number; valorCentavos: Centavos; competencia: Competencia; fatura: Fatura | null }`
  - `planejarLancamento(entrada: EntradaLancamento, regra: RegraCartao | null): ParcelaPlanejada[]`

Regras:
- Método diferente de crédito → uma única parcela, competência é o mês da data, `fatura` é `null`.
- Método crédito → uma parcela por fatura de `faturasDasParcelas`, valores de `dividirParcelas`.
- Crédito sem `regra` → erro. Parcelamento (`parcelas > 1`) em método que não é crédito → erro.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/dominio/lancamento.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { type EntradaLancamento, planejarLancamento } from './lancamento';

const FECHA_25_VENCE_5 = { diaFechamento: 25, diaVencimento: 5 };

const entrada = (over: Partial<EntradaLancamento> = {}): EntradaLancamento => ({
  valorCentavos: 20000,
  data: { ano: 2026, mes: 8, dia: 20 },
  metodo: 'PIX',
  parcelas: 1,
  ...over,
});

describe('planejarLancamento — métodos à vista', () => {
  it('pix cai no mês da própria data, sem fatura', () => {
    const plano = planejarLancamento(entrada({ metodo: 'PIX' }), null);
    expect(plano).toEqual([
      {
        parcelaNum: 1,
        parcelaTotal: 1,
        valorCentavos: 20000,
        competencia: '2026-08',
        fatura: null,
      },
    ]);
  });

  it('débito, dinheiro e boleto seguem a mesma regra do pix', () => {
    for (const metodo of ['DEBITO', 'DINHEIRO', 'BOLETO'] as const) {
      const plano = planejarLancamento(entrada({ metodo }), null);
      expect(plano).toHaveLength(1);
      expect(plano[0].competencia).toBe('2026-08');
      expect(plano[0].fatura).toBeNull();
    }
  });

  it('ignora a regra do cartão quando o método não é crédito', () => {
    const plano = planejarLancamento(entrada({ metodo: 'PIX' }), FECHA_25_VENCE_5);
    expect(plano[0].competencia).toBe('2026-08');
    expect(plano[0].fatura).toBeNull();
  });
});

describe('planejarLancamento — crédito', () => {
  it('à vista no crédito usa a competência da fatura, não a da compra', () => {
    const plano = planejarLancamento(
      entrada({ metodo: 'CREDITO' }),
      FECHA_25_VENCE_5,
    );
    expect(plano).toHaveLength(1);
    // Compra em 20/ago, fatura fecha 25/ago e vence 05/set.
    expect(plano[0].competencia).toBe('2026-09');
    expect(plano[0].fatura?.vencimento).toEqual({ ano: 2026, mes: 9, dia: 5 });
  });

  it('distribui as parcelas em competências consecutivas', () => {
    const plano = planejarLancamento(
      entrada({ metodo: 'CREDITO', valorCentavos: 200000, parcelas: 10 }),
      FECHA_25_VENCE_5,
    );
    expect(plano.map((p) => p.competencia)).toEqual([
      '2026-09', '2026-10', '2026-11', '2026-12',
      '2027-01', '2027-02', '2027-03', '2027-04',
      '2027-05', '2027-06',
    ]);
  });

  it('numera as parcelas de 1 a N', () => {
    const plano = planejarLancamento(
      entrada({ metodo: 'CREDITO', valorCentavos: 200000, parcelas: 10 }),
      FECHA_25_VENCE_5,
    );
    expect(plano.map((p) => p.parcelaNum)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(plano.every((p) => p.parcelaTotal === 10)).toBe(true);
  });

  it('as parcelas somam exatamente o valor total', () => {
    const plano = planejarLancamento(
      entrada({ metodo: 'CREDITO', valorCentavos: 10005, parcelas: 10 }),
      FECHA_25_VENCE_5,
    );
    const soma = plano.reduce((a, p) => a + p.valorCentavos, 0);
    expect(soma).toBe(10005);
    // O resto de centavos vai para a primeira parcela.
    expect(plano[0].valorCentavos).toBe(1005);
    expect(plano[1].valorCentavos).toBe(1000);
  });

  it('cada parcela carrega a fatura da sua própria competência', () => {
    const plano = planejarLancamento(
      entrada({ metodo: 'CREDITO', valorCentavos: 60000, parcelas: 3 }),
      FECHA_25_VENCE_5,
    );
    expect(plano[0].fatura?.competencia).toBe('2026-09');
    expect(plano[2].fatura?.competencia).toBe('2026-11');
    expect(plano[2].fatura?.vencimento).toEqual({ ano: 2026, mes: 11, dia: 5 });
  });
});

describe('planejarLancamento — validação', () => {
  it('rejeita crédito sem regra de cartão', () => {
    expect(() => planejarLancamento(entrada({ metodo: 'CREDITO' }), null)).toThrow();
  });

  it('rejeita parcelamento fora do crédito', () => {
    expect(() =>
      planejarLancamento(entrada({ metodo: 'PIX', parcelas: 3 }), null),
    ).toThrow();
  });

  it('rejeita quantidade de parcelas menor que 1', () => {
    expect(() =>
      planejarLancamento(
        entrada({ metodo: 'CREDITO', parcelas: 0 }),
        FECHA_25_VENCE_5,
      ),
    ).toThrow();
  });

  it('rejeita valor negativo', () => {
    expect(() =>
      planejarLancamento(entrada({ valorCentavos: -100 }), null),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/dominio/lancamento.test.ts`
Expected: FAIL — `Failed to resolve import "./lancamento"`

- [ ] **Step 3: Implementar `src/dominio/lancamento.ts`**

```ts
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
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/dominio/lancamento.test.ts`
Expected: PASS — 11 testes.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npx vitest run`
Expected: PASS — nenhuma regressão nos testes do Plano 1.

- [ ] **Step 6: Commit**

```bash
git add src/dominio/lancamento.ts src/dominio/lancamento.test.ts
git commit -m "feat(dominio): planejador de lançamento com parcelamento"
```

---

### Task 2: Infraestrutura da camada de dados

Dois arquivos pequenos que todas as tarefas seguintes usam: o tipo do cliente Prisma (que permite participar de transações) e o helper que torna os testes de banco reversíveis.

**Files:**
- Create: `src/dados/tipos.ts`
- Create: `src/dados/rollback.ts`
- Test: `src/dados/rollback.test.ts`

**Interfaces:**
- Consumes: `prisma` de `@/dados/prisma`.
- Produces:
  - `type ClientePrisma` — aceita tanto o `PrismaClient` normal quanto o cliente de dentro de uma transação.
  - `comRollback(corpo: (tx: ClientePrisma) => Promise<void>): Promise<void>` — roda `corpo` numa transação e desfaz tudo ao final, mesmo em caso de sucesso.

**Por que o rollback importa:** o banco de desenvolvimento é o banco real do usuário, com os dados financeiros dele. Testes que truncam tabelas destruiriam dados de verdade. Com rollback, o teste escreve, verifica, e o banco volta exatamente ao estado anterior.

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/dados/rollback.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { prisma } from './prisma';
import { comRollback } from './rollback';

describe('comRollback', () => {
  it('desfaz o que foi escrito dentro do corpo', async () => {
    const nome = `teste-rollback-${Date.now()}`;

    await comRollback(async (tx) => {
      await tx.budgetCategory.create({
        data: { nome, ordem: 999, corSlot: 1 },
      });
      // Dentro da transação, a linha existe.
      const dentro = await tx.budgetCategory.findUnique({ where: { nome } });
      expect(dentro).not.toBeNull();
    });

    // Depois do rollback, não existe mais.
    const depois = await prisma.budgetCategory.findUnique({ where: { nome } });
    expect(depois).toBeNull();
  });

  it('propaga o erro quando o corpo falha, e ainda assim desfaz', async () => {
    const nome = `teste-rollback-erro-${Date.now()}`;

    await expect(
      comRollback(async (tx) => {
        await tx.budgetCategory.create({
          data: { nome, ordem: 998, corSlot: 1 },
        });
        throw new Error('falha proposital');
      }),
    ).rejects.toThrow('falha proposital');

    const depois = await prisma.budgetCategory.findUnique({ where: { nome } });
    expect(depois).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/dados/rollback.test.ts`
Expected: FAIL — `Failed to resolve import "./rollback"`

- [ ] **Step 3: Criar `src/dados/tipos.ts`**

```ts
import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Aceita tanto o cliente normal quanto o cliente de dentro de uma transação.
 * Toda função de escrita da camada de dados recebe isto, para poder participar
 * de uma transação maior (ex.: gravar as 10 parcelas de uma compra de uma vez).
 */
export type ClientePrisma = PrismaClient | Prisma.TransactionClient;
```

- [ ] **Step 4: Criar `src/dados/rollback.ts`**

```ts
import { prisma } from './prisma';
import type { ClientePrisma } from './tipos';

/** Erro-sentinela: existe só para forçar o rollback, nunca escapa. */
class Rollback extends Error {
  constructor() {
    super('rollback');
    this.name = 'Rollback';
  }
}

/**
 * Roda `corpo` dentro de uma transação e desfaz tudo ao final, mesmo quando o
 * corpo termina bem. Serve para testes escreverem no banco real sem sujá-lo.
 *
 * Se o corpo lançar um erro próprio, esse erro é propagado (e o rollback
 * acontece de qualquer forma).
 */
export async function comRollback(
  corpo: (tx: ClientePrisma) => Promise<void>,
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await corpo(tx);
      throw new Rollback();
    });
  } catch (erro) {
    if (erro instanceof Rollback) return;
    throw erro;
  }
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/dados/rollback.test.ts`
Expected: PASS — 2 testes.

- [ ] **Step 6: Commit**

```bash
git add src/dados/tipos.ts src/dados/rollback.ts src/dados/rollback.test.ts
git commit -m "feat(dados): cliente transacional e helper de rollback para testes"
```

---

### Task 3: Cadastro de orçamentos e subcategorias

**Files:**
- Create: `src/dados/categorias.ts`
- Test: `src/dados/categorias.test.ts`

**Interfaces:**
- Consumes: `prisma` de `./prisma`, `type ClientePrisma` de `./tipos`, `comRollback` de `./rollback` (só no teste).
- Produces:
  - `interface CategoriaComSubs { id: string; nome: string; ordem: number; corSlot: number; arquivada: boolean; subcategorias: Array<{ id: string; nome: string; arquivada: boolean }> }`
  - `listarCategorias(cliente?: ClientePrisma): Promise<CategoriaComSubs[]>`
  - `criarCategoria(dados: { nome: string; corSlot: number }, cliente?: ClientePrisma): Promise<{ id: string }>`
  - `criarSubcategoria(dados: { budgetCategoryId: string; nome: string }, cliente?: ClientePrisma): Promise<{ id: string }>`
  - `arquivarCategoria(id: string, cliente?: ClientePrisma): Promise<void>`

Regras: `corSlot` vai de 1 a 6 (o spec, seção 9, só valida seis cores para daltonismo). `ordem` é atribuída automaticamente como a próxima disponível. Listagem traz só não-arquivadas, ordenadas por `ordem`.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/dados/categorias.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  arquivarCategoria,
  criarCategoria,
  criarSubcategoria,
  listarCategorias,
} from './categorias';
import { comRollback } from './rollback';

describe('criarCategoria', () => {
  it('cria e aparece na listagem', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
      const lista = await listarCategorias(tx);
      const criada = lista.find((c) => c.id === id);
      expect(criada?.nome).toBe('Alimentação');
      expect(criada?.corSlot).toBe(2);
      expect(criada?.subcategorias).toEqual([]);
    });
  });

  it('atribui ordem crescente automaticamente', async () => {
    await comRollback(async (tx) => {
      const a = await criarCategoria({ nome: 'Primeira', corSlot: 1 }, tx);
      const b = await criarCategoria({ nome: 'Segunda', corSlot: 2 }, tx);
      const lista = await listarCategorias(tx);
      const ordemA = lista.find((c) => c.id === a.id)!.ordem;
      const ordemB = lista.find((c) => c.id === b.id)!.ordem;
      expect(ordemB).toBeGreaterThan(ordemA);
    });
  });

  it('rejeita corSlot fora de 1..6', async () => {
    await comRollback(async (tx) => {
      await expect(criarCategoria({ nome: 'X', corSlot: 0 }, tx)).rejects.toThrow();
      await expect(criarCategoria({ nome: 'Y', corSlot: 7 }, tx)).rejects.toThrow();
    });
  });

  it('rejeita nome vazio', async () => {
    await comRollback(async (tx) => {
      await expect(criarCategoria({ nome: '   ', corSlot: 1 }, tx)).rejects.toThrow();
    });
  });
});

describe('criarSubcategoria', () => {
  it('vincula a subcategoria ao orçamento pai', async () => {
    await comRollback(async (tx) => {
      const cat = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
      await criarSubcategoria({ budgetCategoryId: cat.id, nome: 'Delivery' }, tx);
      await criarSubcategoria({ budgetCategoryId: cat.id, nome: 'Mercado' }, tx);

      const lista = await listarCategorias(tx);
      const nomes = lista.find((c) => c.id === cat.id)!.subcategorias.map((s) => s.nome);
      expect(nomes).toEqual(['Delivery', 'Mercado']);
    });
  });

  it('rejeita subcategoria duplicada dentro do mesmo orçamento', async () => {
    await comRollback(async (tx) => {
      const cat = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
      await criarSubcategoria({ budgetCategoryId: cat.id, nome: 'Delivery' }, tx);
      await expect(
        criarSubcategoria({ budgetCategoryId: cat.id, nome: 'Delivery' }, tx),
      ).rejects.toThrow();
    });
  });
});

describe('arquivarCategoria', () => {
  it('some da listagem depois de arquivada', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarCategoria({ nome: 'Temporária', corSlot: 3 }, tx);
      await arquivarCategoria(id, tx);
      const lista = await listarCategorias(tx);
      expect(lista.find((c) => c.id === id)).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/dados/categorias.test.ts`
Expected: FAIL — `Failed to resolve import "./categorias"`

- [ ] **Step 3: Implementar `src/dados/categorias.ts`**

```ts
import { prisma } from './prisma';
import type { ClientePrisma } from './tipos';

export interface CategoriaComSubs {
  id: string;
  nome: string;
  ordem: number;
  corSlot: number;
  arquivada: boolean;
  subcategorias: Array<{ id: string; nome: string; arquivada: boolean }>;
}

/** O spec (seção 9) valida exatamente seis cores para daltonismo. */
const COR_SLOT_MIN = 1;
const COR_SLOT_MAX = 6;

function nomeLimpo(nome: string): string {
  const limpo = nome.trim();
  if (limpo.length === 0) {
    throw new Error('Nome não pode ser vazio');
  }
  return limpo;
}

export async function listarCategorias(
  cliente: ClientePrisma = prisma,
): Promise<CategoriaComSubs[]> {
  const linhas = await cliente.budgetCategory.findMany({
    where: { arquivada: false },
    orderBy: { ordem: 'asc' },
    include: {
      subcategorias: {
        where: { arquivada: false },
        orderBy: { nome: 'asc' },
      },
    },
  });

  return linhas.map((c) => ({
    id: c.id,
    nome: c.nome,
    ordem: c.ordem,
    corSlot: c.corSlot,
    arquivada: c.arquivada,
    subcategorias: c.subcategorias.map((s) => ({
      id: s.id,
      nome: s.nome,
      arquivada: s.arquivada,
    })),
  }));
}

export async function criarCategoria(
  dados: { nome: string; corSlot: number },
  cliente: ClientePrisma = prisma,
): Promise<{ id: string }> {
  const nome = nomeLimpo(dados.nome);

  if (
    !Number.isInteger(dados.corSlot) ||
    dados.corSlot < COR_SLOT_MIN ||
    dados.corSlot > COR_SLOT_MAX
  ) {
    throw new Error(
      `corSlot deve ser inteiro entre ${COR_SLOT_MIN} e ${COR_SLOT_MAX}: ${dados.corSlot}`,
    );
  }

  const ultima = await cliente.budgetCategory.findFirst({
    orderBy: { ordem: 'desc' },
    select: { ordem: true },
  });

  const criada = await cliente.budgetCategory.create({
    data: { nome, corSlot: dados.corSlot, ordem: (ultima?.ordem ?? 0) + 1 },
    select: { id: true },
  });

  return criada;
}

export async function criarSubcategoria(
  dados: { budgetCategoryId: string; nome: string },
  cliente: ClientePrisma = prisma,
): Promise<{ id: string }> {
  const nome = nomeLimpo(dados.nome);

  return cliente.subcategory.create({
    data: { budgetCategoryId: dados.budgetCategoryId, nome },
    select: { id: true },
  });
}

export async function arquivarCategoria(
  id: string,
  cliente: ClientePrisma = prisma,
): Promise<void> {
  await cliente.budgetCategory.update({
    where: { id },
    data: { arquivada: true },
  });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/dados/categorias.test.ts`
Expected: PASS — 7 testes.

- [ ] **Step 5: Commit**

```bash
git add src/dados/categorias.ts src/dados/categorias.test.ts
git commit -m "feat(dados): cadastro de orçamentos e subcategorias"
```

---

### Task 4: Cadastro de cartões

**Files:**
- Create: `src/dados/cartoes.ts`
- Test: `src/dados/cartoes.test.ts`

**Interfaces:**
- Consumes: `prisma` de `./prisma`, `type ClientePrisma` de `./tipos`, `type RegraCartao` de `@/dominio/fatura`.
- Produces:
  - `interface Cartao { id: string; nome: string; diaFechamento: number; diaVencimento: number; ativo: boolean }`
  - `listarCartoes(cliente?: ClientePrisma): Promise<Cartao[]>`
  - `buscarCartao(id: string, cliente?: ClientePrisma): Promise<Cartao | null>`
  - `criarCartao(dados: { nome: string; diaFechamento: number; diaVencimento: number }, cliente?: ClientePrisma): Promise<{ id: string }>`
  - `regraDoCartao(cartao: Cartao): RegraCartao` — tradução pura, sem I/O.

Regras: os dois dias vão de 1 a 31. `regraDoCartao` é a ponte entre a linha do banco e o tipo que o domínio espera — existe para que nenhum outro arquivo precise saber que `Card` e `RegraCartao` são coisas diferentes.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/dados/cartoes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buscarCartao, criarCartao, listarCartoes, regraDoCartao } from './cartoes';
import { comRollback } from './rollback';

describe('criarCartao', () => {
  it('cria e recupera pelo id', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarCartao(
        { nome: 'Nubank', diaFechamento: 25, diaVencimento: 5 },
        tx,
      );
      const cartao = await buscarCartao(id, tx);
      expect(cartao).toEqual({
        id,
        nome: 'Nubank',
        diaFechamento: 25,
        diaVencimento: 5,
        ativo: true,
      });
    });
  });

  it('aparece na listagem', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarCartao(
        { nome: 'Itaú', diaFechamento: 10, diaVencimento: 20 },
        tx,
      );
      const lista = await listarCartoes(tx);
      expect(lista.map((c) => c.id)).toContain(id);
    });
  });

  it('rejeita dias fora de 1..31', async () => {
    await comRollback(async (tx) => {
      await expect(
        criarCartao({ nome: 'A', diaFechamento: 0, diaVencimento: 5 }, tx),
      ).rejects.toThrow();
      await expect(
        criarCartao({ nome: 'B', diaFechamento: 25, diaVencimento: 32 }, tx),
      ).rejects.toThrow();
    });
  });

  it('rejeita nome vazio', async () => {
    await comRollback(async (tx) => {
      await expect(
        criarCartao({ nome: '  ', diaFechamento: 25, diaVencimento: 5 }, tx),
      ).rejects.toThrow();
    });
  });
});

describe('buscarCartao', () => {
  it('devolve null para id inexistente', async () => {
    await comRollback(async (tx) => {
      expect(await buscarCartao('nao-existe', tx)).toBeNull();
    });
  });
});

describe('regraDoCartao', () => {
  it('extrai apenas os dois dias que o domínio precisa', () => {
    const regra = regraDoCartao({
      id: 'x',
      nome: 'Nubank',
      diaFechamento: 25,
      diaVencimento: 5,
      ativo: true,
    });
    expect(regra).toEqual({ diaFechamento: 25, diaVencimento: 5 });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/dados/cartoes.test.ts`
Expected: FAIL — `Failed to resolve import "./cartoes"`

- [ ] **Step 3: Implementar `src/dados/cartoes.ts`**

```ts
import type { RegraCartao } from '@/dominio/fatura';

import { prisma } from './prisma';
import type { ClientePrisma } from './tipos';

export interface Cartao {
  id: string;
  nome: string;
  diaFechamento: number;
  diaVencimento: number;
  ativo: boolean;
}

function validarDia(rotulo: string, dia: number): void {
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
    throw new Error(`${rotulo} deve ser inteiro entre 1 e 31: ${dia}`);
  }
}

export async function listarCartoes(
  cliente: ClientePrisma = prisma,
): Promise<Cartao[]> {
  return cliente.card.findMany({
    where: { ativo: true },
    orderBy: { nome: 'asc' },
    select: {
      id: true,
      nome: true,
      diaFechamento: true,
      diaVencimento: true,
      ativo: true,
    },
  });
}

export async function buscarCartao(
  id: string,
  cliente: ClientePrisma = prisma,
): Promise<Cartao | null> {
  return cliente.card.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      diaFechamento: true,
      diaVencimento: true,
      ativo: true,
    },
  });
}

export async function criarCartao(
  dados: { nome: string; diaFechamento: number; diaVencimento: number },
  cliente: ClientePrisma = prisma,
): Promise<{ id: string }> {
  const nome = dados.nome.trim();
  if (nome.length === 0) {
    throw new Error('Nome do cartão não pode ser vazio');
  }
  validarDia('Dia de fechamento', dados.diaFechamento);
  validarDia('Dia de vencimento', dados.diaVencimento);

  return cliente.card.create({
    data: {
      nome,
      diaFechamento: dados.diaFechamento,
      diaVencimento: dados.diaVencimento,
    },
    select: { id: true },
  });
}

/** Ponte entre a linha do banco e o tipo que o domínio espera. Pura. */
export function regraDoCartao(cartao: Cartao): RegraCartao {
  return {
    diaFechamento: cartao.diaFechamento,
    diaVencimento: cartao.diaVencimento,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/dados/cartoes.test.ts`
Expected: PASS — 6 testes.

- [ ] **Step 5: Commit**

```bash
git add src/dados/cartoes.ts src/dados/cartoes.test.ts
git commit -m "feat(dados): cadastro de cartões e tradução para RegraCartao"
```

---

### Task 5: Faturas

**Files:**
- Create: `src/dados/faturas.ts`
- Test: `src/dados/faturas.test.ts`

**Interfaces:**
- Consumes: `prisma` de `./prisma`, `type ClientePrisma` de `./tipos`, `regraDoCartao`/`buscarCartao` de `./cartoes`, `faturaDaCompetencia`/`totalFatura` de `@/dominio/fatura`, `formatarDataCivil` de `@/dominio/data`.
- Produces:
  - `type StatusFatura = 'ABERTA' | 'FECHADA' | 'PAGA'`
  - `interface FaturaPersistida { id: string; cardId: string; competencia: string; dataFechamento: string; dataVencimento: string; status: StatusFatura; pagaEm: string | null }`
  - `garantirFatura(cardId: string, competencia: string, cliente?: ClientePrisma): Promise<FaturaPersistida>`
  - `listarFaturas(cardId: string, cliente?: ClientePrisma): Promise<FaturaPersistida[]>`
  - `fecharFatura(id: string, cliente?: ClientePrisma): Promise<void>`
  - `pagarFatura(id: string, pagaEm: string, cliente?: ClientePrisma): Promise<void>`
  - `totalDaFatura(id: string, cliente?: ClientePrisma): Promise<number>`

Regras (spec, seção 4):
- `garantirFatura` é idempotente: se já existe fatura daquele cartão naquela competência, devolve a existente; senão cria, calculando fechamento e vencimento com `faturaDaCompetencia` do domínio.
- A máquina de estados é `ABERTA → FECHADA → PAGA`, só para frente. Fechar uma fatura já fechada ou paga é erro; pagar uma aberta é erro.
- `totalDaFatura` soma as transações `ATIVA` e subtrai apenas os créditos de origem `ESTORNO` — reembolso não abate fatura, porque aquele dinheiro nunca passou pelo cartão. A conta em si é do domínio (`totalFatura`); aqui só buscamos as linhas.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/dados/faturas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { criarCartao } from './cartoes';
import {
  fecharFatura,
  garantirFatura,
  listarFaturas,
  pagarFatura,
  totalDaFatura,
} from './faturas';
import { comRollback } from './rollback';
import type { ClientePrisma } from './tipos';

async function cartaoDeTeste(tx: ClientePrisma) {
  return criarCartao({ nome: 'Nubank', diaFechamento: 25, diaVencimento: 5 }, tx);
}

describe('garantirFatura', () => {
  it('cria a fatura com as datas que o domínio calcula', async () => {
    await comRollback(async (tx) => {
      const cartao = await cartaoDeTeste(tx);
      const fatura = await garantirFatura(cartao.id, '2026-09', tx);

      expect(fatura.competencia).toBe('2026-09');
      // Fecha 25 e vence 5: a fatura que vence em 05/set fechou em 25/ago.
      expect(fatura.dataFechamento).toBe('2026-08-25');
      expect(fatura.dataVencimento).toBe('2026-09-05');
      expect(fatura.status).toBe('ABERTA');
      expect(fatura.pagaEm).toBeNull();
    });
  });

  it('é idempotente — chamar duas vezes devolve a mesma fatura', async () => {
    await comRollback(async (tx) => {
      const cartao = await cartaoDeTeste(tx);
      const primeira = await garantirFatura(cartao.id, '2026-09', tx);
      const segunda = await garantirFatura(cartao.id, '2026-09', tx);
      expect(segunda.id).toBe(primeira.id);

      const lista = await listarFaturas(cartao.id, tx);
      expect(lista).toHaveLength(1);
    });
  });

  it('cria faturas distintas para competências distintas', async () => {
    await comRollback(async (tx) => {
      const cartao = await cartaoDeTeste(tx);
      await garantirFatura(cartao.id, '2026-09', tx);
      await garantirFatura(cartao.id, '2026-10', tx);
      const lista = await listarFaturas(cartao.id, tx);
      expect(lista.map((f) => f.competencia).sort()).toEqual(['2026-09', '2026-10']);
    });
  });

  it('rejeita cartão inexistente', async () => {
    await comRollback(async (tx) => {
      await expect(garantirFatura('nao-existe', '2026-09', tx)).rejects.toThrow();
    });
  });
});

describe('máquina de estados da fatura', () => {
  it('fecha uma fatura aberta', async () => {
    await comRollback(async (tx) => {
      const cartao = await cartaoDeTeste(tx);
      const fatura = await garantirFatura(cartao.id, '2026-09', tx);
      await fecharFatura(fatura.id, tx);

      const [depois] = await listarFaturas(cartao.id, tx);
      expect(depois.status).toBe('FECHADA');
    });
  });

  it('paga uma fatura fechada e registra a data', async () => {
    await comRollback(async (tx) => {
      const cartao = await cartaoDeTeste(tx);
      const fatura = await garantirFatura(cartao.id, '2026-09', tx);
      await fecharFatura(fatura.id, tx);
      await pagarFatura(fatura.id, '2026-09-05', tx);

      const [depois] = await listarFaturas(cartao.id, tx);
      expect(depois.status).toBe('PAGA');
      expect(depois.pagaEm).toBe('2026-09-05');
    });
  });

  it('recusa pagar uma fatura ainda aberta', async () => {
    await comRollback(async (tx) => {
      const cartao = await cartaoDeTeste(tx);
      const fatura = await garantirFatura(cartao.id, '2026-09', tx);
      await expect(pagarFatura(fatura.id, '2026-09-05', tx)).rejects.toThrow();
    });
  });

  it('recusa fechar uma fatura já fechada', async () => {
    await comRollback(async (tx) => {
      const cartao = await cartaoDeTeste(tx);
      const fatura = await garantirFatura(cartao.id, '2026-09', tx);
      await fecharFatura(fatura.id, tx);
      await expect(fecharFatura(fatura.id, tx)).rejects.toThrow();
    });
  });

  it('recusa data de pagamento em formato inválido', async () => {
    await comRollback(async (tx) => {
      const cartao = await cartaoDeTeste(tx);
      const fatura = await garantirFatura(cartao.id, '2026-09', tx);
      await fecharFatura(fatura.id, tx);
      await expect(pagarFatura(fatura.id, '05/09/2026', tx)).rejects.toThrow();
    });
  });
});

describe('totalDaFatura', () => {
  it('é zero numa fatura sem lançamentos', async () => {
    await comRollback(async (tx) => {
      const cartao = await cartaoDeTeste(tx);
      const fatura = await garantirFatura(cartao.id, '2026-09', tx);
      expect(await totalDaFatura(fatura.id, tx)).toBe(0);
    });
  });

  it('soma as transações ativas e ignora as canceladas', async () => {
    await comRollback(async (tx) => {
      const cartao = await cartaoDeTeste(tx);
      const fatura = await garantirFatura(cartao.id, '2026-09', tx);

      await tx.transaction.create({
        data: {
          tipo: 'DESPESA',
          descricao: 'Ativa',
          valorCentavos: 30000,
          data: '2026-08-20',
          metodo: 'CREDITO',
          cardId: cartao.id,
          invoiceId: fatura.id,
          competencia: '2026-09',
          status: 'ATIVA',
        },
      });
      await tx.transaction.create({
        data: {
          tipo: 'DESPESA',
          descricao: 'Cancelada',
          valorCentavos: 50000,
          data: '2026-08-21',
          metodo: 'CREDITO',
          cardId: cartao.id,
          invoiceId: fatura.id,
          competencia: '2026-09',
          status: 'CANCELADA',
        },
      });

      expect(await totalDaFatura(fatura.id, tx)).toBe(30000);
    });
  });

  it('crédito de ESTORNO abate a fatura, mas o de REEMBOLSO não', async () => {
    await comRollback(async (tx) => {
      const cartao = await cartaoDeTeste(tx);
      const fatura = await garantirFatura(cartao.id, '2026-09', tx);

      const transacao = await tx.transaction.create({
        data: {
          tipo: 'DESPESA',
          descricao: 'Compra',
          valorCentavos: 100000,
          data: '2026-08-20',
          metodo: 'CREDITO',
          cardId: cartao.id,
          invoiceId: fatura.id,
          competencia: '2026-09',
          status: 'ATIVA',
        },
        select: { id: true },
      });

      await tx.credito.create({
        data: {
          transactionId: transacao.id,
          valorCentavos: 20000,
          recebidoEm: '2026-09-10',
          competenciaCredito: '2026-09',
          origem: 'ESTORNO',
        },
      });
      await tx.credito.create({
        data: {
          transactionId: transacao.id,
          valorCentavos: 30000,
          recebidoEm: '2026-09-11',
          competenciaCredito: '2026-09',
          origem: 'REEMBOLSO',
        },
      });

      // 100000 − 20000 (estorno) = 80000. O reembolso de 30000 não entra:
      // aquele dinheiro veio por fora do cartão.
      expect(await totalDaFatura(fatura.id, tx)).toBe(80000);
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/dados/faturas.test.ts`
Expected: FAIL — `Failed to resolve import "./faturas"`

- [ ] **Step 3: Implementar `src/dados/faturas.ts`**

```ts
import { type Competencia, formatarDataCivil } from '@/dominio/data';
import { faturaDaCompetencia, totalFatura } from '@/dominio/fatura';

import { buscarCartao, regraDoCartao } from './cartoes';
import { prisma } from './prisma';
import type { ClientePrisma } from './tipos';

export type StatusFatura = 'ABERTA' | 'FECHADA' | 'PAGA';

export interface FaturaPersistida {
  id: string;
  cardId: string;
  competencia: Competencia;
  /** "YYYY-MM-DD" */
  dataFechamento: string;
  /** "YYYY-MM-DD" */
  dataVencimento: string;
  status: StatusFatura;
  /** "YYYY-MM-DD" */
  pagaEm: string | null;
}

const CAMPOS = {
  id: true,
  cardId: true,
  competencia: true,
  dataFechamento: true,
  dataVencimento: true,
  status: true,
  pagaEm: true,
} as const;

function validarDataCivil(texto: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    throw new Error(`Data civil inválida, esperado "YYYY-MM-DD": ${texto}`);
  }
}

/**
 * Encontra a fatura daquele cartão naquela competência, ou cria com as datas
 * que o domínio calcula. Idempotente — chamar de novo devolve a mesma fatura.
 */
export async function garantirFatura(
  cardId: string,
  competencia: Competencia,
  cliente: ClientePrisma = prisma,
): Promise<FaturaPersistida> {
  const existente = await cliente.invoice.findUnique({
    where: { cardId_competencia: { cardId, competencia } },
    select: CAMPOS,
  });
  if (existente) return existente;

  const cartao = await buscarCartao(cardId, cliente);
  if (!cartao) {
    throw new Error(`Cartão não encontrado: ${cardId}`);
  }

  const calculada = faturaDaCompetencia(competencia, regraDoCartao(cartao));

  return cliente.invoice.create({
    data: {
      cardId,
      competencia,
      dataFechamento: formatarDataCivil(calculada.fechamento),
      dataVencimento: formatarDataCivil(calculada.vencimento),
    },
    select: CAMPOS,
  });
}

export async function listarFaturas(
  cardId: string,
  cliente: ClientePrisma = prisma,
): Promise<FaturaPersistida[]> {
  return cliente.invoice.findMany({
    where: { cardId },
    orderBy: { competencia: 'asc' },
    select: CAMPOS,
  });
}

async function statusAtual(
  id: string,
  cliente: ClientePrisma,
): Promise<StatusFatura> {
  const fatura = await cliente.invoice.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!fatura) {
    throw new Error(`Fatura não encontrada: ${id}`);
  }
  return fatura.status;
}

/** A máquina de estados só anda para frente: ABERTA → FECHADA → PAGA. */
export async function fecharFatura(
  id: string,
  cliente: ClientePrisma = prisma,
): Promise<void> {
  const status = await statusAtual(id, cliente);
  if (status !== 'ABERTA') {
    throw new Error(`Só é possível fechar uma fatura ABERTA; status atual: ${status}`);
  }
  await cliente.invoice.update({ where: { id }, data: { status: 'FECHADA' } });
}

export async function pagarFatura(
  id: string,
  pagaEm: string,
  cliente: ClientePrisma = prisma,
): Promise<void> {
  validarDataCivil(pagaEm);
  const status = await statusAtual(id, cliente);
  if (status !== 'FECHADA') {
    throw new Error(`Só é possível pagar uma fatura FECHADA; status atual: ${status}`);
  }
  await cliente.invoice.update({
    where: { id },
    data: { status: 'PAGA', pagaEm },
  });
}

/**
 * Total da fatura (spec, seção 4): transações ativas menos os créditos de
 * origem ESTORNO. Reembolso não abate — aquele dinheiro veio por fora do
 * cartão. A conta é do domínio; aqui só buscamos as linhas.
 */
export async function totalDaFatura(
  id: string,
  cliente: ClientePrisma = prisma,
): Promise<number> {
  const transacoes = await cliente.transaction.findMany({
    where: { invoiceId: id },
    select: { status: true, valorCentavos: true, creditos: true },
  });

  return totalFatura(
    transacoes.map((t) => ({
      ativa: t.status === 'ATIVA',
      valorCentavos: t.valorCentavos,
    })),
    // Os créditos já vêm restritos às transações desta fatura pelo `where`
    // acima, então basta achatá-los. Quem decide que ESTORNO abate e
    // REEMBOLSO não é o domínio, dentro de `totalFatura`.
    transacoes.flatMap((t) =>
      t.creditos.map((c) => ({ origem: c.origem, valorCentavos: c.valorCentavos })),
    ),
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/dados/faturas.test.ts`
Expected: PASS — 11 testes.

- [ ] **Step 5: Commit**

```bash
git add src/dados/faturas.ts src/dados/faturas.test.ts
git commit -m "feat(dados): faturas com fechamento, pagamento e total"
```

---

### Task 6: Lançamentos

A tarefa que amarra tudo: pega o plano do domínio, garante as faturas necessárias e grava todas as parcelas numa transação só.

**Files:**
- Create: `src/dados/lancamentos.ts`
- Test: `src/dados/lancamentos.test.ts`

**Interfaces:**
- Consumes: `prisma` de `./prisma`, `type ClientePrisma` de `./tipos`, `buscarCartao`/`regraDoCartao` de `./cartoes`, `garantirFatura` de `./faturas`, `planejarLancamento`/`type MetodoPagamento` de `@/dominio/lancamento`, `lerDataCivil`/`type Competencia` de `@/dominio/data`.
- Produces:
  - `interface NovoLancamento { descricao: string; valorCentavos: number; data: string; metodo: MetodoPagamento; cardId: string | null; budgetCategoryId: string; subcategoryId: string; parcelas: number; reembolsoAlvoCentavos: number }`
  - `interface LancamentoListado { id: string; descricao: string; valorCentavos: number; data: string; competencia: Competencia; metodo: MetodoPagamento; parcelaNum: number; parcelaTotal: number; grupoParcelamentoId: string | null; categoriaNome: string; subcategoriaNome: string; cartaoNome: string | null }`
  - `criarLancamento(entrada: NovoLancamento, cliente?: ClientePrisma): Promise<{ ids: string[] }>`
  - `listarLancamentos(competencia: Competencia, cliente?: ClientePrisma): Promise<LancamentoListado[]>`
  - `apagarLancamento(id: string, cliente?: ClientePrisma): Promise<void>`
  - `apagarGrupo(grupoParcelamentoId: string, cliente?: ClientePrisma): Promise<void>`

Regras:
- `data` entra como texto `"YYYY-MM-DD"` e é validada por `lerDataCivil`.
- Toda despesa exige categoria e subcategoria (spec, seção 3).
- Um parcelamento gera N linhas com o mesmo `grupoParcelamentoId` (um `crypto.randomUUID()`), gravadas **numa única transação** — as dez entram ou nenhuma entra.
- Quando `cliente` já é um cliente de transação, não abre outra: reaproveita. Isso é o que permite o teste rodar tudo dentro do rollback.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/dados/lancamentos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { criarCategoria, criarSubcategoria } from './categorias';
import { criarCartao } from './cartoes';
import { listarFaturas, totalDaFatura } from './faturas';
import {
  apagarGrupo,
  criarLancamento,
  listarLancamentos,
} from './lancamentos';
import { comRollback } from './rollback';
import type { ClientePrisma } from './tipos';

async function cenario(tx: ClientePrisma) {
  const categoria = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
  const subcategoria = await criarSubcategoria(
    { budgetCategoryId: categoria.id, nome: 'Delivery' },
    tx,
  );
  const cartao = await criarCartao(
    { nome: 'Nubank', diaFechamento: 25, diaVencimento: 5 },
    tx,
  );
  return { categoria, subcategoria, cartao };
}

describe('criarLancamento — à vista', () => {
  it('grava uma linha só, na competência da própria data', async () => {
    await comRollback(async (tx) => {
      const { categoria, subcategoria } = await cenario(tx);

      const { ids } = await criarLancamento(
        {
          descricao: 'iFood',
          valorCentavos: 2000,
          data: '2026-08-20',
          metodo: 'PIX',
          cardId: null,
          budgetCategoryId: categoria.id,
          subcategoryId: subcategoria.id,
          parcelas: 1,
          reembolsoAlvoCentavos: 0,
        },
        tx,
      );

      expect(ids).toHaveLength(1);
      const lista = await listarLancamentos('2026-08', tx);
      const criado = lista.find((l) => l.id === ids[0]);
      expect(criado?.descricao).toBe('iFood');
      expect(criado?.valorCentavos).toBe(2000);
      expect(criado?.categoriaNome).toBe('Alimentação');
      expect(criado?.subcategoriaNome).toBe('Delivery');
      expect(criado?.cartaoNome).toBeNull();
    });
  });
});

describe('criarLancamento — crédito parcelado', () => {
  it('gera uma linha por parcela, cada uma na sua competência', async () => {
    await comRollback(async (tx) => {
      const { categoria, subcategoria, cartao } = await cenario(tx);

      const { ids } = await criarLancamento(
        {
          descricao: 'TV',
          valorCentavos: 200000,
          data: '2026-08-20',
          metodo: 'CREDITO',
          cardId: cartao.id,
          budgetCategoryId: categoria.id,
          subcategoryId: subcategoria.id,
          parcelas: 10,
          reembolsoAlvoCentavos: 0,
        },
        tx,
      );

      expect(ids).toHaveLength(10);

      // A primeira parcela cai em setembro (compra 20/ago, fecha 25/ago, vence 05/set).
      const setembro = await listarLancamentos('2026-09', tx);
      const primeira = setembro.filter((l) => l.descricao === 'TV');
      expect(primeira).toHaveLength(1);
      expect(primeira[0].valorCentavos).toBe(20000);
      expect(primeira[0].parcelaNum).toBe(1);
      expect(primeira[0].parcelaTotal).toBe(10);

      // A última cai em junho de 2027.
      const junho = await listarLancamentos('2027-06', tx);
      expect(junho.filter((l) => l.descricao === 'TV')).toHaveLength(1);

      // E agosto (mês da compra) não tem nada — a competência é a da fatura.
      const agosto = await listarLancamentos('2026-08', tx);
      expect(agosto.filter((l) => l.descricao === 'TV')).toHaveLength(0);
    });
  });

  it('todas as parcelas compartilham o mesmo grupo', async () => {
    await comRollback(async (tx) => {
      const { categoria, subcategoria, cartao } = await cenario(tx);
      await criarLancamento(
        {
          descricao: 'TV',
          valorCentavos: 200000,
          data: '2026-08-20',
          metodo: 'CREDITO',
          cardId: cartao.id,
          budgetCategoryId: categoria.id,
          subcategoryId: subcategoria.id,
          parcelas: 10,
          reembolsoAlvoCentavos: 0,
        },
        tx,
      );

      const setembro = await listarLancamentos('2026-09', tx);
      const grupo = setembro.find((l) => l.descricao === 'TV')!.grupoParcelamentoId;
      expect(grupo).not.toBeNull();

      const outubro = await listarLancamentos('2026-10', tx);
      expect(outubro.find((l) => l.descricao === 'TV')!.grupoParcelamentoId).toBe(grupo);
    });
  });

  it('cria as faturas necessárias e vincula cada parcela à sua', async () => {
    await comRollback(async (tx) => {
      const { categoria, subcategoria, cartao } = await cenario(tx);
      await criarLancamento(
        {
          descricao: 'TV',
          valorCentavos: 60000,
          data: '2026-08-20',
          metodo: 'CREDITO',
          cardId: cartao.id,
          budgetCategoryId: categoria.id,
          subcategoryId: subcategoria.id,
          parcelas: 3,
          reembolsoAlvoCentavos: 0,
        },
        tx,
      );

      const faturas = await listarFaturas(cartao.id, tx);
      expect(faturas.map((f) => f.competencia)).toEqual([
        '2026-09',
        '2026-10',
        '2026-11',
      ]);

      // Cada fatura recebeu exatamente uma parcela de R$200.
      for (const fatura of faturas) {
        expect(await totalDaFatura(fatura.id, tx)).toBe(20000);
      }
    });
  });
});

describe('criarLancamento — validação', () => {
  it('rejeita crédito sem cartão', async () => {
    await comRollback(async (tx) => {
      const { categoria, subcategoria } = await cenario(tx);
      await expect(
        criarLancamento(
          {
            descricao: 'X',
            valorCentavos: 1000,
            data: '2026-08-20',
            metodo: 'CREDITO',
            cardId: null,
            budgetCategoryId: categoria.id,
            subcategoryId: subcategoria.id,
            parcelas: 1,
            reembolsoAlvoCentavos: 0,
          },
          tx,
        ),
      ).rejects.toThrow();
    });
  });

  it('rejeita data em formato inválido', async () => {
    await comRollback(async (tx) => {
      const { categoria, subcategoria } = await cenario(tx);
      await expect(
        criarLancamento(
          {
            descricao: 'X',
            valorCentavos: 1000,
            data: '20/08/2026',
            metodo: 'PIX',
            cardId: null,
            budgetCategoryId: categoria.id,
            subcategoryId: subcategoria.id,
            parcelas: 1,
            reembolsoAlvoCentavos: 0,
          },
          tx,
        ),
      ).rejects.toThrow();
    });
  });

  it('rejeita subcategoria que pertence a outro orçamento', async () => {
    await comRollback(async (tx) => {
      const { subcategoria } = await cenario(tx);
      // Um segundo orçamento, sem relação com a subcategoria "Delivery".
      const outro = await criarCategoria({ nome: 'Transporte', corSlot: 4 }, tx);

      await expect(
        criarLancamento(
          {
            descricao: 'Uber',
            valorCentavos: 1000,
            data: '2026-08-20',
            metodo: 'PIX',
            cardId: null,
            budgetCategoryId: outro.id,
            subcategoryId: subcategoria.id,
            parcelas: 1,
            reembolsoAlvoCentavos: 0,
          },
          tx,
        ),
      ).rejects.toThrow();
    });
  });

  it('rejeita alvo de reembolso maior que o valor', async () => {
    await comRollback(async (tx) => {
      const { categoria, subcategoria } = await cenario(tx);
      await expect(
        criarLancamento(
          {
            descricao: 'X',
            valorCentavos: 1000,
            data: '2026-08-20',
            metodo: 'PIX',
            cardId: null,
            budgetCategoryId: categoria.id,
            subcategoryId: subcategoria.id,
            parcelas: 1,
            reembolsoAlvoCentavos: 5000,
          },
          tx,
        ),
      ).rejects.toThrow();
    });
  });
});

describe('apagarGrupo', () => {
  it('apaga todas as parcelas de uma compra parcelada', async () => {
    await comRollback(async (tx) => {
      const { categoria, subcategoria, cartao } = await cenario(tx);
      await criarLancamento(
        {
          descricao: 'TV',
          valorCentavos: 60000,
          data: '2026-08-20',
          metodo: 'CREDITO',
          cardId: cartao.id,
          budgetCategoryId: categoria.id,
          subcategoryId: subcategoria.id,
          parcelas: 3,
          reembolsoAlvoCentavos: 0,
        },
        tx,
      );

      const setembro = await listarLancamentos('2026-09', tx);
      const grupo = setembro.find((l) => l.descricao === 'TV')!.grupoParcelamentoId!;

      await apagarGrupo(grupo, tx);

      for (const competencia of ['2026-09', '2026-10', '2026-11']) {
        const lista = await listarLancamentos(competencia, tx);
        expect(lista.filter((l) => l.descricao === 'TV')).toHaveLength(0);
      }
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/dados/lancamentos.test.ts`
Expected: FAIL — `Failed to resolve import "./lancamentos"`

- [ ] **Step 3: Implementar `src/dados/lancamentos.ts`**

```ts
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
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/dados/lancamentos.test.ts`
Expected: PASS — 9 testes.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npx vitest run`
Expected: PASS — nenhuma regressão.

- [ ] **Step 6: Commit**

```bash
git add src/dados/lancamentos.ts src/dados/lancamentos.test.ts
git commit -m "feat(dados): criação de lançamentos com parcelamento atômico"
```

---

### Task 7: Casca de navegação

**Files:**
- Create: `src/app/(app)/layout.tsx`
- Create: `src/app/(app)/navegacao.module.css`
- Modify: mover `src/app/page.tsx` para `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `auth`, `signOut` de `@/auth`.
- Produces: layout com navegação lateral (desktop) e inferior (celular), envolvendo todas as telas autenticadas.

O grupo de rotas `(app)` não aparece na URL — serve só para que todas as telas autenticadas compartilhem esta casca, sem envolver `/login`.

- [ ] **Step 1: Criar `src/app/(app)/navegacao.module.css`**

```css
.casca {
  display: grid;
  grid-template-columns: 200px 1fr;
  min-height: 100dvh;
}

.lateral {
  border-right: 1px solid #e5e7eb;
  padding: 20px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.marca {
  font-size: 14px;
  font-weight: 650;
  padding: 0 10px 14px;
}

.link {
  display: block;
  padding: 8px 10px;
  border-radius: 7px;
  font-size: 13px;
  color: #374151;
  text-decoration: none;
}

.link:hover {
  background: #f3f4f6;
}

.rodape {
  margin-top: auto;
  font-size: 11px;
  color: #9ca3af;
  padding: 0 10px;
}

.sair {
  background: none;
  border: none;
  padding: 0;
  font-size: 11px;
  color: #6b7280;
  cursor: pointer;
  text-decoration: underline;
}

.conteudo {
  padding: 24px 28px;
  max-width: 1100px;
}

@media (max-width: 720px) {
  .casca {
    grid-template-columns: 1fr;
  }

  .lateral {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    flex-direction: row;
    justify-content: space-around;
    border-right: none;
    border-top: 1px solid #e5e7eb;
    background: #fff;
    padding: 8px;
    z-index: 10;
  }

  .marca,
  .rodape {
    display: none;
  }

  .conteudo {
    padding: 16px 16px 76px;
  }
}
```

- [ ] **Step 2: Criar `src/app/(app)/layout.tsx`**

```tsx
import Link from 'next/link';

import { auth, signOut } from '@/auth';

import estilos from './navegacao.module.css';

const DESTINOS = [
  { href: '/', rotulo: 'Painel' },
  { href: '/lancamentos', rotulo: 'Lançamentos' },
  { href: '/cartoes', rotulo: 'Cartões' },
  { href: '/ajustes', rotulo: 'Ajustes' },
];

export default async function LayoutApp({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessao = await auth();

  return (
    <div className={estilos.casca}>
      <nav className={estilos.lateral}>
        <div className={estilos.marca}>Controle Financeiro</div>
        {DESTINOS.map((d) => (
          <Link key={d.href} href={d.href} className={estilos.link}>
            {d.rotulo}
          </Link>
        ))}
        <div className={estilos.rodape}>
          <div>{sessao?.user?.email}</div>
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/login' });
            }}
          >
            <button type="submit" className={estilos.sair}>
              Sair
            </button>
          </form>
        </div>
      </nav>
      <main className={estilos.conteudo}>{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Mover a página inicial para dentro do grupo**

```bash
git mv src/app/page.tsx "src/app/(app)/page.tsx"
```

- [ ] **Step 4: Simplificar `src/app/(app)/page.tsx`**

O botão "Sair" e o e-mail agora vivem no layout — a página não precisa repetir. Substitua o conteúdo por:

```tsx
export default function Painel() {
  return (
    <>
      <h1>Painel</h1>
      <p style={{ color: '#6b7280', fontSize: 14 }}>
        Orçamentos e sobra do mês chegam no Plano 3. Por enquanto, use{' '}
        <strong>Ajustes</strong> para cadastrar orçamentos e cartões, e{' '}
        <strong>Lançamentos</strong> para registrar despesas.
      </p>
    </>
  );
}
```

- [ ] **Step 5: Verificar no navegador**

Run: `npm run dev`

Confira: `http://localhost:3000` mostra a navegação lateral com os quatro destinos, o e-mail logado e o botão Sair no rodapé da lateral. Encerre com Ctrl+C.

**Se a porta 3000 estiver ocupada**, o Next sobe em 3001 e o login com Google falha com `redirect_uri_mismatch` — o Google só tem a 3000 cadastrada. Nesse caso, mate o processo antigo (`lsof -iTCP:3000 -sTCP:LISTEN -P` e `kill <pid>`) antes de continuar.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): casca de navegação para as telas autenticadas"
```

---

### Task 8: Tela de Ajustes (orçamentos e cartões)

Sem esta tela não dá para cadastrar nada, e sem cadastro não dá para lançar. É a primeira tela realmente útil.

**Files:**
- Create: `src/app/(app)/ajustes/page.tsx`
- Create: `src/app/(app)/ajustes/acoes.ts`
- Create: `src/app/(app)/ajustes/ajustes.module.css`

**Interfaces:**
- Consumes: `listarCategorias`, `criarCategoria`, `criarSubcategoria` de `@/dados/categorias`; `listarCartoes`, `criarCartao` de `@/dados/cartoes`.
- Produces: Server Actions `acaoCriarCategoria`, `acaoCriarSubcategoria`, `acaoCriarCartao`, todas revalidando `/ajustes`.

- [ ] **Step 1: Criar `src/app/(app)/ajustes/acoes.ts`**

```ts
'use server';

import { revalidatePath } from 'next/cache';

import { criarCategoria, criarSubcategoria } from '@/dados/categorias';
import { criarCartao } from '@/dados/cartoes';

export async function acaoCriarCategoria(dadosForm: FormData): Promise<void> {
  await criarCategoria({
    nome: String(dadosForm.get('nome') ?? ''),
    corSlot: Number(dadosForm.get('corSlot')),
  });
  revalidatePath('/ajustes');
}

export async function acaoCriarSubcategoria(dadosForm: FormData): Promise<void> {
  await criarSubcategoria({
    budgetCategoryId: String(dadosForm.get('budgetCategoryId') ?? ''),
    nome: String(dadosForm.get('nome') ?? ''),
  });
  revalidatePath('/ajustes');
}

export async function acaoCriarCartao(dadosForm: FormData): Promise<void> {
  await criarCartao({
    nome: String(dadosForm.get('nome') ?? ''),
    diaFechamento: Number(dadosForm.get('diaFechamento')),
    diaVencimento: Number(dadosForm.get('diaVencimento')),
  });
  revalidatePath('/ajustes');
}
```

- [ ] **Step 2: Criar `src/app/(app)/ajustes/ajustes.module.css`**

```css
.secao {
  margin-bottom: 36px;
}

.titulo {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 12px;
}

.linha {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.campo {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rotulo {
  font-size: 11px;
  color: #6b7280;
}

.entrada {
  border: 1px solid #d1d5db;
  border-radius: 7px;
  padding: 7px 9px;
  font-size: 13px;
  font-family: inherit;
}

.botao {
  background: #111827;
  color: #fff;
  border: none;
  border-radius: 7px;
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
}

.lista {
  border: 1px solid #e5e7eb;
  border-radius: 9px;
  overflow: hidden;
}

.item {
  padding: 10px 13px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 9px;
}

.item + .item {
  border-top: 1px solid #f3f4f6;
}

.cor {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex-shrink: 0;
}

.subs {
  color: #9ca3af;
  font-size: 12px;
}

.vazio {
  padding: 14px;
  font-size: 13px;
  color: #9ca3af;
}
```

- [ ] **Step 3: Criar `src/app/(app)/ajustes/page.tsx`**

As seis cores são exatamente as do spec, seção 9 — validadas para daltonismo, e por isso são exatamente seis.

```tsx
import { listarCategorias } from '@/dados/categorias';
import { listarCartoes } from '@/dados/cartoes';

import { acaoCriarCartao, acaoCriarCategoria, acaoCriarSubcategoria } from './acoes';
import estilos from './ajustes.module.css';

/** Paleta do spec, seção 9 — validada para daltonismo nos dois temas. */
const CORES = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
];

export default async function Ajustes() {
  const [categorias, cartoes] = await Promise.all([
    listarCategorias(),
    listarCartoes(),
  ]);

  return (
    <>
      <h1>Ajustes</h1>

      <section className={estilos.secao}>
        <div className={estilos.titulo}>Orçamentos</div>

        <form action={acaoCriarCategoria} className={estilos.linha}>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="cat-nome">
              Nome
            </label>
            <input
              id="cat-nome"
              name="nome"
              required
              className={estilos.entrada}
              placeholder="Alimentação"
            />
          </div>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="cat-cor">
              Cor
            </label>
            <select id="cat-cor" name="corSlot" className={estilos.entrada}>
              {CORES.map((cor, i) => (
                <option key={cor} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={estilos.botao}>
            Criar orçamento
          </button>
        </form>

        <div className={estilos.lista}>
          {categorias.length === 0 ? (
            <div className={estilos.vazio}>Nenhum orçamento cadastrado ainda.</div>
          ) : (
            categorias.map((c) => (
              <div key={c.id} className={estilos.item}>
                <span
                  className={estilos.cor}
                  style={{ background: CORES[c.corSlot - 1] }}
                />
                <strong>{c.nome}</strong>
                <span className={estilos.subs}>
                  {c.subcategorias.length === 0
                    ? 'sem subcategorias'
                    : c.subcategorias.map((s) => s.nome).join(' · ')}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className={estilos.secao}>
        <div className={estilos.titulo}>Subcategorias</div>
        {categorias.length === 0 ? (
          <div className={estilos.vazio}>Crie um orçamento primeiro.</div>
        ) : (
          <form action={acaoCriarSubcategoria} className={estilos.linha}>
            <div className={estilos.campo}>
              <label className={estilos.rotulo} htmlFor="sub-cat">
                Orçamento
              </label>
              <select
                id="sub-cat"
                name="budgetCategoryId"
                className={estilos.entrada}
              >
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className={estilos.campo}>
              <label className={estilos.rotulo} htmlFor="sub-nome">
                Nome
              </label>
              <input
                id="sub-nome"
                name="nome"
                required
                className={estilos.entrada}
                placeholder="Delivery"
              />
            </div>
            <button type="submit" className={estilos.botao}>
              Criar subcategoria
            </button>
          </form>
        )}
      </section>

      <section className={estilos.secao}>
        <div className={estilos.titulo}>Cartões</div>

        <form action={acaoCriarCartao} className={estilos.linha}>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="cartao-nome">
              Nome
            </label>
            <input
              id="cartao-nome"
              name="nome"
              required
              className={estilos.entrada}
              placeholder="Nubank"
            />
          </div>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="cartao-fecha">
              Fecha dia
            </label>
            <input
              id="cartao-fecha"
              name="diaFechamento"
              type="number"
              min={1}
              max={31}
              required
              className={estilos.entrada}
              style={{ width: 80 }}
            />
          </div>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="cartao-vence">
              Vence dia
            </label>
            <input
              id="cartao-vence"
              name="diaVencimento"
              type="number"
              min={1}
              max={31}
              required
              className={estilos.entrada}
              style={{ width: 80 }}
            />
          </div>
          <button type="submit" className={estilos.botao}>
            Criar cartão
          </button>
        </form>

        <div className={estilos.lista}>
          {cartoes.length === 0 ? (
            <div className={estilos.vazio}>Nenhum cartão cadastrado ainda.</div>
          ) : (
            cartoes.map((c) => (
              <div key={c.id} className={estilos.item}>
                <strong>{c.nome}</strong>
                <span className={estilos.subs}>
                  fecha dia {c.diaFechamento} · vence dia {c.diaVencimento}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}
```

- [ ] **Step 4: Verificar no navegador**

Run: `npm run dev`

Em `http://localhost:3000/ajustes`, confira nesta ordem:
1. Criar o orçamento "Alimentação" com a cor 2 — aparece na lista com o quadradinho laranja.
2. Criar a subcategoria "Delivery" dentro de Alimentação — aparece ao lado do nome do orçamento.
3. Criar o cartão "Nubank", fecha 25, vence 5 — aparece na lista.

Esses três cadastros são os que a Task 9 vai usar. Deixe-os criados.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): tela de ajustes com orçamentos, subcategorias e cartões"
```

---

### Task 9: Formulário de lançamento com rodapé ao vivo

A tela que será aberta mais vezes. O rodapé que se atualiza enquanto você digita é o que torna a regra de competência compreensível — sem ele, o dinheiro "some" de um mês e aparece em outro sem explicação.

**Files:**
- Create: `src/app/(app)/lancamentos/novo/page.tsx`
- Create: `src/app/(app)/lancamentos/formulario.tsx`
- Create: `src/app/(app)/lancamentos/formulario.module.css`
- Create: `src/app/(app)/lancamentos/acoes.ts`

**Interfaces:**
- Consumes: `listarCategorias` de `@/dados/categorias`; `listarCartoes` de `@/dados/cartoes`; `criarLancamento` de `@/dados/lancamentos`; `planejarLancamento` de `@/dominio/lancamento`; `formatarBRL`, `emCentavos` de `@/dominio/dinheiro`; `lerDataCivil`, `formatarDataCivil` de `@/dominio/data`.
- Produces: Server Action `acaoCriarLancamento(dadosForm: FormData): Promise<void>`.

O `formulario.tsx` é um Client Component. Ele importa `planejarLancamento` — a mesma função pura que o servidor usa para gravar. É por isso que o domínio não pode importar Prisma: se importasse, esse arquivo não poderia rodar no navegador.

- [ ] **Step 1: Criar `src/app/(app)/lancamentos/acoes.ts`**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { criarLancamento } from '@/dados/lancamentos';
import type { MetodoPagamento } from '@/dominio/lancamento';

export async function acaoCriarLancamento(dadosForm: FormData): Promise<void> {
  const metodo = String(dadosForm.get('metodo')) as MetodoPagamento;
  const cardId = String(dadosForm.get('cardId') ?? '');

  await criarLancamento({
    descricao: String(dadosForm.get('descricao') ?? ''),
    // O campo chega em centavos: o formulário converte antes de enviar.
    valorCentavos: Number(dadosForm.get('valorCentavos')),
    data: String(dadosForm.get('data') ?? ''),
    metodo,
    cardId: metodo === 'CREDITO' && cardId ? cardId : null,
    budgetCategoryId: String(dadosForm.get('budgetCategoryId') ?? ''),
    subcategoryId: String(dadosForm.get('subcategoryId') ?? ''),
    parcelas: Number(dadosForm.get('parcelas') ?? 1),
    reembolsoAlvoCentavos: dadosForm.get('reembolsavel')
      ? Number(dadosForm.get('valorCentavos'))
      : 0,
  });

  revalidatePath('/lancamentos');
  redirect('/lancamentos');
}
```

- [ ] **Step 2: Criar `src/app/(app)/lancamentos/formulario.module.css`**

```css
.form {
  max-width: 560px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.campo {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rotulo {
  font-size: 11px;
  color: #6b7280;
}

.entrada {
  border: 1px solid #d1d5db;
  border-radius: 7px;
  padding: 8px 10px;
  font-size: 14px;
  font-family: inherit;
  width: 100%;
}

.dupla {
  display: flex;
  gap: 10px;
}

.dupla > * {
  flex: 1;
}

.chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.chip {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 999px;
  padding: 6px 13px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
}

.chipAtivo {
  background: #111827;
  color: #fff;
  border-color: #111827;
}

.linhaCheck {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
}

.rodape {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 9px;
  padding: 12px 14px;
  font-size: 12.5px;
  line-height: 1.6;
  color: #374151;
}

.rodapeVazio {
  color: #9ca3af;
}

.erro {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 9px;
  padding: 10px 13px;
  font-size: 12.5px;
  color: #b91c1c;
}

.enviar {
  background: #111827;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 11px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.enviar:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 3: Criar `src/app/(app)/lancamentos/formulario.tsx`**

```tsx
'use client';

import { useMemo, useState } from 'react';

import { dataCivilEm, formatarDataCivil, lerDataCivil } from '@/dominio/data';
import { emCentavos, formatarBRL } from '@/dominio/dinheiro';
import { type MetodoPagamento, planejarLancamento } from '@/dominio/lancamento';

import { acaoCriarLancamento } from './acoes';
import estilos from './formulario.module.css';

export interface CategoriaOpcao {
  id: string;
  nome: string;
  subcategorias: Array<{ id: string; nome: string }>;
}

export interface CartaoOpcao {
  id: string;
  nome: string;
  diaFechamento: number;
  diaVencimento: number;
}

const METODOS: MetodoPagamento[] = [
  'CREDITO',
  'PIX',
  'DEBITO',
  'DINHEIRO',
  'BOLETO',
];

const ROTULO_METODO: Record<MetodoPagamento, string> = {
  CREDITO: 'Crédito',
  PIX: 'Pix',
  DEBITO: 'Débito',
  DINHEIRO: 'Dinheiro',
  BOLETO: 'Boleto',
};

/** Hoje em São Paulo, via domínio — não reimplemente o fuso aqui. */
function hojeEmTexto(): string {
  return formatarDataCivil(dataCivilEm(new Date()));
}

export function FormularioLancamento({
  categorias,
  cartoes,
}: {
  categorias: CategoriaOpcao[];
  cartoes: CartaoOpcao[];
}) {
  const [valorTexto, setValorTexto] = useState('');
  const [data, setData] = useState(hojeEmTexto());
  const [metodo, setMetodo] = useState<MetodoPagamento>('CREDITO');
  const [cardId, setCardId] = useState(cartoes[0]?.id ?? '');
  const [categoriaId, setCategoriaId] = useState(categorias[0]?.id ?? '');
  const [parcelas, setParcelas] = useState(1);

  const categoria = categorias.find((c) => c.id === categoriaId);
  const cartao = cartoes.find((c) => c.id === cardId);

  const valorCentavos = useMemo(() => {
    const numero = Number(valorTexto.replace(',', '.'));
    return Number.isFinite(numero) && numero > 0 ? emCentavos(numero) : 0;
  }, [valorTexto]);

  // A MESMA função pura que o servidor usa para gravar. É por isso que a
  // prévia nunca diverge do que é persistido.
  const previa = useMemo(() => {
    if (valorCentavos <= 0) return null;
    try {
      const regra = cartao
        ? { diaFechamento: cartao.diaFechamento, diaVencimento: cartao.diaVencimento }
        : null;
      return {
        plano: planejarLancamento(
          {
            valorCentavos,
            data: lerDataCivil(data),
            metodo,
            parcelas: metodo === 'CREDITO' ? parcelas : 1,
          },
          regra,
        ),
        erro: null as string | null,
      };
    } catch (e) {
      return { plano: null, erro: e instanceof Error ? e.message : 'Erro' };
    }
  }, [valorCentavos, data, metodo, parcelas, cartao]);

  const podeEnviar =
    valorCentavos > 0 &&
    categoria !== undefined &&
    previa?.plano != null &&
    (metodo !== 'CREDITO' || cartao !== undefined);

  return (
    <form action={acaoCriarLancamento} className={estilos.form}>
      <input type="hidden" name="valorCentavos" value={valorCentavos} />
      <input type="hidden" name="metodo" value={metodo} />
      <input type="hidden" name="cardId" value={metodo === 'CREDITO' ? cardId : ''} />
      <input
        type="hidden"
        name="parcelas"
        value={metodo === 'CREDITO' ? parcelas : 1}
      />

      <div className={estilos.dupla}>
        <div className={estilos.campo}>
          <label className={estilos.rotulo} htmlFor="valor">
            Valor (R$)
          </label>
          <input
            id="valor"
            className={estilos.entrada}
            inputMode="decimal"
            placeholder="20,00"
            value={valorTexto}
            onChange={(e) => setValorTexto(e.target.value)}
          />
        </div>
        <div className={estilos.campo}>
          <label className={estilos.rotulo} htmlFor="data">
            Data
          </label>
          <input
            id="data"
            name="data"
            type="date"
            className={estilos.entrada}
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </div>
      </div>

      <div className={estilos.campo}>
        <label className={estilos.rotulo} htmlFor="descricao">
          Descrição
        </label>
        <input
          id="descricao"
          name="descricao"
          required
          className={estilos.entrada}
          placeholder="iFood"
        />
      </div>

      <div className={estilos.dupla}>
        <div className={estilos.campo}>
          <label className={estilos.rotulo} htmlFor="categoria">
            Orçamento
          </label>
          <select
            id="categoria"
            name="budgetCategoryId"
            className={estilos.entrada}
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
          >
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className={estilos.campo}>
          <label className={estilos.rotulo} htmlFor="subcategoria">
            Subcategoria
          </label>
          <select
            id="subcategoria"
            name="subcategoryId"
            className={estilos.entrada}
          >
            {(categoria?.subcategorias ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={estilos.campo}>
        <span className={estilos.rotulo}>Método</span>
        <div className={estilos.chips}>
          {METODOS.map((m) => (
            <button
              key={m}
              type="button"
              className={`${estilos.chip} ${m === metodo ? estilos.chipAtivo : ''}`}
              onClick={() => {
                setMetodo(m);
                if (m !== 'CREDITO') setParcelas(1);
              }}
            >
              {ROTULO_METODO[m]}
            </button>
          ))}
        </div>
      </div>

      {metodo === 'CREDITO' && (
        <div className={estilos.dupla}>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="cartao">
              Cartão
            </label>
            <select
              id="cartao"
              className={estilos.entrada}
              value={cardId}
              onChange={(e) => setCardId(e.target.value)}
            >
              {cartoes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="parcelas">
              Parcelas
            </label>
            <input
              id="parcelas"
              type="number"
              min={1}
              max={24}
              className={estilos.entrada}
              value={parcelas}
              onChange={(e) => setParcelas(Math.max(1, Number(e.target.value)))}
            />
          </div>
        </div>
      )}

      <label className={estilos.linhaCheck}>
        <input type="checkbox" name="reembolsavel" value="1" />
        A reembolsar (alguém vai me pagar de volta)
      </label>

      {previa?.erro ? (
        <div className={estilos.erro}>{previa.erro}</div>
      ) : previa?.plano ? (
        <div className={estilos.rodape}>
          <Previa plano={previa.plano} cartaoNome={cartao?.nome ?? null} />
        </div>
      ) : (
        <div className={`${estilos.rodape} ${estilos.rodapeVazio}`}>
          Informe o valor para ver em que mês este lançamento cai.
        </div>
      )}

      <button type="submit" className={estilos.enviar} disabled={!podeEnviar}>
        Salvar lançamento
      </button>
    </form>
  );
}

function Previa({
  plano,
  cartaoNome,
}: {
  plano: ReturnType<typeof planejarLancamento>;
  cartaoNome: string | null;
}) {
  const primeira = plano[0];
  const ultima = plano[plano.length - 1];

  if (plano.length === 1) {
    return (
      <>
        Cai em <strong>{primeira.competencia}</strong>
        {primeira.fatura && cartaoNome ? (
          <>
            {' '}
            · fatura {cartaoNome}, fecha{' '}
            {formatarDataCivil(primeira.fatura.fechamento)} e vence{' '}
            {formatarDataCivil(primeira.fatura.vencimento)}
          </>
        ) : null}
      </>
    );
  }

  return (
    <>
      <strong>
        {plano.length}x de {formatarBRL(plano[1].valorCentavos)}
      </strong>
      {plano[0].valorCentavos !== plano[1].valorCentavos ? (
        <> (a primeira de {formatarBRL(plano[0].valorCentavos)})</>
      ) : null}
      , de <strong>{primeira.competencia}</strong> a{' '}
      <strong>{ultima.competencia}</strong>
      {cartaoNome ? <> · fatura {cartaoNome}</> : null}
    </>
  );
}
```

- [ ] **Step 4: Criar `src/app/(app)/lancamentos/novo/page.tsx`**

```tsx
import Link from 'next/link';

import { listarCategorias } from '@/dados/categorias';
import { listarCartoes } from '@/dados/cartoes';

import { FormularioLancamento } from '../formulario';

export default async function NovoLancamento() {
  const [categorias, cartoes] = await Promise.all([
    listarCategorias(),
    listarCartoes(),
  ]);

  if (categorias.length === 0) {
    return (
      <>
        <h1>Novo lançamento</h1>
        <p style={{ fontSize: 14, color: '#6b7280' }}>
          Cadastre pelo menos um orçamento com uma subcategoria em{' '}
          <Link href="/ajustes">Ajustes</Link> antes de lançar uma despesa.
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Novo lançamento</h1>
      <FormularioLancamento
        categorias={categorias.map((c) => ({
          id: c.id,
          nome: c.nome,
          subcategorias: c.subcategorias.map((s) => ({ id: s.id, nome: s.nome })),
        }))}
        cartoes={cartoes.map((c) => ({
          id: c.id,
          nome: c.nome,
          diaFechamento: c.diaFechamento,
          diaVencimento: c.diaVencimento,
        }))}
      />
    </>
  );
}
```

- [ ] **Step 5: Verificar no navegador**

Run: `npm run dev`

Em `http://localhost:3000/lancamentos/novo`, com o cartão Nubank (fecha 25, vence 5) cadastrado na Task 8:

1. Digite valor `20`, data `2026-08-20`, método **Crédito**, 1 parcela.
   O rodapé deve dizer: *Cai em **2026-09** · fatura Nubank, fecha 2026-08-25 e vence 2026-09-05*.
2. Mude a data para `2026-08-28` (depois do fechamento).
   O rodapé deve pular para **2026-10** — essa é a regra de competência funcionando à vista.
3. Volte para `2026-08-20`, mude para 10 parcelas e valor `2000`.
   O rodapé deve dizer *10x de R$ 200,00, de 2026-09 a 2027-06*.
4. Troque o método para **Pix**.
   O campo de parcelas some e o rodapé passa a dizer *Cai em 2026-08* — o mês da própria compra.
5. Salve um lançamento de teste e confirme que a navegação leva para `/lancamentos`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): formulário de lançamento com prévia de competência ao vivo"
```

---

### Task 10: Lista de lançamentos e tela de cartões

**Files:**
- Create: `src/app/(app)/lancamentos/page.tsx`
- Create: `src/app/(app)/lancamentos/lista.module.css`
- Create: `src/app/(app)/cartoes/page.tsx`
- Create: `src/app/(app)/cartoes/acoes.ts`

**Interfaces:**
- Consumes: `listarLancamentos`, `apagarGrupo`, `apagarLancamento` de `@/dados/lancamentos`; `listarCartoes` de `@/dados/cartoes`; `listarFaturas`, `totalDaFatura`, `fecharFatura`, `pagarFatura` de `@/dados/faturas`; `formatarBRL` de `@/dominio/dinheiro`; `competenciaDe`, `dataCivilEm`, `somarMeses` de `@/dominio/data`.
- Produces: Server Actions `acaoFecharFatura`, `acaoPagarFatura`, `acaoApagarLancamento`.

- [ ] **Step 1: Criar `src/app/(app)/lancamentos/lista.module.css`**

```css
.cabecalho {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.meses {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 13px;
}

.mesLink {
  color: #6b7280;
  text-decoration: none;
  padding: 4px 8px;
  border-radius: 6px;
}

.mesLink:hover {
  background: #f3f4f6;
}

.mesAtual {
  font-weight: 600;
  color: #111827;
}

.novo {
  background: #111827;
  color: #fff;
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 13px;
  text-decoration: none;
}

.tabela {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.tabela th {
  text-align: left;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #9ca3af;
  font-weight: 500;
  padding: 0 8px 8px;
  border-bottom: 1px solid #e5e7eb;
}

.tabela td {
  padding: 9px 8px;
  border-bottom: 1px solid #f3f4f6;
}

.valor {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.meta {
  color: #9ca3af;
  font-size: 11.5px;
}

.total {
  margin-top: 14px;
  font-size: 14px;
  text-align: right;
}

.vazio {
  padding: 28px 14px;
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
}

.apagar {
  background: none;
  border: none;
  color: #dc2626;
  font-size: 11px;
  cursor: pointer;
  padding: 2px 6px;
}
```

- [ ] **Step 2: Criar `src/app/(app)/lancamentos/page.tsx`**

```tsx
import Link from 'next/link';
import { revalidatePath } from 'next/cache';

import { competenciaDe, dataCivilEm, somarMeses } from '@/dominio/data';
import { formatarBRL } from '@/dominio/dinheiro';
import { apagarGrupo, apagarLancamento, listarLancamentos } from '@/dados/lancamentos';

import estilos from './lista.module.css';

export default async function Lancamentos({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const competencia = mes ?? competenciaDe(dataCivilEm(new Date()));

  const lancamentos = await listarLancamentos(competencia);
  const total = lancamentos.reduce((a, l) => a + l.valorCentavos, 0);

  async function acaoApagar(dadosForm: FormData) {
    'use server';
    const grupo = String(dadosForm.get('grupo') ?? '');
    const id = String(dadosForm.get('id') ?? '');
    if (grupo) {
      await apagarGrupo(grupo);
    } else {
      await apagarLancamento(id);
    }
    revalidatePath('/lancamentos');
  }

  return (
    <>
      <div className={estilos.cabecalho}>
        <h1 style={{ margin: 0 }}>Lançamentos</h1>
        <Link href="/lancamentos/novo" className={estilos.novo}>
          + Novo lançamento
        </Link>
      </div>

      <div className={estilos.meses}>
        <Link
          href={`/lancamentos?mes=${somarMeses(competencia, -1)}`}
          className={estilos.mesLink}
        >
          ‹ {somarMeses(competencia, -1)}
        </Link>
        <span className={estilos.mesAtual}>{competencia}</span>
        <Link
          href={`/lancamentos?mes=${somarMeses(competencia, 1)}`}
          className={estilos.mesLink}
        >
          {somarMeses(competencia, 1)} ›
        </Link>
      </div>

      {lancamentos.length === 0 ? (
        <div className={estilos.vazio}>
          Nenhum lançamento em {competencia}.
        </div>
      ) : (
        <>
          <table className={estilos.tabela}>
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Orçamento</th>
                <th>Método</th>
                <th className={estilos.valor}>Valor</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lancamentos.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.descricao}
                    {l.parcelaTotal > 1 ? (
                      <span className={estilos.meta}>
                        {' '}
                        {l.parcelaNum}/{l.parcelaTotal}
                      </span>
                    ) : null}
                    <div className={estilos.meta}>{l.data}</div>
                  </td>
                  <td>
                    {l.categoriaNome}
                    <div className={estilos.meta}>{l.subcategoriaNome}</div>
                  </td>
                  <td>
                    {l.metodo}
                    {l.cartaoNome ? (
                      <div className={estilos.meta}>{l.cartaoNome}</div>
                    ) : null}
                  </td>
                  <td className={estilos.valor}>{formatarBRL(l.valorCentavos)}</td>
                  <td>
                    <form action={acaoApagar}>
                      <input type="hidden" name="id" value={l.id} />
                      <input
                        type="hidden"
                        name="grupo"
                        value={l.grupoParcelamentoId ?? ''}
                      />
                      <button type="submit" className={estilos.apagar}>
                        {l.parcelaTotal > 1 ? 'apagar compra' : 'apagar'}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={estilos.total}>
            Total do mês: <strong>{formatarBRL(total)}</strong>
          </div>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 3: Criar `src/app/(app)/cartoes/acoes.ts`**

```ts
'use server';

import { revalidatePath } from 'next/cache';

import { fecharFatura, pagarFatura } from '@/dados/faturas';

export async function acaoFecharFatura(dadosForm: FormData): Promise<void> {
  await fecharFatura(String(dadosForm.get('id') ?? ''));
  revalidatePath('/cartoes');
}

export async function acaoPagarFatura(dadosForm: FormData): Promise<void> {
  await pagarFatura(
    String(dadosForm.get('id') ?? ''),
    String(dadosForm.get('pagaEm') ?? ''),
  );
  revalidatePath('/cartoes');
}
```

- [ ] **Step 4: Criar `src/app/(app)/cartoes/page.tsx`**

```tsx
import { listarCartoes } from '@/dados/cartoes';
import { listarFaturas, totalDaFatura } from '@/dados/faturas';
import { dataCivilEm, formatarDataCivil } from '@/dominio/data';
import { formatarBRL } from '@/dominio/dinheiro';

import { acaoFecharFatura, acaoPagarFatura } from './acoes';

export default async function Cartoes() {
  const cartoes = await listarCartoes();

  const comFaturas = await Promise.all(
    cartoes.map(async (cartao) => {
      const faturas = await listarFaturas(cartao.id);
      const comTotais = await Promise.all(
        faturas.map(async (f) => ({
          ...f,
          total: await totalDaFatura(f.id),
        })),
      );
      return { cartao, faturas: comTotais };
    }),
  );

  const hoje = formatarDataCivil(dataCivilEm(new Date()));

  return (
    <>
      <h1>Cartões</h1>

      {cartoes.length === 0 ? (
        <p style={{ fontSize: 14, color: '#6b7280' }}>
          Nenhum cartão cadastrado. Crie um em Ajustes.
        </p>
      ) : (
        comFaturas.map(({ cartao, faturas }) => (
          <section key={cartao.id} style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 15, marginBottom: 4 }}>{cartao.nome}</h2>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>
              fecha dia {cartao.diaFechamento} · vence dia {cartao.diaVencimento}
            </div>

            {faturas.length === 0 ? (
              <div style={{ fontSize: 13, color: '#9ca3af' }}>
                Nenhuma fatura ainda — ela nasce quando você lança a primeira
                compra neste cartão.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Competência', 'Vencimento', 'Status', 'Total', ''].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: h === 'Total' ? 'right' : 'left',
                          fontSize: 10,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          color: '#9ca3af',
                          fontWeight: 500,
                          padding: '0 8px 8px',
                          borderBottom: '1px solid #e5e7eb',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {faturas.map((f) => (
                    <tr key={f.id}>
                      <td style={{ padding: '9px 8px', borderBottom: '1px solid #f3f4f6' }}>
                        {f.competencia}
                      </td>
                      <td style={{ padding: '9px 8px', borderBottom: '1px solid #f3f4f6' }}>
                        {f.dataVencimento}
                      </td>
                      <td style={{ padding: '9px 8px', borderBottom: '1px solid #f3f4f6' }}>
                        {f.status}
                        {f.pagaEm ? (
                          <span style={{ color: '#9ca3af', fontSize: 11 }}>
                            {' '}
                            em {f.pagaEm}
                          </span>
                        ) : null}
                      </td>
                      <td
                        style={{
                          padding: '9px 8px',
                          borderBottom: '1px solid #f3f4f6',
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {formatarBRL(f.total)}
                      </td>
                      <td style={{ padding: '9px 8px', borderBottom: '1px solid #f3f4f6' }}>
                        {f.status === 'ABERTA' ? (
                          <form action={acaoFecharFatura}>
                            <input type="hidden" name="id" value={f.id} />
                            <button type="submit" style={{ fontSize: 11, cursor: 'pointer' }}>
                              fechar
                            </button>
                          </form>
                        ) : f.status === 'FECHADA' ? (
                          <form action={acaoPagarFatura}>
                            <input type="hidden" name="id" value={f.id} />
                            <input type="hidden" name="pagaEm" value={hoje} />
                            <button type="submit" style={{ fontSize: 11, cursor: 'pointer' }}>
                              marcar paga
                            </button>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))
      )}
    </>
  );
}
```

- [ ] **Step 5: Verificar no navegador**

Run: `npm run dev`

1. Em `/lancamentos`, confirme que o lançamento salvo na Task 9 aparece, com o total do mês no rodapé.
2. Navegue entre meses com as setas — a URL muda (`?mes=2026-09`) e a lista acompanha.
3. Lance uma compra parcelada em 3x no crédito e confirme que ela aparece em três meses consecutivos, marcada `1/3`, `2/3`, `3/3`.
4. Em `/cartoes`, confirme que as três faturas apareceram com os totais certos.
5. Feche a primeira fatura e depois marque como paga — o status deve andar `ABERTA → FECHADA → PAGA`, e o botão some ao final.
6. Volte em `/lancamentos`, ache uma parcela da compra parcelada e clique em "apagar compra" — as três parcelas devem sumir de uma vez.

- [ ] **Step 6: Rodar a suíte inteira e o build**

Run: `npx vitest run && npm run build`
Expected: todos os testes passam e o build compila sem erro de tipo.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): lista de lançamentos e tela de cartões com faturas"
```

---

## Ao terminar

Este plano entrega o ciclo completo de registro: cadastrar orçamentos, subcategorias e cartões; lançar uma despesa à vista ou parcelada; ver o que foi lançado por mês; e acompanhar as faturas dos cartões.

Antes de começar o Plano 3, confirme:

- [ ] `npx vitest run` passa inteiro
- [ ] `npm run build` compila sem erro
- [ ] Uma compra parcelada em 10x gera 10 linhas, uma por mês, e as faturas correspondentes
- [ ] Apagar uma parcela pelo botão "apagar compra" remove o parcelamento inteiro
- [ ] O rodapé do formulário muda de mês quando você move a data para depois do fechamento do cartão

**Fica para o Plano 3:** Painel com orçamentos e sobra do mês, aba de Áreas, aba de Fluxo, reembolsos e estorno na interface, despesas recorrentes, e o PWA.
