# Áreas e Fluxo — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir as duas telas analíticas que faltam — **Áreas** ("pra onde foi o dinheiro?", spec §8.2) e **Fluxo** ("e nos outros meses?", spec §8.3).

**Architecture:** Continua a separação em três camadas dos Planos 1–3. `src/dominio/` ganha dois módulos puros (`areas.ts` e `fluxo.ts`) e uma extensão de `agregacao.ts` para agregar por subcategoria. `src/dados/` ganha dois modelos de leitura que buscam as linhas e entregam ao domínio. `src/app/` ganha as rotas `/areas` e `/fluxo`, ambas Server Components sem JavaScript de cliente — filtro e navegação de mês são `searchParams`, como já acontece no Painel e em Orçamentos.

**Tech Stack:** Next.js 16 (App Router, Server Components), TypeScript strict, Prisma 6.19.3, Postgres (Neon), Vitest, CSS Modules.

## Global Constraints

- Dinheiro é sempre **inteiro em centavos**. Ponto flutuante não aparece em nenhum ponto do domínio como valor monetário.
- **Percentuais são exceção explícita:** são valores derivados só para desenhar (largura de barra, rótulo "12,4% do mês"). Nunca são usados para **ordenar** nem para **decidir um limiar** — ordenação e comparação usam sempre inteiros em centavos. Toda divisão tem guarda de denominador ≤ 0.
- Competência é sempre `"YYYY-MM"`; comparação entre competências é lexicográfica sobre a string zero-padded.
- Data civil é sempre `"YYYY-MM-DD"`. Um `Date` nunca cruza fronteira de persistência.
- Todo cálculo de mês fixa o fuso em `America/Sao_Paulo` — sempre via `dataCivilEm`/`competenciaDe` de `@/dominio/data`, nunca com `getMonth()` direto.
- `src/dominio/` **não importa** Prisma, React, Next, nem faz I/O.
- `src/dados/` **não contém regra de negócio**: busca linhas e delega o cálculo ao domínio.
- `src/app/` **não recalcula regra de domínio**.
- Toda função de `src/dados/` recebe `cliente: ClientePrisma = prisma` como último parâmetro.
- **Todo teste que escreve no banco roda dentro de `comRollback(async (tx) => {...})` e passa `tx`** — nunca o `prisma` nu. Os testes rodam contra o banco Postgres real, não há banco de teste separado.
- **Testes com asserção global** (que somam tudo do mês, sem filtrar por id criado no próprio teste) usam competências em **2099+**, nunca meses próximos do real — dado real do usuário colide. Testes que filtram pelos ids que eles mesmos criaram podem usar qualquer competência.
- Cor vem sempre de `BudgetCategory.corSlot` (**a entidade**), nunca da posição no ranking — filtrar não pode repintar as categorias remanescentes (spec §9).
- Três slots do tema claro ficam abaixo de 3:1 de contraste: **toda marca colorida carrega rótulo textual visível**. Cor nunca é o único portador de informação (spec §9).
- Prisma fica pinado em `6.19.3` (sem `^`).
- TypeScript em modo strict; `npx tsc --noEmit` e `npm run lint` limpos ao fim de cada tarefa.

**Fora do escopo deste plano:** reembolso e estorno na interface, a tela de Reembolsos, e a limitação da janela de faturas em `/cartoes` (Plano 5); despesas recorrentes e PWA (Plano 6). A tela de Áreas **lê** os créditos de estorno que já existem no banco, mas não oferece nenhum jeito de criá-los pela interface — isso é o Plano 5.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/dominio/agregacao.ts` | **Modificado.** Ganha agregação por subcategoria (gasto líquido, contagem, maior lançamento) ao lado da que já existe por categoria. |
| `src/dominio/areas.ts` | **Novo.** Puro: as duas camadas da tela de Áreas — composição por orçamento (barra 100%) e ranking de subcategorias com colapso em "Outras N". |
| `src/dominio/fluxo.ts` | **Novo.** Puro: janela de 13 meses, classificação passado/corrente/futuro, e escala das colunas. |
| `src/dados/areas.ts` | **Novo.** Modelo de leitura de `/areas`: busca despesas, créditos e nomes do mês e entrega ao domínio. |
| `src/dados/fluxo.ts` | **Novo.** Modelo de leitura de `/fluxo`: busca a janela inteira em poucas consultas e monta um ponto por mês. |
| `src/app/(app)/cores.ts` | **Novo.** A paleta do spec §9 num lugar só — hoje está duplicada em `ajustes/page.tsx` e `orcamentos/page.tsx`, e esta tela seria a terceira cópia. |
| `src/app/(app)/areas/page.tsx` | **Novo.** Tela de Áreas. |
| `src/app/(app)/areas/areas.module.css` | **Novo.** Estilos da tela de Áreas. |
| `src/app/(app)/fluxo/page.tsx` | **Novo.** Tela de Fluxo. |
| `src/app/(app)/fluxo/fluxo.module.css` | **Novo.** Estilos da tela de Fluxo. |
| `src/app/(app)/layout.tsx` | **Modificado.** Dois destinos novos na navegação. |
| `src/app/(app)/ajustes/page.tsx` | **Modificado.** Passa a importar a paleta de `cores.ts`. |
| `src/app/(app)/orcamentos/page.tsx` | **Modificado.** Idem. |

---

## Task 1: Agregação por subcategoria

O domínio já sabe somar gasto líquido **por categoria** (`gastoPorCategoria`). A tela de Áreas precisa do mesmo cálculo **por subcategoria**, mais duas estatísticas que o hover da tela mostra: quantos lançamentos e qual o maior deles.

**Files:**
- Modify: `src/dominio/agregacao.ts`
- Test: `src/dominio/agregacao.test.ts`

**Interfaces:**
- Consumes: `Competencia` de `@/dominio/data`, `Centavos` de `@/dominio/dinheiro` (já importados no arquivo).
- Produces:
  - `DespesaAgregavel` e `CreditoAgregavel` ganham um campo **opcional** `subcategoriaId?: string`. É opcional de propósito: `src/dados/painel.ts` e `src/dados/fluxo.ts` constroem esses objetos sem subcategoria e não podem quebrar.
  - `interface EstatisticaDeSubcategoria { gastoCentavos: Centavos; quantidade: number; maiorLancamentoCentavos: Centavos }`
  - `estatisticasPorSubcategoria(despesas: DespesaAgregavel[], creditos: CreditoAgregavel[], mes: Competencia): Map<string, EstatisticaDeSubcategoria>`

**Semântica exata:**
- Só entram despesas **não canceladas** da competência `mes`.
- A chave do mapa é `subcategoriaId`. Despesa **sem** `subcategoriaId` (string vazia ou `undefined`) é **ignorada** — receita não tem subcategoria, e uma despesa sem ela não deveria existir (spec §3).
- `quantidade` conta **só despesas ativas**, nunca créditos.
- `maiorLancamentoCentavos` é o maior valor **bruto** de uma despesa individual — não o líquido depois do crédito. É isso que "o maior lançamento individual" significa no spec §8.2.
- Créditos subtraem de `gastoCentavos` (e só dele), pela **sua própria** `competenciaCredito`, seguindo a subcategoria da despesa de origem — mesma regra que `gastoPorCategoria` já aplica para categoria (spec §7).
- Uma subcategoria que só tem crédito no mês (estorno caindo num mês sem gasto novo) **aparece** no mapa, com `gastoCentavos` negativo, `quantidade: 0` e `maiorLancamentoCentavos: 0`. Truncar em zero esconderia dinheiro real.

- [ ] **Step 1: Escrever os testes que falham**

Adicione ao fim de `src/dominio/agregacao.test.ts`. O arquivo **já importa** `DespesaAgregavel` e `CreditoAgregavel` de `./agregacao` — some apenas `estatisticasPorSubcategoria` a esse mesmo `import`, não crie um segundo.

O arquivo também **já tem** um helper de escopo de módulo chamado `despesa`, com outra assinatura. O helper novo abaixo se chama `comSub` de propósito, para não sombrear o que já existe.

```ts
describe('estatisticasPorSubcategoria', () => {
  const mes = '2026-09';

  function comSub(
    subcategoriaId: string,
    valorCentavos: number,
    extras: Partial<DespesaAgregavel> = {},
  ): DespesaAgregavel {
    return {
      competencia: mes,
      categoriaId: 'cat-1',
      subcategoriaId,
      valorCentavos,
      cancelada: false,
      ...extras,
    };
  }

  it('soma as despesas ativas de cada subcategoria', () => {
    const stats = estatisticasPorSubcategoria(
      [comSub('sub-a', 3000), comSub('sub-a', 2000), comSub('sub-b', 500)],
      [],
      mes,
    );

    expect(stats.get('sub-a')?.gastoCentavos).toBe(5000);
    expect(stats.get('sub-b')?.gastoCentavos).toBe(500);
  });

  it('ignora despesas canceladas e de outra competência', () => {
    const stats = estatisticasPorSubcategoria(
      [
        comSub('sub-a', 3000),
        comSub('sub-a', 9900, { cancelada: true }),
        comSub('sub-a', 7700, { competencia: '2026-10' }),
      ],
      [],
      mes,
    );

    expect(stats.get('sub-a')?.gastoCentavos).toBe(3000);
    expect(stats.get('sub-a')?.quantidade).toBe(1);
  });

  it('ignora despesa sem subcategoria', () => {
    const stats = estatisticasPorSubcategoria(
      [comSub('sub-a', 3000), comSub('', 1000), { ...comSub('x', 1000), subcategoriaId: undefined }],
      [],
      mes,
    );

    expect([...stats.keys()]).toEqual(['sub-a']);
  });

  it('crédito reduz o gasto da subcategoria da despesa de origem', () => {
    const stats = estatisticasPorSubcategoria(
      [comSub('sub-a', 10000)],
      [
        {
          competenciaCredito: mes,
          categoriaId: 'cat-1',
          subcategoriaId: 'sub-a',
          valorCentavos: 4000,
        },
      ],
      mes,
    );

    expect(stats.get('sub-a')?.gastoCentavos).toBe(6000);
  });

  it('crédito de outra competência não entra', () => {
    const stats = estatisticasPorSubcategoria(
      [comSub('sub-a', 10000)],
      [
        {
          competenciaCredito: '2026-10',
          categoriaId: 'cat-1',
          subcategoriaId: 'sub-a',
          valorCentavos: 4000,
        },
      ],
      mes,
    );

    expect(stats.get('sub-a')?.gastoCentavos).toBe(10000);
  });

  it('conta os lançamentos sem contar os créditos', () => {
    const stats = estatisticasPorSubcategoria(
      [comSub('sub-a', 1000), comSub('sub-a', 2000)],
      [
        {
          competenciaCredito: mes,
          categoriaId: 'cat-1',
          subcategoriaId: 'sub-a',
          valorCentavos: 500,
        },
      ],
      mes,
    );

    expect(stats.get('sub-a')?.quantidade).toBe(2);
  });

  it('o maior lançamento é o bruto, não o líquido depois do crédito', () => {
    const stats = estatisticasPorSubcategoria(
      [comSub('sub-a', 1000), comSub('sub-a', 8000)],
      [
        {
          competenciaCredito: mes,
          categoriaId: 'cat-1',
          subcategoriaId: 'sub-a',
          valorCentavos: 7900,
        },
      ],
      mes,
    );

    expect(stats.get('sub-a')?.maiorLancamentoCentavos).toBe(8000);
  });

  it('subcategoria só com crédito aparece com gasto negativo', () => {
    const stats = estatisticasPorSubcategoria(
      [],
      [
        {
          competenciaCredito: mes,
          categoriaId: 'cat-1',
          subcategoriaId: 'sub-a',
          valorCentavos: 2500,
        },
      ],
      mes,
    );

    expect(stats.get('sub-a')).toEqual({
      gastoCentavos: -2500,
      quantidade: 0,
      maiorLancamentoCentavos: 0,
    });
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/dominio/agregacao.test.ts`
Expected: FAIL — `estatisticasPorSubcategoria is not a function` / erro de import.

- [ ] **Step 3: Implementar**

Em `src/dominio/agregacao.ts`, some `subcategoriaId?: string` às duas interfaces existentes:

```ts
export interface DespesaAgregavel {
  competencia: Competencia;
  categoriaId: string;
  /** Opcional: só a tela de Áreas agrega por subcategoria. */
  subcategoriaId?: string;
  valorCentavos: Centavos;
  cancelada: boolean;
}

export interface CreditoAgregavel {
  competenciaCredito: Competencia;
  categoriaId: string;
  /** Opcional: só a tela de Áreas agrega por subcategoria. */
  subcategoriaId?: string;
  valorCentavos: Centavos;
}
```

E acrescente ao fim do arquivo:

```ts
export interface EstatisticaDeSubcategoria {
  /** Líquido: despesas ativas menos créditos. Pode ser negativo. */
  gastoCentavos: Centavos;
  /** Quantos lançamentos ativos — créditos não contam. */
  quantidade: number;
  /** Maior despesa individual em valor BRUTO, antes de qualquer crédito. */
  maiorLancamentoCentavos: Centavos;
}

function estatisticaVazia(): EstatisticaDeSubcategoria {
  return { gastoCentavos: 0, quantidade: 0, maiorLancamentoCentavos: 0 };
}

/**
 * O mesmo cálculo de `gastoPorCategoria`, um nível abaixo, mais as duas
 * estatísticas que o detalhe da tela de Áreas mostra (spec, seção 8.2).
 *
 * Despesa sem subcategoria é ignorada: receita não tem uma, e o spec (seção 3)
 * obriga toda despesa a ter.
 */
export function estatisticasPorSubcategoria(
  despesas: DespesaAgregavel[],
  creditos: CreditoAgregavel[],
  mes: Competencia,
): Map<string, EstatisticaDeSubcategoria> {
  const stats = new Map<string, EstatisticaDeSubcategoria>();

  function entrada(chave: string): EstatisticaDeSubcategoria {
    const existente = stats.get(chave);
    if (existente) return existente;
    const nova = estatisticaVazia();
    stats.set(chave, nova);
    return nova;
  }

  for (const d of despesas) {
    if (d.cancelada || d.competencia !== mes) continue;
    if (!d.subcategoriaId) continue;

    const e = entrada(d.subcategoriaId);
    e.gastoCentavos += d.valorCentavos;
    e.quantidade += 1;
    e.maiorLancamentoCentavos = Math.max(e.maiorLancamentoCentavos, d.valorCentavos);
  }

  for (const c of creditos) {
    if (c.competenciaCredito !== mes) continue;
    if (!c.subcategoriaId) continue;

    entrada(c.subcategoriaId).gastoCentavos -= c.valorCentavos;
  }

  return stats;
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run src/dominio/agregacao.test.ts`
Expected: PASS — inclusive os testes que já existiam no arquivo, provando que o campo opcional não quebrou `gastoPorCategoria`.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npx vitest run && npx tsc --noEmit`
Expected: tudo verde. `src/dados/painel.ts` continua compilando sem passar `subcategoriaId`.

- [ ] **Step 6: Commit**

```bash
git add src/dominio/agregacao.ts src/dominio/agregacao.test.ts
git commit -m "feat(dominio): agregação por subcategoria com contagem e maior lançamento"
```

---

## Task 2: Regras da tela de Áreas

As duas camadas do spec §8.2, puras. A camada 1 é a barra 100% empilhada por orçamento; a camada 2 é o ranking de subcategorias com colapso em "Outras N".

**Files:**
- Create: `src/dominio/areas.ts`
- Test: `src/dominio/areas.test.ts`

**Interfaces:**
- Consumes: `Centavos` de `@/dominio/dinheiro`.
- Produces: `GastoDeOrcamento`, `SegmentoDaComposicao`, `Composicao`, `composicaoPorOrcamento`, `EntradaDoRanking`, `LinhaDoRanking`, `Ranking`, `rankearSubcategorias`, `MAXIMO_SEGMENTOS_COLORIDOS`, `MAXIMO_LINHAS_DO_RANKING`.

**Decisões de regra que este módulo fixa** (todas derivadas do spec, e todas testadas):

1. **Categoria com gasto líquido ≤ 0 não vira segmento.** Uma categoria que ficou negativa depois de um estorno não pode ocupar fatia de uma barra de 100%. Mas ela também não some: sai em `creditados`, que a tela lista à parte com o valor negativo visível. Truncar em zero esconderia dinheiro real (spec §6.2).
2. **No máximo 6 segmentos coloridos** (spec §9: "Apenas 6 orçamentos recebem cor própria; os demais caem em 'Outras', cinza"). Passando disso, os menores colapsam num segmento cinza `Outras N`, marcado por `corSlot: null`.
3. **A cor de cada segmento é o `corSlot` da categoria**, copiado da entrada. Nunca é derivada da posição no ranking (spec §9).
4. **O ranking não filtra negativos.** Ele ordena por valor decrescente, então uma subcategoria negativa cai naturalmente no fim, com barra de largura 0 e o valor negativo escrito por extenso. Filtrar sumiria com o dinheiro.
5. **`percentual` é valor de desenho**, sempre com guarda de denominador. Nunca ordena nada.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/dominio/areas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  type EntradaDoRanking,
  type GastoDeOrcamento,
  MAXIMO_LINHAS_DO_RANKING,
  MAXIMO_SEGMENTOS_COLORIDOS,
  composicaoPorOrcamento,
  rankearSubcategorias,
} from './areas';

function orcamento(
  categoriaId: string,
  gastoCentavos: number,
  corSlot = 1,
): GastoDeOrcamento {
  return { categoriaId, nome: categoriaId, corSlot, gastoCentavos };
}

describe('composicaoPorOrcamento', () => {
  it('ordena os segmentos por valor decrescente', () => {
    const c = composicaoPorOrcamento([
      orcamento('a', 1000),
      orcamento('b', 5000),
      orcamento('c', 3000),
    ]);

    expect(c.segmentos.map((s) => s.categoriaId)).toEqual(['b', 'c', 'a']);
  });

  it('o total é a soma dos positivos e os percentuais somam 100', () => {
    const c = composicaoPorOrcamento([
      orcamento('a', 2500),
      orcamento('b', 7500),
    ]);

    expect(c.totalCentavos).toBe(10000);
    expect(c.segmentos.map((s) => s.percentual)).toEqual([75, 25]);
  });

  it('preserva a cor da entidade, não a da posição', () => {
    const c = composicaoPorOrcamento([
      orcamento('a', 1000, 4),
      orcamento('b', 9000, 2),
    ]);

    expect(c.segmentos.map((s) => [s.categoriaId, s.corSlot])).toEqual([
      ['b', 2],
      ['a', 4],
    ]);
  });

  it('categoria com gasto líquido negativo sai da barra e vai para creditados', () => {
    const c = composicaoPorOrcamento([
      orcamento('a', 8000),
      orcamento('estornada', -1500),
    ]);

    expect(c.segmentos.map((s) => s.categoriaId)).toEqual(['a']);
    expect(c.creditados.map((g) => [g.categoriaId, g.gastoCentavos])).toEqual([
      ['estornada', -1500],
    ]);
    expect(c.totalCentavos).toBe(8000);
  });

  it('categoria com gasto zero também não vira segmento', () => {
    const c = composicaoPorOrcamento([orcamento('a', 8000), orcamento('zero', 0)]);

    expect(c.segmentos.map((s) => s.categoriaId)).toEqual(['a']);
    expect(c.creditados.map((g) => g.categoriaId)).toEqual(['zero']);
  });

  it('além de seis categorias, as menores colapsam em um segmento cinza', () => {
    const c = composicaoPorOrcamento([
      orcamento('a', 7000),
      orcamento('b', 6000),
      orcamento('c', 5000),
      orcamento('d', 4000),
      orcamento('e', 3000),
      orcamento('f', 2000),
      orcamento('g', 700),
      orcamento('h', 300),
    ]);

    expect(c.segmentos).toHaveLength(MAXIMO_SEGMENTOS_COLORIDOS + 1);

    const ultimo = c.segmentos[c.segmentos.length - 1];
    expect(ultimo.nome).toBe('Outras 2');
    expect(ultimo.corSlot).toBeNull();
    expect(ultimo.gastoCentavos).toBe(1000);
  });

  it('exatamente seis categorias não geram "Outras"', () => {
    const c = composicaoPorOrcamento([
      orcamento('a', 6000),
      orcamento('b', 5000),
      orcamento('c', 4000),
      orcamento('d', 3000),
      orcamento('e', 2000),
      orcamento('f', 1000),
    ]);

    expect(c.segmentos).toHaveLength(6);
    expect(c.segmentos.every((s) => s.corSlot !== null)).toBe(true);
  });

  it('mês sem gasto nenhum não divide por zero', () => {
    const c = composicaoPorOrcamento([orcamento('a', 0)]);

    expect(c.totalCentavos).toBe(0);
    expect(c.segmentos).toEqual([]);
    expect(Number.isNaN(c.totalCentavos)).toBe(false);
  });

  it('não modifica o array recebido', () => {
    const entrada = [orcamento('a', 1000), orcamento('b', 9000)];
    composicaoPorOrcamento(entrada);

    expect(entrada.map((g) => g.categoriaId)).toEqual(['a', 'b']);
  });
});

function entrada(
  subcategoriaId: string,
  gastoCentavos: number,
  categoriaId = 'cat-1',
): EntradaDoRanking {
  return {
    subcategoriaId,
    nome: subcategoriaId,
    categoriaId,
    nomeDoOrcamento: categoriaId,
    corSlot: 1,
    gastoCentavos,
    quantidade: 1,
    maiorLancamentoCentavos: gastoCentavos,
  };
}

describe('rankearSubcategorias', () => {
  it('ordena por valor decrescente', () => {
    const r = rankearSubcategorias(
      [entrada('a', 100), entrada('b', 900), entrada('c', 500)],
      1500,
      new Map([['cat-1', 1500]]),
    );

    expect(r.linhas.map((l) => l.subcategoriaId)).toEqual(['b', 'c', 'a']);
    expect(r.outras).toBeNull();
  });

  it('calcula o percentual do mês e o percentual dentro do orçamento-pai', () => {
    const r = rankearSubcategorias(
      [entrada('a', 2500, 'cat-1')],
      10000,
      new Map([['cat-1', 5000]]),
    );

    expect(r.linhas[0].percentualDoMes).toBe(25);
    expect(r.linhas[0].percentualDoOrcamento).toBe(50);
  });

  it('mostra as dez maiores e colapsa o resto em "Outras"', () => {
    const entradas = Array.from({ length: 13 }, (_, i) =>
      entrada(`sub-${i}`, (13 - i) * 100),
    );

    const r = rankearSubcategorias(entradas, 9100, new Map([['cat-1', 9100]]));

    expect(r.linhas).toHaveLength(MAXIMO_LINHAS_DO_RANKING);
    expect(r.linhas[0].subcategoriaId).toBe('sub-0');
    expect(r.outras).toEqual({
      quantidade: 3,
      gastoCentavos: 300 + 200 + 100,
      percentualDoMes: (600 / 9100) * 100,
    });
  });

  it('exatamente dez subcategorias não geram "Outras"', () => {
    const entradas = Array.from({ length: 10 }, (_, i) => entrada(`sub-${i}`, 100));

    const r = rankearSubcategorias(entradas, 1000, new Map([['cat-1', 1000]]));

    expect(r.linhas).toHaveLength(10);
    expect(r.outras).toBeNull();
  });

  it('subcategoria negativa fica no fim, com percentual negativo e sem NaN', () => {
    const r = rankearSubcategorias(
      [entrada('a', 1000), entrada('estornada', -400)],
      1000,
      new Map([['cat-1', 600]]),
    );

    expect(r.linhas.map((l) => l.subcategoriaId)).toEqual(['a', 'estornada']);
    expect(r.linhas[1].percentualDoMes).toBe(-40);
    expect(Number.isNaN(r.linhas[1].percentualDoOrcamento)).toBe(false);
  });

  it('total do mês zero não divide por zero', () => {
    const r = rankearSubcategorias([entrada('a', 0)], 0, new Map([['cat-1', 0]]));

    expect(r.linhas[0].percentualDoMes).toBe(0);
    expect(r.linhas[0].percentualDoOrcamento).toBe(0);
  });

  it('orçamento-pai com gasto líquido negativo não gera percentual infinito', () => {
    const r = rankearSubcategorias(
      [entrada('a', 500)],
      500,
      new Map([['cat-1', -100]]),
    );

    expect(r.linhas[0].percentualDoOrcamento).toBe(0);
    expect(Number.isFinite(r.linhas[0].percentualDoOrcamento)).toBe(true);
  });

  it('não modifica o array recebido', () => {
    const entradas = [entrada('a', 100), entrada('b', 900)];
    rankearSubcategorias(entradas, 1000, new Map([['cat-1', 1000]]));

    expect(entradas.map((e) => e.subcategoriaId)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/dominio/areas.test.ts`
Expected: FAIL — `Cannot find module './areas'`.

- [ ] **Step 3: Implementar**

Crie `src/dominio/areas.ts`:

```ts
/**
 * Regras da tela de Áreas (spec, seção 8.2).
 *
 * Duas camadas sobre o gasto do mês: a composição por orçamento (barra 100%
 * empilhada) e o ranking de subcategorias. Quem decide o que entra na barra,
 * em que ordem, e o que colapsa em "Outras" é este módulo — a tela só desenha.
 *
 * Sobre percentuais: são os únicos números em ponto flutuante daqui, e existem
 * só para desenhar largura de barra e escrever rótulo. Nenhuma ordenação e
 * nenhum limiar usa percentual — comparação é sempre inteira, em centavos.
 */

import type { Centavos } from './dinheiro';

/** Spec, seção 9: só seis orçamentos recebem cor própria. */
export const MAXIMO_SEGMENTOS_COLORIDOS = 6;

/** Spec, seção 8.2: "As 10 maiores aparecem; o resto colapsa em 'Outras N'". */
export const MAXIMO_LINHAS_DO_RANKING = 10;

/** Divisão só para desenho, com guarda. Nunca usada para ordenar ou decidir. */
function percentual(parte: Centavos, total: Centavos): number {
  if (total <= 0) return 0;
  return (parte / total) * 100;
}

export interface GastoDeOrcamento {
  categoriaId: string;
  nome: string;
  corSlot: number;
  /** Líquido do mês. Pode ser negativo depois de um estorno. */
  gastoCentavos: Centavos;
}

export interface SegmentoDaComposicao {
  /** Vazio no segmento "Outras", que não é uma categoria. */
  categoriaId: string;
  nome: string;
  /** `null` marca o segmento cinza "Outras". */
  corSlot: number | null;
  gastoCentavos: Centavos;
  percentual: number;
}

export interface Composicao {
  /** Soma só dos gastos positivos — é o 100% da barra. */
  totalCentavos: Centavos;
  segmentos: SegmentoDaComposicao[];
  /**
   * Categorias com gasto líquido <= 0, que não podem ocupar fatia de uma barra
   * de 100%. Não somem da tela: aparecem à parte, com o valor negativo visível.
   */
  creditados: GastoDeOrcamento[];
}

export function composicaoPorOrcamento(gastos: GastoDeOrcamento[]): Composicao {
  const positivos = gastos.filter((g) => g.gastoCentavos > 0);
  const creditados = gastos.filter((g) => g.gastoCentavos <= 0);

  // Ordenação inteira, em centavos. Desempate por nome para ficar determinística.
  const ordenados = [...positivos].sort(
    (a, b) => b.gastoCentavos - a.gastoCentavos || a.nome.localeCompare(b.nome),
  );

  const totalCentavos = ordenados.reduce((soma, g) => soma + g.gastoCentavos, 0);

  const coloridos = ordenados.slice(0, MAXIMO_SEGMENTOS_COLORIDOS);
  const excedentes = ordenados.slice(MAXIMO_SEGMENTOS_COLORIDOS);

  const segmentos: SegmentoDaComposicao[] = coloridos.map((g) => ({
    categoriaId: g.categoriaId,
    nome: g.nome,
    corSlot: g.corSlot,
    gastoCentavos: g.gastoCentavos,
    percentual: percentual(g.gastoCentavos, totalCentavos),
  }));

  if (excedentes.length > 0) {
    const soma = excedentes.reduce((s, g) => s + g.gastoCentavos, 0);
    segmentos.push({
      categoriaId: '',
      nome: `Outras ${excedentes.length}`,
      corSlot: null,
      gastoCentavos: soma,
      percentual: percentual(soma, totalCentavos),
    });
  }

  return { totalCentavos, segmentos, creditados };
}

export interface EntradaDoRanking {
  subcategoriaId: string;
  nome: string;
  categoriaId: string;
  nomeDoOrcamento: string;
  /** Herdado do orçamento-pai — o spec (seção 9) proíbe cor nova para subcategoria. */
  corSlot: number;
  gastoCentavos: Centavos;
  quantidade: number;
  maiorLancamentoCentavos: Centavos;
}

export interface LinhaDoRanking extends EntradaDoRanking {
  percentualDoMes: number;
  percentualDoOrcamento: number;
}

export interface Outras {
  quantidade: number;
  gastoCentavos: Centavos;
  percentualDoMes: number;
}

export interface Ranking {
  linhas: LinhaDoRanking[];
  /** `null` quando cabe tudo nas dez primeiras. */
  outras: Outras | null;
}

/**
 * As dez maiores subcategorias, e o resto somado em "Outras N".
 *
 * Subcategoria com gasto negativo NÃO é filtrada: a ordenação decrescente já a
 * joga para o fim, e a tela desenha barra de largura zero com o valor negativo
 * escrito. Filtrar sumiria com dinheiro real.
 */
export function rankearSubcategorias(
  entradas: EntradaDoRanking[],
  totalDoMes: Centavos,
  gastoPorOrcamento: Map<string, Centavos>,
): Ranking {
  const ordenadas = [...entradas].sort(
    (a, b) => b.gastoCentavos - a.gastoCentavos || a.nome.localeCompare(b.nome),
  );

  const linhas: LinhaDoRanking[] = ordenadas
    .slice(0, MAXIMO_LINHAS_DO_RANKING)
    .map((e) => ({
      ...e,
      percentualDoMes: percentual(e.gastoCentavos, totalDoMes),
      percentualDoOrcamento: percentual(
        e.gastoCentavos,
        gastoPorOrcamento.get(e.categoriaId) ?? 0,
      ),
    }));

  const excedentes = ordenadas.slice(MAXIMO_LINHAS_DO_RANKING);
  if (excedentes.length === 0) {
    return { linhas, outras: null };
  }

  const soma = excedentes.reduce((s, e) => s + e.gastoCentavos, 0);
  return {
    linhas,
    outras: {
      quantidade: excedentes.length,
      gastoCentavos: soma,
      percentualDoMes: percentual(soma, totalDoMes),
    },
  };
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run src/dominio/areas.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar a suíte e os tipos**

Run: `npx vitest run && npx tsc --noEmit`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add src/dominio/areas.ts src/dominio/areas.test.ts
git commit -m "feat(dominio): composição por orçamento e ranking de subcategorias"
```

---

## Task 3: Modelo de leitura de Áreas

Busca as linhas do mês e entrega ao domínio. Nenhuma aritmética de dinheiro neste arquivo.

**Files:**
- Create: `src/dados/areas.ts`
- Test: `src/dados/areas.test.ts`

**Interfaces:**
- Consumes: `estatisticasPorSubcategoria`, `gastoPorCategoria`, `DespesaAgregavel`, `CreditoAgregavel` de `@/dominio/agregacao`; `composicaoPorOrcamento`, `rankearSubcategorias`, `EntradaDoRanking`, `GastoDeOrcamento`, `Composicao`, `Ranking` de `@/dominio/areas`; `Competencia` de `@/dominio/data`; `ClientePrisma` de `./tipos`; `prisma` de `./prisma`.
- Produces:
  - `interface AreasDoMes { competencia: Competencia; totalCentavos: number; composicao: Composicao; ranking: Ranking; filtro: { categoriaId: string; nome: string } | null }`
  - `areasDoMes(mes: Competencia, categoriaId: string | null, cliente?: ClientePrisma): Promise<AreasDoMes>`

**Decisões que este arquivo fixa:**
- A busca de categorias **não filtra `arquivada`**. Uma categoria arquivada que ainda teve gasto no mês precisa de nome e cor — é a mesma união que `src/dados/painel.ts` faz desde a revisão do Plano 3, e pelo mesmo motivo (spec §7).
- O filtro por categoria restringe **só o ranking**. A composição continua inteira, senão não haveria como clicar em outro segmento. E o `percentualDoMes` continua sendo sobre o mês inteiro, não sobre a categoria filtrada — o spec §8.2 diz "o peso da subcategoria **no total do mês**".
- `totalCentavos` (o denominador de `percentualDoMes`) é o total da composição, isto é, a soma dos gastos **positivos** por categoria. É o mesmo número que a barra representa como 100%.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/dados/areas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { areasDoMes } from './areas';
import { arquivarCategoria, criarCategoria, criarSubcategoria } from './categorias';
import { criarLancamento } from './lancamentos';
import { comRollback } from './rollback';
import type { ClientePrisma } from './tipos';

const MES = '2099-09';

async function cenario(tx: ClientePrisma) {
  const alimentacao = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
  const mercado = await criarSubcategoria(
    { budgetCategoryId: alimentacao.id, nome: 'Mercado' },
    tx,
  );
  const delivery = await criarSubcategoria(
    { budgetCategoryId: alimentacao.id, nome: 'Delivery' },
    tx,
  );

  const lazer = await criarCategoria({ nome: 'Lazer', corSlot: 5 }, tx);
  const bar = await criarSubcategoria({ budgetCategoryId: lazer.id, nome: 'Bar' }, tx);

  return { alimentacao, mercado, delivery, lazer, bar };
}

async function gastar(
  tx: ClientePrisma,
  categoriaId: string,
  subcategoryId: string,
  valorCentavos: number,
) {
  return criarLancamento(
    {
      descricao: 'Gasto',
      valorCentavos,
      data: `${MES}-10`,
      metodo: 'PIX',
      cardId: null,
      budgetCategoryId: categoriaId,
      subcategoryId,
      parcelas: 1,
      reembolsoAlvoCentavos: 0,
    },
    tx,
  );
}

describe('areasDoMes', () => {
  it('monta a composição por orçamento com a cor de cada categoria', async () => {
    await comRollback(async (tx) => {
      const c = await cenario(tx);
      await gastar(tx, c.alimentacao.id, c.mercado.id, 75000);
      await gastar(tx, c.lazer.id, c.bar.id, 25000);

      const areas = await areasDoMes(MES, null, tx);

      expect(areas.totalCentavos).toBe(100000);

      const alimentacao = areas.composicao.segmentos.find(
        (s) => s.categoriaId === c.alimentacao.id,
      )!;
      expect(alimentacao.corSlot).toBe(2);
      expect(alimentacao.gastoCentavos).toBe(75000);
      expect(alimentacao.percentual).toBe(75);
    });
  });

  it('o ranking traz nome do orçamento-pai e a cor herdada dele', async () => {
    await comRollback(async (tx) => {
      const c = await cenario(tx);
      await gastar(tx, c.alimentacao.id, c.mercado.id, 60000);
      await gastar(tx, c.alimentacao.id, c.delivery.id, 20000);

      const areas = await areasDoMes(MES, null, tx);

      const mercado = areas.ranking.linhas.find(
        (l) => l.subcategoriaId === c.mercado.id,
      )!;
      expect(mercado.nome).toBe('Mercado');
      expect(mercado.nomeDoOrcamento).toBe('Alimentação');
      expect(mercado.corSlot).toBe(2);
      expect(mercado.percentualDoOrcamento).toBe(75);
    });
  });

  it('conta os lançamentos e guarda o maior individual', async () => {
    await comRollback(async (tx) => {
      const c = await cenario(tx);
      await gastar(tx, c.alimentacao.id, c.mercado.id, 12000);
      await gastar(tx, c.alimentacao.id, c.mercado.id, 30000);
      await gastar(tx, c.alimentacao.id, c.mercado.id, 8000);

      const areas = await areasDoMes(MES, null, tx);

      const mercado = areas.ranking.linhas.find(
        (l) => l.subcategoriaId === c.mercado.id,
      )!;
      expect(mercado.quantidade).toBe(3);
      expect(mercado.maiorLancamentoCentavos).toBe(30000);
      expect(mercado.gastoCentavos).toBe(50000);
    });
  });

  it('filtrar por categoria restringe o ranking, não a composição', async () => {
    await comRollback(async (tx) => {
      const c = await cenario(tx);
      await gastar(tx, c.alimentacao.id, c.mercado.id, 75000);
      await gastar(tx, c.lazer.id, c.bar.id, 25000);

      const areas = await areasDoMes(MES, c.lazer.id, tx);

      expect(areas.filtro).toEqual({ categoriaId: c.lazer.id, nome: 'Lazer' });
      expect(areas.ranking.linhas.map((l) => l.subcategoriaId)).toEqual([c.bar.id]);

      // A composição continua inteira: dá para clicar em outro segmento.
      expect(areas.composicao.segmentos).toHaveLength(2);

      // E o percentual continua sendo sobre o mês inteiro, não sobre o filtro.
      expect(areas.ranking.linhas[0].percentualDoMes).toBe(25);
    });
  });

  it('categoria arquivada com gasto no mês continua aparecendo, com nome e cor', async () => {
    await comRollback(async (tx) => {
      const c = await cenario(tx);
      await gastar(tx, c.lazer.id, c.bar.id, 40000);
      await arquivarCategoria(c.lazer.id, tx);

      const areas = await areasDoMes(MES, null, tx);

      const segmento = areas.composicao.segmentos.find(
        (s) => s.categoriaId === c.lazer.id,
      )!;
      expect(segmento.nome).toBe('Lazer');
      expect(segmento.corSlot).toBe(5);
      expect(segmento.gastoCentavos).toBe(40000);
    });
  });

  it('crédito de estorno reduz o gasto da subcategoria de origem', async () => {
    await comRollback(async (tx) => {
      const c = await cenario(tx);
      const compra = await gastar(tx, c.alimentacao.id, c.mercado.id, 50000);

      await tx.credito.create({
        data: {
          transactionId: compra.ids[0],
          valorCentavos: 20000,
          recebidoEm: `${MES}-20`,
          competenciaCredito: MES,
          origem: 'ESTORNO',
        },
      });

      const areas = await areasDoMes(MES, null, tx);

      const mercado = areas.ranking.linhas.find(
        (l) => l.subcategoriaId === c.mercado.id,
      )!;
      expect(mercado.gastoCentavos).toBe(30000);
      // O bruto do maior lançamento não muda com o crédito.
      expect(mercado.maiorLancamentoCentavos).toBe(50000);
    });
  });

  it('mês sem gasto nenhum devolve composição vazia, sem NaN', async () => {
    await comRollback(async (tx) => {
      await cenario(tx);

      const areas = await areasDoMes('2099-11', null, tx);

      expect(areas.composicao.segmentos).toEqual([]);
      expect(areas.ranking.linhas).toEqual([]);
      expect(areas.ranking.outras).toBeNull();
      expect(areas.totalCentavos).toBe(0);
    });
  });

  it('rejeita competência fora do formato', async () => {
    await expect(areasDoMes('2099/09', null)).rejects.toThrow('Competência inválida');
  });
});
```

> **Nota:** `criarLancamento` devolve `{ ids: string[] }` — um id por parcela, na ordem. Como todos os lançamentos acima são de parcela única, `compra.ids[0]` é o id da transação criada.

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/dados/areas.test.ts`
Expected: FAIL — `Cannot find module './areas'`.

- [ ] **Step 3: Implementar**

Crie `src/dados/areas.ts`:

```ts
import {
  type CreditoAgregavel,
  type DespesaAgregavel,
  estatisticasPorSubcategoria,
  gastoPorCategoria,
} from '@/dominio/agregacao';
import {
  type Composicao,
  type EntradaDoRanking,
  type GastoDeOrcamento,
  type Ranking,
  composicaoPorOrcamento,
  rankearSubcategorias,
} from '@/dominio/areas';
import type { Competencia } from '@/dominio/data';

import { prisma } from './prisma';
import type { ClientePrisma } from './tipos';

export interface AreasDoMes {
  competencia: Competencia;
  /** O 100% da barra: soma dos gastos positivos por categoria. */
  totalCentavos: number;
  composicao: Composicao;
  ranking: Ranking;
  filtro: { categoriaId: string; nome: string } | null;
}

function validarCompetencia(c: Competencia): void {
  if (!/^\d{4}-\d{2}$/.test(c)) {
    throw new Error(`Competência inválida, esperado "YYYY-MM": ${c}`);
  }
}

/**
 * As duas camadas da tela de Áreas. Busca as linhas e entrega ao domínio —
 * nenhuma aritmética de dinheiro acontece neste arquivo.
 *
 * `categoriaId` restringe apenas o ranking: a composição continua inteira,
 * porque é ela que oferece o próximo clique.
 */
export async function areasDoMes(
  mes: Competencia,
  categoriaId: string | null,
  cliente: ClientePrisma = prisma,
): Promise<AreasDoMes> {
  validarCompetencia(mes);

  const [transacoes, creditos, categorias, subcategorias] = await Promise.all([
    cliente.transaction.findMany({
      where: { competencia: mes, tipo: 'DESPESA' },
      select: {
        competencia: true,
        budgetCategoryId: true,
        subcategoryId: true,
        valorCentavos: true,
        status: true,
      },
    }),
    cliente.credito.findMany({
      where: { competenciaCredito: mes },
      select: {
        competenciaCredito: true,
        valorCentavos: true,
        transaction: { select: { budgetCategoryId: true, subcategoryId: true } },
      },
    }),
    // Sem filtro de `arquivada`: uma categoria arquivada que ainda teve gasto
    // no mês precisa de nome e cor (spec, seção 7).
    cliente.budgetCategory.findMany({
      select: { id: true, nome: true, corSlot: true },
    }),
    cliente.subcategory.findMany({
      select: { id: true, nome: true, budgetCategoryId: true },
    }),
  ]);

  const despesas: DespesaAgregavel[] = transacoes.map((t) => ({
    competencia: t.competencia,
    categoriaId: t.budgetCategoryId ?? '',
    subcategoriaId: t.subcategoryId ?? undefined,
    valorCentavos: t.valorCentavos,
    cancelada: t.status === 'CANCELADA',
  }));

  const creditosAgregaveis: CreditoAgregavel[] = creditos.map((c) => ({
    competenciaCredito: c.competenciaCredito,
    categoriaId: c.transaction.budgetCategoryId ?? '',
    subcategoriaId: c.transaction.subcategoryId ?? undefined,
    valorCentavos: c.valorCentavos,
  }));

  const porCategoria = gastoPorCategoria(despesas, creditosAgregaveis, mes);
  const porSubcategoria = estatisticasPorSubcategoria(despesas, creditosAgregaveis, mes);

  const nomeDaCategoria = new Map(categorias.map((c) => [c.id, c]));

  const gastos: GastoDeOrcamento[] = [];
  for (const [id, gastoCentavos] of porCategoria) {
    const categoria = nomeDaCategoria.get(id);
    if (!categoria) continue;
    gastos.push({
      categoriaId: id,
      nome: categoria.nome,
      corSlot: categoria.corSlot,
      gastoCentavos,
    });
  }

  const composicao = composicaoPorOrcamento(gastos);

  const entradas: EntradaDoRanking[] = [];
  for (const sub of subcategorias) {
    const stats = porSubcategoria.get(sub.id);
    if (!stats) continue;
    if (categoriaId && sub.budgetCategoryId !== categoriaId) continue;

    const pai = nomeDaCategoria.get(sub.budgetCategoryId);
    if (!pai) continue;

    entradas.push({
      subcategoriaId: sub.id,
      nome: sub.nome,
      categoriaId: sub.budgetCategoryId,
      nomeDoOrcamento: pai.nome,
      corSlot: pai.corSlot,
      gastoCentavos: stats.gastoCentavos,
      quantidade: stats.quantidade,
      maiorLancamentoCentavos: stats.maiorLancamentoCentavos,
    });
  }

  const filtrada = categoriaId ? nomeDaCategoria.get(categoriaId) : undefined;

  return {
    competencia: mes,
    totalCentavos: composicao.totalCentavos,
    composicao,
    // O denominador é sempre o mês inteiro, mesmo com filtro ativo: o spec
    // (seção 8.2) define o número principal como "o peso da subcategoria no
    // total do mês".
    ranking: rankearSubcategorias(entradas, composicao.totalCentavos, porCategoria),
    filtro: filtrada ? { categoriaId: filtrada.id, nome: filtrada.nome } : null,
  };
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run src/dados/areas.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar a suíte e os tipos**

Run: `npx vitest run && npx tsc --noEmit`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add src/dados/areas.ts src/dados/areas.test.ts
git commit -m "feat(dados): modelo de leitura da tela de Áreas"
```

---

## Task 4: Regras da tela de Fluxo

A janela de meses, a classificação passado/corrente/futuro, e a escala das colunas. Tudo puro.

**Files:**
- Create: `src/dominio/fluxo.ts`
- Test: `src/dominio/fluxo.test.ts`

**Interfaces:**
- Consumes: `Competencia`, `somarMeses` de `@/dominio/data`; `Centavos` de `@/dominio/dinheiro`.
- Produces: `MomentoDoMes`, `PontoDoFluxo`, `MESES_PARA_TRAS`, `MESES_PARA_FRENTE`, `janelaDeMeses`, `momentoDoMes`, `escalaDoFluxo`, `alturaDaColuna`.

**Decisões que este módulo fixa:**
- `janelaDeMeses` devolve **13** competências: 6 atrás, a central, 6 à frente (spec §8.3: "Seis meses para trás e seis para frente").
- `escalaDoFluxo` devolve o **maior valor absoluto** de sobra da janela, com piso `1`. O piso existe só para nunca dividir por zero quando todos os meses são zero.
- `alturaDaColuna` devolve `0..100`, usando o **módulo** do valor — a direção (acima/abaixo da linha) é decisão da tela, o tamanho é daqui.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/dominio/fluxo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  MESES_PARA_FRENTE,
  MESES_PARA_TRAS,
  type PontoDoFluxo,
  alturaDaColuna,
  escalaDoFluxo,
  janelaDeMeses,
  momentoDoMes,
} from './fluxo';

describe('janelaDeMeses', () => {
  it('devolve treze meses com o central no meio', () => {
    const meses = janelaDeMeses('2026-09');

    expect(meses).toHaveLength(MESES_PARA_TRAS + 1 + MESES_PARA_FRENTE);
    expect(meses[MESES_PARA_TRAS]).toBe('2026-09');
    expect(meses[0]).toBe('2026-03');
    expect(meses[meses.length - 1]).toBe('2027-03');
  });

  it('atravessa a virada de ano', () => {
    const meses = janelaDeMeses('2026-01');

    expect(meses[0]).toBe('2025-07');
    expect(meses[meses.length - 1]).toBe('2026-07');
  });

  it('sai em ordem cronológica crescente', () => {
    const meses = janelaDeMeses('2026-09');
    const ordenados = [...meses].sort();

    expect(meses).toEqual(ordenados);
  });
});

describe('momentoDoMes', () => {
  it('classifica passado, corrente e futuro', () => {
    expect(momentoDoMes('2026-08', '2026-09')).toBe('PASSADO');
    expect(momentoDoMes('2026-09', '2026-09')).toBe('CORRENTE');
    expect(momentoDoMes('2026-10', '2026-09')).toBe('FUTURO');
  });

  it('compara lexicograficamente, sem se enganar com dezembro', () => {
    expect(momentoDoMes('2026-12', '2027-01')).toBe('PASSADO');
    expect(momentoDoMes('2027-01', '2026-12')).toBe('FUTURO');
  });
});

function ponto(competencia: string, sobraCentavos: number): PontoDoFluxo {
  return {
    competencia,
    momento: 'PASSADO',
    receitaCentavos: 0,
    despesaCentavos: 0,
    sobraCentavos,
  };
}

describe('escalaDoFluxo', () => {
  it('é o maior valor absoluto da janela', () => {
    expect(
      escalaDoFluxo([ponto('2026-08', 30000), ponto('2026-09', 12000)]),
    ).toBe(30000);
  });

  it('considera o módulo dos negativos', () => {
    expect(
      escalaDoFluxo([ponto('2026-08', 12000), ponto('2026-09', -45000)]),
    ).toBe(45000);
  });

  it('tudo zero devolve 1, para nunca dividir por zero', () => {
    expect(escalaDoFluxo([ponto('2026-08', 0), ponto('2026-09', 0)])).toBe(1);
  });

  it('janela vazia devolve 1', () => {
    expect(escalaDoFluxo([])).toBe(1);
  });
});

describe('alturaDaColuna', () => {
  it('é proporcional à escala', () => {
    expect(alturaDaColuna(5000, 10000)).toBe(50);
    expect(alturaDaColuna(10000, 10000)).toBe(100);
  });

  it('usa o módulo do valor negativo', () => {
    expect(alturaDaColuna(-5000, 10000)).toBe(50);
  });

  it('nunca passa de 100 nem fica abaixo de zero', () => {
    expect(alturaDaColuna(30000, 10000)).toBe(100);
    expect(alturaDaColuna(0, 10000)).toBe(0);
  });

  it('escala não positiva devolve zero em vez de NaN', () => {
    expect(alturaDaColuna(5000, 0)).toBe(0);
    expect(Number.isNaN(alturaDaColuna(5000, 0))).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/dominio/fluxo.test.ts`
Expected: FAIL — `Cannot find module './fluxo'`.

- [ ] **Step 3: Implementar**

Crie `src/dominio/fluxo.ts`:

```ts
/**
 * Regras da tela de Fluxo (spec, seção 8.3).
 *
 * A janela de meses, o que cada mês é em relação a hoje, e o tamanho de cada
 * coluna. A direção da coluna (acima ou abaixo da linha do zero) é decisão de
 * desenho e fica na tela; o tamanho é decisão de dado e fica aqui.
 */

import { type Competencia, somarMeses } from './data';
import type { Centavos } from './dinheiro';

/** Spec, seção 8.3: "Seis meses para trás e seis para frente". */
export const MESES_PARA_TRAS = 6;
export const MESES_PARA_FRENTE = 6;

export type MomentoDoMes = 'PASSADO' | 'CORRENTE' | 'FUTURO';

export interface PontoDoFluxo {
  competencia: Competencia;
  momento: MomentoDoMes;
  /** Realizada num mês passado, considerada no corrente e nos futuros. */
  receitaCentavos: Centavos;
  /** Sempre `receitaCentavos - sobraCentavos`, para a tabela fechar. */
  despesaCentavos: Centavos;
  /** Realizada num mês passado, projetada no corrente e nos futuros. */
  sobraCentavos: Centavos;
}

export function janelaDeMeses(central: Competencia): Competencia[] {
  const meses: Competencia[] = [];
  for (let n = -MESES_PARA_TRAS; n <= MESES_PARA_FRENTE; n += 1) {
    meses.push(somarMeses(central, n));
  }
  return meses;
}

/** "YYYY-MM" compara lexicograficamente na mesma ordem que cronologicamente. */
export function momentoDoMes(
  mes: Competencia,
  mesCorrente: Competencia,
): MomentoDoMes {
  if (mes < mesCorrente) return 'PASSADO';
  if (mes > mesCorrente) return 'FUTURO';
  return 'CORRENTE';
}

/**
 * O maior módulo de sobra da janela — é o que define 100% de altura. O piso de
 * 1 existe só para que uma janela toda zerada não vire divisão por zero.
 */
export function escalaDoFluxo(pontos: PontoDoFluxo[]): Centavos {
  let maior = 0;
  for (const p of pontos) {
    maior = Math.max(maior, Math.abs(p.sobraCentavos));
  }
  return maior > 0 ? maior : 1;
}

/** Altura da coluna em 0..100. Só desenho: nunca ordena nem decide nada. */
export function alturaDaColuna(valor: Centavos, escala: Centavos): number {
  if (escala <= 0) return 0;
  return Math.min(100, (Math.abs(valor) / escala) * 100);
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run src/dominio/fluxo.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar a suíte e os tipos**

Run: `npx vitest run && npx tsc --noEmit`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add src/dominio/fluxo.ts src/dominio/fluxo.test.ts
git commit -m "feat(dominio): janela, momento e escala da tela de Fluxo"
```

---

## Task 5: Modelo de leitura de Fluxo

Treze meses de dados. A tentação é chamar `resumoDoMes` treze vezes — **não faça isso**: são cinco consultas cada, sessenta e cinco no total, para uma tela só. Este arquivo busca a janela inteira em **cinco consultas** e agrupa em memória.

**Files:**
- Create: `src/dados/fluxo.ts`
- Test: `src/dados/fluxo.test.ts`

**Interfaces:**
- Consumes: `despesaLiquida`, `gastoPorCategoria`, `receitaConsiderada`, `sobraProjetada`, `sobraRealizada`, `DespesaAgregavel`, `CreditoAgregavel` de `@/dominio/agregacao`; `alocacaoVigente` de `@/dominio/orcamento`; `Competencia`, `competenciaDe`, `dataCivilEm` de `@/dominio/data`; `PontoDoFluxo`, `escalaDoFluxo`, `janelaDeMeses`, `momentoDoMes` de `@/dominio/fluxo`.
- Produces:
  - `interface FluxoDeMeses { central: Competencia; escalaCentavos: number; pontos: PontoDoFluxo[] }`
  - `fluxoDeMeses(central: Competencia, cliente?: ClientePrisma): Promise<FluxoDeMeses>`

**Regra de qual número cada coluna mostra** (spec §7, a mesma que o herói do Painel já aplica desde o Plano 3):

| Momento | `receitaCentavos` | `sobraCentavos` |
|---|---|---|
| `PASSADO` | `receitaRealizada` | `sobraRealizada` |
| `CORRENTE` / `FUTURO` | `receitaConsiderada` | `sobraProjetada` |

E `despesaCentavos = receitaCentavos − sobraCentavos` **sempre**, para que a tabela feche em toda linha. Num mês passado isso dá exatamente a despesa líquida; num mês futuro dá o comprometido, `Σ máx(orçado, gasto)` — que é a despesa que aquele mês projeta.

**Sobre categorias arquivadas:** busque as categorias com `arquivada: false` para montar o mapa de orçamentos. Não é preciso mais nada: `sobraProjetada` já percorre a **união** das chaves de orçamento com as chaves de gasto (spec §7), então uma categoria arquivada que ainda teve gasto entra pelo lado dos gastos, com orçamento 0. É exatamente o que `resumoDoMes` calcula — e o teste de equivalência abaixo prova isso.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/dados/fluxo.test.ts`. Os dois testes de equivalência são o coração desta tarefa: eles comparam `fluxoDeMeses` com `resumoDoMes` **no mesmo mês**, então ambos leem exatamente as mesmas linhas do banco e a comparação vale seja qual for o dado real que já existe lá.

```ts
import { describe, expect, it } from 'vitest';

import { MESES_PARA_TRAS } from '@/dominio/fluxo';

import { arquivarCategoria, criarCategoria, criarSubcategoria } from './categorias';
import { fluxoDeMeses } from './fluxo';
import { criarLancamento } from './lancamentos';
import { definirAlocacao } from './orcamentos';
import { resumoDoMes } from './painel';
import { criarReceita, criarReceitaPrevista } from './receitas';
import { comRollback } from './rollback';
import type { ClientePrisma } from './tipos';

async function cenario(tx: ClientePrisma, mes: string) {
  const categoria = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
  const sub = await criarSubcategoria(
    { budgetCategoryId: categoria.id, nome: 'Mercado' },
    tx,
  );
  await definirAlocacao(
    { budgetCategoryId: categoria.id, vigenteDe: mes, valorCentavos: 120000 },
    tx,
  );
  return { categoria, sub };
}

async function gastar(
  tx: ClientePrisma,
  categoriaId: string,
  subcategoryId: string,
  data: string,
  valorCentavos: number,
) {
  await criarLancamento(
    {
      descricao: 'Gasto',
      valorCentavos,
      data,
      metodo: 'PIX',
      cardId: null,
      budgetCategoryId: categoriaId,
      subcategoryId,
      parcelas: 1,
      reembolsoAlvoCentavos: 0,
    },
    tx,
  );
}

describe('fluxoDeMeses', () => {
  it('devolve treze pontos com o central no meio, em ordem cronológica', async () => {
    await comRollback(async (tx) => {
      const fluxo = await fluxoDeMeses('2099-09', tx);

      expect(fluxo.pontos).toHaveLength(13);
      expect(fluxo.central).toBe('2099-09');
      expect(fluxo.pontos[MESES_PARA_TRAS].competencia).toBe('2099-09');
      expect(fluxo.pontos[0].competencia).toBe('2099-03');
      expect(fluxo.pontos[12].competencia).toBe('2100-03');
    });
  });

  it('o ponto central bate com resumoDoMes num mês futuro', async () => {
    await comRollback(async (tx) => {
      const c = await cenario(tx, '2099-09');
      await gastar(tx, c.categoria.id, c.sub.id, '2099-09-10', 45000);
      await criarReceitaPrevista(
        { competencia: '2099-09', descricao: 'Salário', valorCentavos: 500000 },
        tx,
      );

      const fluxo = await fluxoDeMeses('2099-09', tx);
      const resumo = await resumoDoMes('2099-09', tx);

      const central = fluxo.pontos[MESES_PARA_TRAS];
      expect(central.momento).toBe('FUTURO');
      expect(central.sobraCentavos).toBe(resumo.sobraProjetada);
      expect(central.receitaCentavos).toBe(resumo.receitaConsiderada);
    });
  });

  it('o ponto central bate com resumoDoMes num mês passado', async () => {
    await comRollback(async (tx) => {
      const c = await cenario(tx, '2020-01');
      await gastar(tx, c.categoria.id, c.sub.id, '2020-01-10', 45000);
      await criarReceita(
        {
          descricao: 'Salário',
          valorCentavos: 500000,
          data: '2020-01-05',
          metodo: 'PIX',
        },
        tx,
      );

      const fluxo = await fluxoDeMeses('2020-01', tx);
      const resumo = await resumoDoMes('2020-01', tx);

      const central = fluxo.pontos[MESES_PARA_TRAS];
      expect(central.momento).toBe('PASSADO');
      expect(central.sobraCentavos).toBe(resumo.sobraRealizada);
      expect(central.receitaCentavos).toBe(resumo.receitaRealizada);
      // Num mês passado a "despesa" da tabela é exatamente a despesa líquida.
      // Esta é a asserção que prova que a subtração não é só uma identidade
      // algébrica: ela bate com um número calculado por outro caminho.
      expect(central.despesaCentavos).toBe(resumo.despesaLiquida);
    });
  });

  it('categoria arquivada com gasto entra na projeção, igual ao resumoDoMes', async () => {
    await comRollback(async (tx) => {
      const c = await cenario(tx, '2099-09');
      await gastar(tx, c.categoria.id, c.sub.id, '2099-09-10', 45000);
      await arquivarCategoria(c.categoria.id, tx);

      const fluxo = await fluxoDeMeses('2099-09', tx);
      const resumo = await resumoDoMes('2099-09', tx);

      expect(fluxo.pontos[MESES_PARA_TRAS].sobraCentavos).toBe(resumo.sobraProjetada);
    });
  });

  // Guarda estrutural: hoje `despesaCentavos` é definido como a subtração, então
  // esta invariante é verdadeira por construção. Ela existe para o dia em que
  // alguém calcular a despesa por outro caminho — aí ela deixa de ser trivial.
  // A asserção que realmente confere o número é a de `despesaLiquida` acima.
  it('receita menos despesa é a sobra em todos os pontos', async () => {
    await comRollback(async (tx) => {
      const c = await cenario(tx, '2099-09');
      await gastar(tx, c.categoria.id, c.sub.id, '2099-09-10', 45000);
      await gastar(tx, c.categoria.id, c.sub.id, '2099-10-10', 200000);
      await criarReceitaPrevista(
        { competencia: '2099-09', descricao: 'Salário', valorCentavos: 500000 },
        tx,
      );

      const fluxo = await fluxoDeMeses('2099-09', tx);

      for (const p of fluxo.pontos) {
        expect(p.receitaCentavos - p.despesaCentavos).toBe(p.sobraCentavos);
      }
    });
  });

  it('classifica cada ponto como passado, corrente ou futuro em ordem', async () => {
    await comRollback(async (tx) => {
      const fluxo = await fluxoDeMeses('2099-09', tx);
      const momentos = fluxo.pontos.map((p) => p.momento);

      // Janela inteiramente no futuro: nenhum passado, nenhum corrente.
      expect(momentos.every((m) => m === 'FUTURO')).toBe(true);

      const passado = await fluxoDeMeses('2020-01', tx);
      expect(passado.pontos.every((p) => p.momento === 'PASSADO')).toBe(true);
    });
  });

  it('a escala é o maior módulo de sobra da janela', async () => {
    await comRollback(async (tx) => {
      const fluxo = await fluxoDeMeses('2099-09', tx);
      const maior = Math.max(...fluxo.pontos.map((p) => Math.abs(p.sobraCentavos)));

      expect(fluxo.escalaCentavos).toBe(maior > 0 ? maior : 1);
    });
  });

  it('rejeita competência fora do formato', async () => {
    await expect(fluxoDeMeses('2099/09')).rejects.toThrow('Competência inválida');
  });
});
```

> **Nota sobre `criarReceita`:** confira a assinatura exata em `src/dados/receitas.ts` antes de escrever o teste e ajuste os campos se divergirem. O que importa é criar uma `Transaction` de tipo `RECEITA` na competência do teste.

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/dados/fluxo.test.ts`
Expected: FAIL — `Cannot find module './fluxo'`.

- [ ] **Step 3: Implementar**

Crie `src/dados/fluxo.ts`:

```ts
import {
  type CreditoAgregavel,
  type DespesaAgregavel,
  despesaLiquida,
  gastoPorCategoria,
  receitaConsiderada,
  sobraProjetada,
  sobraRealizada,
} from '@/dominio/agregacao';
import { type Competencia, competenciaDe, dataCivilEm } from '@/dominio/data';
import {
  type PontoDoFluxo,
  escalaDoFluxo,
  janelaDeMeses,
  momentoDoMes,
} from '@/dominio/fluxo';
import { alocacaoVigente } from '@/dominio/orcamento';

import { prisma } from './prisma';
import type { ClientePrisma } from './tipos';

export interface FluxoDeMeses {
  central: Competencia;
  escalaCentavos: number;
  pontos: PontoDoFluxo[];
}

function validarCompetencia(c: Competencia): void {
  if (!/^\d{4}-\d{2}$/.test(c)) {
    throw new Error(`Competência inválida, esperado "YYYY-MM": ${c}`);
  }
}

function somar<T>(linhas: T[], valor: (linha: T) => number): number {
  return linhas.reduce((total, linha) => total + valor(linha), 0);
}

/**
 * Treze meses de sobra, em cinco consultas.
 *
 * Chamar `resumoDoMes` treze vezes daria sessenta e cinco consultas para uma
 * tela só; aqui a janela inteira é buscada de uma vez e agrupada em memória.
 * O cálculo é o mesmo — as funções de domínio são as mesmas — e os testes de
 * equivalência com `resumoDoMes` existem justamente para garantir que os dois
 * caminhos nunca divirjam.
 */
export async function fluxoDeMeses(
  central: Competencia,
  cliente: ClientePrisma = prisma,
): Promise<FluxoDeMeses> {
  validarCompetencia(central);

  const meses = janelaDeMeses(central);
  const mesCorrente = competenciaDe(dataCivilEm(new Date()));

  const [transacoes, creditos, receitas, previstas, categorias] = await Promise.all([
    cliente.transaction.findMany({
      where: { competencia: { in: meses }, tipo: 'DESPESA' },
      select: {
        competencia: true,
        budgetCategoryId: true,
        valorCentavos: true,
        status: true,
      },
    }),
    cliente.credito.findMany({
      where: { competenciaCredito: { in: meses } },
      select: {
        competenciaCredito: true,
        valorCentavos: true,
        transaction: { select: { budgetCategoryId: true } },
      },
    }),
    cliente.transaction.findMany({
      where: { competencia: { in: meses }, tipo: 'RECEITA' },
      select: { competencia: true, valorCentavos: true },
    }),
    cliente.expectedIncome.findMany({
      where: { competencia: { in: meses } },
      select: { competencia: true, valorCentavos: true },
    }),
    // A união com as categorias arquivadas que ainda têm gasto acontece dentro
    // de `sobraProjetada`, que percorre as chaves dos dois mapas (spec, seção 7).
    cliente.budgetCategory.findMany({
      where: { arquivada: false },
      select: {
        id: true,
        alocacoes: { select: { vigenteDe: true, valorCentavos: true } },
      },
    }),
  ]);

  const despesas: DespesaAgregavel[] = transacoes.map((t) => ({
    competencia: t.competencia,
    categoriaId: t.budgetCategoryId ?? '',
    valorCentavos: t.valorCentavos,
    cancelada: t.status === 'CANCELADA',
  }));

  const creditosAgregaveis: CreditoAgregavel[] = creditos.map((c) => ({
    competenciaCredito: c.competenciaCredito,
    categoriaId: c.transaction.budgetCategoryId ?? '',
    valorCentavos: c.valorCentavos,
  }));

  const pontos: PontoDoFluxo[] = meses.map((mes) => {
    const momento = momentoDoMes(mes, mesCorrente);
    const ehMesPassado = momento === 'PASSADO';

    const gastos = gastoPorCategoria(despesas, creditosAgregaveis, mes);
    const liquida = despesaLiquida(despesas, creditosAgregaveis, mes);

    const realizada = somar(
      receitas.filter((r) => r.competencia === mes),
      (r) => r.valorCentavos,
    );
    const prevista = somar(
      previstas.filter((p) => p.competencia === mes),
      (p) => p.valorCentavos,
    );

    const orcamentos = new Map(
      categorias.map((c) => [c.id, alocacaoVigente(c.alocacoes, mes)]),
    );

    const considerada = receitaConsiderada(prevista, realizada, ehMesPassado);

    const receitaCentavos = ehMesPassado ? realizada : considerada;
    const sobraCentavos = ehMesPassado
      ? sobraRealizada(realizada, liquida)
      : sobraProjetada(considerada, orcamentos, gastos);

    return {
      competencia: mes,
      momento,
      receitaCentavos,
      // Sempre a diferença, para que receita − despesa = sobra feche em toda
      // linha da tabela. Num mês passado é a despesa líquida; num mês futuro é
      // o comprometido, Σ máx(orçado, gasto).
      despesaCentavos: receitaCentavos - sobraCentavos,
      sobraCentavos,
    };
  });

  return { central, escalaCentavos: escalaDoFluxo(pontos), pontos };
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run src/dados/fluxo.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar a suíte e os tipos**

Run: `npx vitest run && npx tsc --noEmit`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add src/dados/fluxo.ts src/dados/fluxo.test.ts
git commit -m "feat(dados): modelo de leitura da tela de Fluxo em cinco consultas"
```

---

## Task 6: Paleta compartilhada e tela de Áreas

A paleta do spec §9 está copiada em `ajustes/page.tsx` e `orcamentos/page.tsx`. Esta tela seria a terceira cópia — extraia antes de copiar de novo.

**Files:**
- Create: `src/app/(app)/cores.ts`
- Create: `src/app/(app)/areas/page.tsx`
- Create: `src/app/(app)/areas/areas.module.css`
- Modify: `src/app/(app)/ajustes/page.tsx`
- Modify: `src/app/(app)/orcamentos/page.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `areasDoMes` de `@/dados/areas`; `competenciaDe`, `dataCivilEm`, `somarMeses` de `@/dominio/data`; `formatarBRL` de `@/dominio/dinheiro`.
- Produces: `CORES`, `CINZA`, `corDoSlot` em `src/app/(app)/cores.ts`.

- [ ] **Step 1: Extrair a paleta**

Crie `src/app/(app)/cores.ts`:

```ts
/**
 * Paleta do spec, seção 9 — validada para daltonismo nos dois temas.
 *
 * Seis slots, atribuídos por ENTIDADE (`BudgetCategory.corSlot`), nunca por
 * posição num ranking: filtrar não pode repintar as categorias remanescentes.
 * O que passa de seis cai em cinza.
 *
 * Três destes slots ficam abaixo de 3:1 de contraste no tema claro, o que
 * obriga rótulo textual visível em toda marca colorida.
 */
export const CORES: string[] = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
];

/** Cor do que não recebe cor própria: "Outras". */
export const CINZA = '#9ca3af';

/**
 * `null` é o balde "Outras". Slot fora de 1..6 também cai em cinza — o banco
 * garante a faixa, mas a tela não deve quebrar se algum dia não garantir.
 *
 * A checagem de faixa é explícita em vez de `?? CINZA` porque, sem
 * `noUncheckedIndexedAccess`, o TypeScript considera o índice sempre definido
 * e o `??` viraria código morto que ninguém percebe.
 */
export function corDoSlot(slot: number | null): string {
  if (slot === null || slot < 1 || slot > CORES.length) return CINZA;
  return CORES[slot - 1];
}
```

- [ ] **Step 2: Apontar as telas existentes para a paleta compartilhada**

Em `src/app/(app)/orcamentos/page.tsx`, remova a linha

```ts
/** Paleta do spec, seção 9 — validada para daltonismo nos dois temas. */
const CORES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
```

e some ao bloco de imports:

```ts
import { CORES } from '../cores';
```

Em `src/app/(app)/ajustes/page.tsx`, remova o array literal de seis cores declarado no topo e importe o mesmo `CORES` de `'../cores'`. O uso (`CORES[c.corSlot - 1]`) continua idêntico nos dois arquivos.

- [ ] **Step 3: Verificar que nada quebrou**

Run: `npx tsc --noEmit && npm run build`
Expected: compila limpo. Nenhum comportamento mudou — as cores são as mesmas.

- [ ] **Step 4: Commit da extração**

```bash
git add "src/app/(app)/cores.ts" "src/app/(app)/orcamentos/page.tsx" "src/app/(app)/ajustes/page.tsx"
git commit -m "refactor(ui): paleta do spec num módulo só"
```

- [ ] **Step 5: Escrever os estilos da tela**

Crie `src/app/(app)/areas/areas.module.css`:

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

.total {
  font-size: 22px;
  font-weight: 680;
  letter-spacing: -0.6px;
  font-variant-numeric: tabular-nums;
}

.totalRotulo {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: #9ca3af;
}

/* Camada 1: barra 100% empilhada. O respiro de 2px entre segmentos vem do
   `gap`, não de margem, para que as larguras percentuais continuem exatas. */
.barra {
  display: flex;
  gap: 2px;
  height: 34px;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 12px;
}

.segmento {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  text-decoration: none;
  overflow: hidden;
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}

.segmento:hover {
  filter: brightness(1.08);
}

.segmentoAtivo {
  outline: 2px solid #111827;
  outline-offset: -2px;
}

.legenda {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  margin-bottom: 8px;
}

.legendaItem {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #374151;
  text-decoration: none;
}

.legendaItem:hover {
  color: #111827;
}

.ponto {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  flex-shrink: 0;
}

.legendaValor {
  font-variant-numeric: tabular-nums;
  color: #6b7280;
}

.creditados {
  font-size: 12px;
  color: #6b7280;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 11px;
  margin-bottom: 18px;
}

.filtro {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  margin-bottom: 12px;
}

.limpar {
  color: #2a78d6;
  text-decoration: none;
}

.limpar:hover {
  text-decoration: underline;
}

.titulo {
  font-size: 13px;
  font-weight: 650;
  margin: 22px 0 10px;
}

/* Camada 2: ranking de subcategorias. */
.linha {
  position: relative;
  padding: 7px 0;
  border-bottom: 1px solid #f3f4f6;
}

.linhaTopo {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
  font-size: 13px;
}

.linhaNome {
  font-weight: 550;
  color: #111827;
}

.linhaOrcamento {
  font-size: 11px;
  color: #9ca3af;
  margin-left: 6px;
}

.linhaValor {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.linhaPercentual {
  font-size: 11px;
  color: #6b7280;
  margin-left: 6px;
}

.linhaTrilha {
  height: 7px;
  border-radius: 4px;
  background: #f3f4f6;
  margin-top: 5px;
  overflow: hidden;
}

.linhaPreenchimento {
  height: 100%;
  border-radius: 4px;
}

/* Detalhe do spec 8.2: aparece no hover ou no foco (teclado). No celular,
   onde não existe hover, ele fica sempre visível — ver a media query. */
.detalhe {
  display: none;
  font-size: 11px;
  color: #6b7280;
  margin-top: 5px;
  gap: 12px;
  flex-wrap: wrap;
}

.linha:hover .detalhe,
.linha:focus-within .detalhe {
  display: flex;
}

.outras {
  padding: 9px 0;
  font-size: 12.5px;
  color: #9ca3af;
}

.vazio {
  border: 1px dashed #d1d5db;
  border-radius: 10px;
  padding: 22px;
  text-align: center;
  color: #6b7280;
  font-size: 13px;
}

@media (max-width: 720px) {
  .detalhe {
    display: flex;
  }
}
```

- [ ] **Step 6: Escrever a tela**

Crie `src/app/(app)/areas/page.tsx`:

```tsx
import Link from 'next/link';

import { areasDoMes } from '@/dados/areas';
import { competenciaDe, dataCivilEm, somarMeses } from '@/dominio/data';
import { formatarBRL } from '@/dominio/dinheiro';

import { corDoSlot } from '../cores';
import estilos from './areas.module.css';

/** Abaixo disso o rótulo não cabe no segmento e vira só cor + legenda. */
const LARGURA_MINIMA_PARA_ROTULO = 12;

function porcentagem(valor: number): string {
  return `${valor.toFixed(1).replace('.', ',')}%`;
}

function comFiltro(mes: string, categoriaId: string | null): string {
  const busca = new URLSearchParams({ mes });
  if (categoriaId) busca.set('orcamento', categoriaId);
  return `/areas?${busca.toString()}`;
}

export default async function Areas({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; orcamento?: string }>;
}) {
  const { mes, orcamento } = await searchParams;
  const competencia = mes ?? competenciaDe(dataCivilEm(new Date()));
  const filtroPedido = orcamento ?? null;

  const areas = await areasDoMes(competencia, filtroPedido);

  return (
    <>
      <div className={estilos.cabecalho}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Áreas</h1>
        <div className={estilos.meses}>
          <Link
            href={comFiltro(somarMeses(competencia, -1), filtroPedido)}
            className={estilos.mesLink}
          >
            ‹ {somarMeses(competencia, -1)}
          </Link>
          <span className={estilos.mesAtual}>{competencia}</span>
          <Link
            href={comFiltro(somarMeses(competencia, 1), filtroPedido)}
            className={estilos.mesLink}
          >
            {somarMeses(competencia, 1)} ›
          </Link>
        </div>
      </div>

      {areas.composicao.segmentos.length === 0 ? (
        <div className={estilos.vazio}>
          Nenhum gasto em {competencia}. Registre um em{' '}
          <Link href="/lancamentos/novo">Lançamentos</Link>.
        </div>
      ) : (
        <>
          <div className={estilos.totalRotulo}>Total gasto no mês</div>
          <div className={estilos.total}>{formatarBRL(areas.totalCentavos)}</div>

          <div className={estilos.barra}>
            {areas.composicao.segmentos.map((s) => {
              const destino = s.categoriaId
                ? comFiltro(competencia, s.categoriaId)
                : comFiltro(competencia, null);
              const ativo = Boolean(s.categoriaId) && s.categoriaId === areas.filtro?.categoriaId;

              return (
                <Link
                  key={s.categoriaId || 'outras'}
                  href={destino}
                  title={`${s.nome} — ${formatarBRL(s.gastoCentavos)}`}
                  className={`${estilos.segmento} ${ativo ? estilos.segmentoAtivo : ''}`}
                  style={{
                    width: `${s.percentual}%`,
                    background: corDoSlot(s.corSlot),
                  }}
                >
                  {s.percentual >= LARGURA_MINIMA_PARA_ROTULO ? s.nome : ''}
                </Link>
              );
            })}
          </div>

          {/* A legenda carrega os valores absolutos por escrito: três slots da
              paleta clara não têm contraste suficiente para a cor sozinha
              identificar o segmento (spec, seção 9). */}
          <div className={estilos.legenda}>
            {areas.composicao.segmentos.map((s) => (
              <Link
                key={s.categoriaId || 'outras'}
                href={
                  s.categoriaId
                    ? comFiltro(competencia, s.categoriaId)
                    : comFiltro(competencia, null)
                }
                className={estilos.legendaItem}
              >
                <span
                  className={estilos.ponto}
                  style={{ background: corDoSlot(s.corSlot) }}
                />
                {s.nome}
                <span className={estilos.legendaValor}>
                  {formatarBRL(s.gastoCentavos)} · {porcentagem(s.percentual)}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {areas.composicao.creditados.length > 0 ? (
        <div className={estilos.creditados}>
          Fora da barra, por terem saldo de crédito no mês:{' '}
          {areas.composicao.creditados
            .map((c) => `${c.nome} (${formatarBRL(c.gastoCentavos)})`)
            .join(' · ')}
        </div>
      ) : null}

      {areas.filtro ? (
        <div className={estilos.filtro}>
          <span>
            Mostrando só as subcategorias de <b>{areas.filtro.nome}</b>
          </span>
          <Link href={comFiltro(competencia, null)} className={estilos.limpar}>
            limpar filtro
          </Link>
        </div>
      ) : null}

      <div className={estilos.titulo}>Subcategorias</div>

      {areas.ranking.linhas.length === 0 ? (
        <div className={estilos.vazio}>Nada a listar neste mês.</div>
      ) : (
        <div>
          {areas.ranking.linhas.map((l) => (
            <div key={l.subcategoriaId} className={estilos.linha} tabIndex={0}>
              <div className={estilos.linhaTopo}>
                <span>
                  <span className={estilos.linhaNome}>{l.nome}</span>
                  <span className={estilos.linhaOrcamento}>{l.nomeDoOrcamento}</span>
                </span>
                <span className={estilos.linhaValor}>
                  {formatarBRL(l.gastoCentavos)}
                  <span className={estilos.linhaPercentual}>
                    {porcentagem(l.percentualDoMes)}
                  </span>
                </span>
              </div>
              <div className={estilos.linhaTrilha}>
                <div
                  className={estilos.linhaPreenchimento}
                  style={{
                    width: `${Math.max(0, l.percentualDoMes)}%`,
                    background: corDoSlot(l.corSlot),
                  }}
                />
              </div>
              <div className={estilos.detalhe}>
                <span>{porcentagem(l.percentualDoMes)} do mês</span>
                <span>{porcentagem(l.percentualDoOrcamento)} de {l.nomeDoOrcamento}</span>
                <span>
                  {l.quantidade} lançamento{l.quantidade === 1 ? '' : 's'}
                </span>
                <span>maior: {formatarBRL(l.maiorLancamentoCentavos)}</span>
              </div>
            </div>
          ))}

          {areas.ranking.outras ? (
            <div className={estilos.outras}>
              Outras {areas.ranking.outras.quantidade} subcategorias ·{' '}
              {formatarBRL(areas.ranking.outras.gastoCentavos)} ·{' '}
              {porcentagem(areas.ranking.outras.percentualDoMes)} do mês
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 7: Somar o destino à navegação**

Em `src/app/(app)/layout.tsx`, no array `DESTINOS`, insira Áreas depois de Lançamentos:

```ts
const DESTINOS = [
  { href: '/', rotulo: 'Painel' },
  { href: '/orcamentos', rotulo: 'Orçamentos' },
  { href: '/lancamentos', rotulo: 'Lançamentos' },
  { href: '/areas', rotulo: 'Áreas' },
  { href: '/receitas', rotulo: 'Receitas' },
  { href: '/cartoes', rotulo: 'Cartões' },
  { href: '/ajustes', rotulo: 'Ajustes' },
];
```

- [ ] **Step 8: Verificar**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: tudo limpo, `/areas` entre as rotas compiladas.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(app)/areas" "src/app/(app)/layout.tsx"
git commit -m "feat(ui): tela de Áreas com composição por orçamento e ranking"
```

---

## Task 7: Tela de Fluxo

Treze colunas de sobra, paleta divergente, textura nos meses futuros, e a tabela por baixo.

**Files:**
- Create: `src/app/(app)/fluxo/page.tsx`
- Create: `src/app/(app)/fluxo/fluxo.module.css`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `fluxoDeMeses` de `@/dados/fluxo`; `alturaDaColuna` de `@/dominio/fluxo`; `competenciaDe`, `dataCivilEm`, `somarMeses` de `@/dominio/data`; `formatarBRL` de `@/dominio/dinheiro`.

**Regras de desenho que o spec §8.3 fixa:**
- Paleta divergente: **azul acima** da linha do zero, **vermelho abaixo**, **cinza no zero**. Nada de arco-íris, e o meio é neutro.
- Meses futuros recebem **textura diagonal**, para que projeção e realizado se distingam **sem depender de cor** — quem não enxerga a diferença de matiz ainda vê a listra.
- A tabela abaixo repete receita, despesa e sobra por mês, em texto: é ela que garante que nenhuma informação dependa só da cor (spec §9).

- [ ] **Step 1: Escrever os estilos**

Crie `src/app/(app)/fluxo/fluxo.module.css`:

```css
.cabecalho {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
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

.nota {
  font-size: 12px;
  color: #6b7280;
  margin: 0 0 16px;
}

.grafico {
  display: flex;
  align-items: stretch;
  gap: 4px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.coluna {
  flex: 1 1 0;
  min-width: 42px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Duas metades de altura fixa com a linha do zero entre elas: a barra positiva
   cresce para baixo dentro da metade de cima (ancorada no fundo), e a negativa
   para baixo a partir do topo da metade de baixo. */
.acima {
  height: 84px;
  width: 100%;
  display: flex;
  align-items: flex-end;
}

.abaixo {
  height: 84px;
  width: 100%;
  display: flex;
  align-items: flex-start;
}

.zero {
  height: 1px;
  width: 100%;
  background: #d1d5db;
}

.barra {
  width: 100%;
  border-radius: 3px 3px 0 0;
}

.barraNegativa {
  width: 100%;
  border-radius: 0 0 3px 3px;
}

/* Textura do mês futuro: distingue projeção de realizado sem usar cor.
   As listras vão por cima da cor de fundo da própria barra.

   ATENÇÃO: quem usa esta classe precisa aplicar a cor com `backgroundColor` no
   style inline, NUNCA com o atalho `background`. O atalho zera o
   `background-image` daqui, e a textura some sem erro nenhum — justamente o
   sinal que o spec (seção 8.3) exige que não dependa de cor. */
.projetado {
  background-image: repeating-linear-gradient(
    45deg,
    rgba(255, 255, 255, 0.55) 0,
    rgba(255, 255, 255, 0.55) 3px,
    transparent 3px,
    transparent 7px
  );
}

.corrente {
  outline: 2px solid #111827;
  outline-offset: 1px;
  border-radius: 4px;
}

.rotulo {
  font-size: 9.5px;
  color: #6b7280;
  margin-top: 5px;
  text-align: center;
  white-space: nowrap;
}

.legenda {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin: 16px 0 4px;
  font-size: 11.5px;
  color: #6b7280;
}

.legendaItem {
  display: flex;
  align-items: center;
  gap: 6px;
}

.amostra {
  width: 13px;
  height: 13px;
  border-radius: 3px;
  flex-shrink: 0;
}

.tabela {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  margin-top: 18px;
}

.tabela th {
  text-align: left;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #9ca3af;
  font-weight: 600;
  padding: 6px 8px;
  border-bottom: 1px solid #e5e7eb;
}

.tabela td {
  padding: 7px 8px;
  border-bottom: 1px solid #f3f4f6;
  font-variant-numeric: tabular-nums;
}

.numero {
  text-align: right;
}

.linhaCorrente {
  background: #f9fafb;
  font-weight: 600;
}

.marca {
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #9ca3af;
  margin-left: 6px;
}

.positivo {
  color: #2a78d6;
}

.negativo {
  color: #dc2626;
}
```

- [ ] **Step 2: Escrever a tela**

Crie `src/app/(app)/fluxo/page.tsx`:

```tsx
import Link from 'next/link';

import { fluxoDeMeses } from '@/dados/fluxo';
import { competenciaDe, dataCivilEm, somarMeses } from '@/dominio/data';
import { formatarBRL } from '@/dominio/dinheiro';
import { alturaDaColuna } from '@/dominio/fluxo';

import estilos from './fluxo.module.css';

/** Paleta divergente do spec, seção 8.3. O meio é neutro, nunca um matiz. */
const AZUL = '#2a78d6';
const VERMELHO = '#dc2626';
const NEUTRO = '#d1d5db';

function corDaSobra(valor: number): string {
  if (valor > 0) return AZUL;
  if (valor < 0) return VERMELHO;
  return NEUTRO;
}

const ROTULO_DO_MOMENTO = {
  PASSADO: 'realizado',
  CORRENTE: 'projeção do fechamento',
  FUTURO: 'projeção',
} as const;

export default async function Fluxo({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const competencia = mes ?? competenciaDe(dataCivilEm(new Date()));

  const fluxo = await fluxoDeMeses(competencia);

  return (
    <>
      <div className={estilos.cabecalho}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Fluxo</h1>
        <div className={estilos.meses}>
          <Link
            href={`/fluxo?mes=${somarMeses(competencia, -1)}`}
            className={estilos.mesLink}
          >
            ‹ {somarMeses(competencia, -1)}
          </Link>
          <span className={estilos.mesAtual}>{competencia}</span>
          <Link
            href={`/fluxo?mes=${somarMeses(competencia, 1)}`}
            className={estilos.mesLink}
          >
            {somarMeses(competencia, 1)} ›
          </Link>
        </div>
      </div>

      <p className={estilos.nota}>
        Seis meses para trás e seis para frente. Meses passados mostram o que de
        fato sobrou; o mês corrente e os futuros, a projeção do fechamento —
        listrados, para não se confundirem com o realizado.
      </p>

      <div className={estilos.grafico}>
        {fluxo.pontos.map((p) => {
          const altura = alturaDaColuna(p.sobraCentavos, fluxo.escalaCentavos);
          const cor = corDaSobra(p.sobraCentavos);
          const ehProjecao = p.momento !== 'PASSADO';
          const classeTextura = ehProjecao ? estilos.projetado : '';

          return (
            <div
              key={p.competencia}
              className={`${estilos.coluna} ${p.momento === 'CORRENTE' ? estilos.corrente : ''}`}
              title={`${p.competencia} · ${formatarBRL(p.sobraCentavos)} · ${ROTULO_DO_MOMENTO[p.momento]}`}
            >
              <div className={estilos.acima}>
                {p.sobraCentavos > 0 ? (
                  <div
                    className={`${estilos.barra} ${classeTextura}`}
                    style={{ height: `${altura}%`, backgroundColor: cor }}
                  />
                ) : null}
              </div>

              <div className={estilos.zero} />

              <div className={estilos.abaixo}>
                {p.sobraCentavos < 0 ? (
                  <div
                    className={`${estilos.barraNegativa} ${classeTextura}`}
                    style={{ height: `${altura}%`, backgroundColor: cor }}
                  />
                ) : null}
              </div>

              <div className={estilos.rotulo}>{p.competencia.slice(2)}</div>
            </div>
          );
        })}
      </div>

      <div className={estilos.legenda}>
        <span className={estilos.legendaItem}>
          <span className={estilos.amostra} style={{ backgroundColor: AZUL }} />
          sobra positiva
        </span>
        <span className={estilos.legendaItem}>
          <span className={estilos.amostra} style={{ backgroundColor: VERMELHO }} />
          sobra negativa
        </span>
        <span className={estilos.legendaItem}>
          <span
            className={`${estilos.amostra} ${estilos.projetado}`}
            style={{ backgroundColor: AZUL }}
          />
          projeção (listrado)
        </span>
      </div>

      <table className={estilos.tabela}>
        <thead>
          <tr>
            <th>Mês</th>
            <th className={estilos.numero}>Receita</th>
            <th className={estilos.numero}>Despesa</th>
            <th className={estilos.numero}>Sobra</th>
          </tr>
        </thead>
        <tbody>
          {fluxo.pontos.map((p) => (
            <tr
              key={p.competencia}
              className={p.momento === 'CORRENTE' ? estilos.linhaCorrente : ''}
            >
              <td>
                {p.competencia}
                <span className={estilos.marca}>{ROTULO_DO_MOMENTO[p.momento]}</span>
              </td>
              <td className={estilos.numero}>{formatarBRL(p.receitaCentavos)}</td>
              <td className={estilos.numero}>{formatarBRL(p.despesaCentavos)}</td>
              <td
                className={`${estilos.numero} ${p.sobraCentavos >= 0 ? estilos.positivo : estilos.negativo}`}
              >
                {formatarBRL(p.sobraCentavos)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
```

- [ ] **Step 3: Somar o destino à navegação**

Em `src/app/(app)/layout.tsx`, insira Fluxo depois de Áreas:

```ts
const DESTINOS = [
  { href: '/', rotulo: 'Painel' },
  { href: '/orcamentos', rotulo: 'Orçamentos' },
  { href: '/lancamentos', rotulo: 'Lançamentos' },
  { href: '/areas', rotulo: 'Áreas' },
  { href: '/fluxo', rotulo: 'Fluxo' },
  { href: '/receitas', rotulo: 'Receitas' },
  { href: '/cartoes', rotulo: 'Cartões' },
  { href: '/ajustes', rotulo: 'Ajustes' },
];
```

- [ ] **Step 4: Verificar**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: tudo limpo, `/fluxo` entre as rotas compiladas.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/fluxo" "src/app/(app)/layout.tsx"
git commit -m "feat(ui): tela de Fluxo com colunas divergentes e tabela mês a mês"
```

---

## Ao terminar

Este plano fecha as duas perguntas analíticas do spec: para onde o dinheiro foi neste mês, e como os meses se comparam entre si.

Antes de começar o Plano 5, confirme no navegador com sessão real:

- [ ] `npx vitest run` passa inteiro, `npx tsc --noEmit` e `npm run build` limpos
- [ ] Em **Áreas**, a barra ocupa a largura toda e a legenda mostra os mesmos valores dos segmentos
- [ ] Clicar num segmento filtra o ranking, e "limpar filtro" volta ao mês inteiro
- [ ] O percentual de uma subcategoria **não muda** ao aplicar o filtro — ele é sempre sobre o mês inteiro
- [ ] Passar o mouse numa linha do ranking revela contagem e maior lançamento; no celular esses números aparecem sempre
- [ ] Em **Fluxo**, os meses futuros aparecem listrados e os passados sólidos
- [ ] A sobra de um mês passado no Fluxo é **o mesmo número** que o Painel mostra ao navegar para aquele mês
- [ ] Na tabela do Fluxo, receita menos despesa dá exatamente a sobra em toda linha

**Fica para os planos seguintes:** reembolso e estorno na interface, a tela de Reembolsos, e a janela de faturas em `/cartoes` (Plano 5); despesas recorrentes e PWA (Plano 6).
