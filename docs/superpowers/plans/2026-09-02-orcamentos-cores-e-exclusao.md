# Orçamentos: Catálogo de Cores e Exclusão — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o seletor numérico de cor de orçamento por um catálogo visual (com detecção de slot já em uso e opção de cor personalizada), e ligar a exclusão (arquivamento) de orçamento a um botão real na interface, com popup de confirmação.

**Architecture:** Continua a separação em três camadas do resto do projeto. A resolução de cor (`corDaCategoria`, `hexValido`, `slotDisponivel`) é pura e move para `src/dominio/paleta.ts` — precisa estar em `dominio/` porque `src/dados/categorias.ts` passa a chamá-la para validar a escrita, e `dados/` nunca pode importar de `src/app/`. O antigo `src/app/(app)/cores.ts` vira um re-export fino, então nenhuma tela existente precisa trocar seu import de `CORES`/`corDoSlot`. `BudgetCategory` ganha um campo novo (`corPersonalizada`) e `corSlot` vira opcional — uma categoria usa exatamente um dos dois. Dois Client Components novos (o seletor de cor com alternância catálogo/personalizada, e o popup de confirmação de exclusão) são as únicas partes interativas — o resto continua Server Components puros, como em todo o app.

**Tech Stack:** Next.js 16 (App Router, Server Components + 2 Client Components pequenos), TypeScript strict, Prisma 6.19.3, Postgres (Neon), Vitest, CSS Modules, `<dialog>` nativo do HTML.

## Global Constraints

- Dinheiro é sempre **inteiro em centavos** — não se aplica diretamente a este plano (nenhuma tarefa aqui mexe em valor monetário), mas nenhuma tarefa deve introduzir ponto flutuante em cálculo de dinheiro em lugar nenhum.
- `src/dominio/` **não importa** Prisma, React, Next, nem faz I/O.
- `src/dados/` **não contém regra de negócio**: busca (ou grava) linhas e delega a decisão ao domínio.
- `src/app/` **não recalcula regra de domínio**.
- Toda função de `src/dados/` recebe `cliente: ClientePrisma = prisma` como último parâmetro.
- **Todo teste que escreve no banco roda dentro de `comRollback(async (tx) => {...})` e passa `tx`** — nunca o `prisma` nu. Os testes rodam contra o Postgres real, não há banco de teste separado.
- **`BudgetCategory.nome` é `@unique`.** Nomes de fixture novos não podem repetir os de outro arquivo de teste — confira com `grep -rn "nome: '" src/dados/*.test.ts` antes de escolher um nome novo.
- **Verificação já feita ao planejar, não precisa repetir**: nenhum teste existente cria duas categorias com o mesmo `corSlot` dentro do mesmo `it()`/`comRollback` — a nova regra de unicidade de slot (Task 3) não quebra nenhum teste hoje existente. Isso foi conferido programaticamente sobre todo `src/dados/*.test.ts` antes de escrever este plano.
- Cores validadas do spec original (seção 9) continuam exatamente as mesmas 6: `#2a78d6`, `#eb6834`, `#1baf7a`, `#eda100`, `#e87ba4`, `#008300`. Nenhum valor muda.
- Prisma fica pinado em `6.19.3` (sem `^`).
- TypeScript em modo strict; `npx vitest run`, `npx tsc --noEmit`, `npm run lint` e `npm run build` limpos ao fim de cada tarefa.

**Decisão de compatibilidade, importante para quem revisar:** os campos novos (`corPersonalizada`) adicionados às interfaces já existentes (`OrcamentoDoPainel`, `CardDoPainel`, `GastoDeOrcamento`, `SegmentoDaComposicao`, `EntradaDoRanking`, `OrcamentoDoMes`) são **opcionais** (`corPersonalizada?: string | null`), e `corSlot` só tem seu **tipo alargado** de `number` para `number | null` — nunca vira opcional nem muda de nome. Isso é deliberado: nenhum teste já existente nesses arquivos precisa ser tocado, porque um alargamento de tipo e um campo novo opcional nunca quebram uma atribuição ou chamada que já compilava. A única interface que muda de forma obrigatória é `NovaCategoria` (Task 3), e mesmo ali `corPersonalizada` é opcional — só `corSlot` continua obrigatório, exatamente como já é hoje, então toda chamada existente de `criarCategoria({ nome, corSlot: N }, tx)` continua funcionando sem alteração.

**Fora de escopo deste plano:** editar nome/cor de uma categoria já criada; reativar uma categoria arquivada pela interface; qualquer mudança em Subcategorias, Cartões ou Despesas Fixas.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/dominio/paleta.ts` | **Novo.** `CORES`, `CINZA`, `corDoSlot` (movidos de `src/app/(app)/cores.ts`), mais `hexValido`, `corDaCategoria`, `slotDisponivel`. |
| `src/app/(app)/cores.ts` | **Modificado.** Vira um re-export fino de `@/dominio/paleta` — nenhuma tela que já importa `CORES`/`corDoSlot` daqui precisa mudar. |
| `prisma/schema.prisma` | **Modificado.** `BudgetCategory.corSlot` vira `Int?`; ganha `corPersonalizada String?`. |
| `src/dados/categorias.ts` | **Modificado.** `criarCategoria` valida cor personalizada ou slot livre; nova `slotsEmUso`; `CategoriaComSubs` ganha o campo novo. |
| `src/app/(app)/ajustes/acoes.ts` | **Modificado.** `acaoCriarCategoria` passa a ler corSlot/corPersonalizada do formulário; nova `acaoExcluirCategoria`. |
| `src/app/(app)/ajustes/seletor-de-cor.tsx` | **Novo.** Client Component: catálogo de 6 cores + opção personalizada. |
| `src/app/(app)/ajustes/botao-excluir-categoria.tsx` | **Novo.** Client Component: botão + popup de confirmação (`<dialog>`). |
| `src/app/(app)/ajustes/page.tsx` | **Modificado.** Usa os dois componentes novos na seção Orçamentos. |
| `src/app/(app)/ajustes/ajustes.module.css` | **Modificado.** Estilos do catálogo, do seletor personalizado e do popup. |
| `src/dados/orcamentos.ts` | **Modificado.** `OrcamentoDoMes` ganha `corPersonalizada`; `corSlot` vira `number \| null`. |
| `src/dominio/painel.ts` | **Modificado.** `OrcamentoDoPainel` ganha `corPersonalizada`; `corSlot` vira `number \| null`. |
| `src/dados/painel.ts` | **Modificado.** `CardDoPainel` ganha `corPersonalizada`; propaga o campo nas duas construções de `OrcamentoDoPainel`. |
| `src/app/(app)/orcamentos/page.tsx` | **Modificado.** Usa `corDaCategoria` em vez de `CORES[o.corSlot - 1]`. |
| `src/dominio/areas.ts` | **Modificado.** `GastoDeOrcamento`, `SegmentoDaComposicao`, `EntradaDoRanking` ganham `corPersonalizada`. |
| `src/dados/areas.ts` | **Modificado.** Propaga `corPersonalizada` nas duas construções (`gastos`, `entradas`). |
| `src/app/(app)/areas/page.tsx` | **Modificado.** Usa `corDaCategoria` nos três lugares que hoje chamam `corDoSlot`. |

---

## Task 1: Domínio da paleta — move e estende

**Files:**
- Create: `src/dominio/paleta.ts`
- Test: `src/dominio/paleta.test.ts`
- Modify: `src/app/(app)/cores.ts`

**Interfaces:**
- Produces: `CORES: string[]`, `CINZA: string`, `corDoSlot(slot: number | null): string`, `hexValido(valor: string): boolean`, `CategoriaComCor { corSlot: number | null; corPersonalizada?: string | null }`, `corDaCategoria(categoria: CategoriaComCor): string`, `slotDisponivel(ocupados: number[], slot: number): boolean`.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/dominio/paleta.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { CORES, corDaCategoria, corDoSlot, hexValido, slotDisponivel } from './paleta';

describe('corDoSlot', () => {
  it('devolve a cor do slot pedido', () => {
    expect(corDoSlot(1)).toBe(CORES[0]);
    expect(corDoSlot(6)).toBe(CORES[5]);
  });

  it('cai em cinza para null ou fora de 1..6', () => {
    expect(corDoSlot(null)).toBe('#9ca3af');
    expect(corDoSlot(0)).toBe('#9ca3af');
    expect(corDoSlot(7)).toBe('#9ca3af');
  });
});

describe('hexValido', () => {
  it('aceita #rrggbb maiúsculo ou minúsculo', () => {
    expect(hexValido('#2a78d6')).toBe(true);
    expect(hexValido('#2A78D6')).toBe(true);
  });

  it('rejeita formato errado', () => {
    expect(hexValido('2a78d6')).toBe(false);
    expect(hexValido('#2a78')).toBe(false);
    expect(hexValido('#2a78d6ff')).toBe(false);
    expect(hexValido('#gggggg')).toBe(false);
    expect(hexValido('')).toBe(false);
  });
});

describe('corDaCategoria', () => {
  it('usa corPersonalizada quando presente, ignorando corSlot', () => {
    expect(corDaCategoria({ corSlot: 2, corPersonalizada: '#123456' })).toBe('#123456');
  });

  it('cai para corDoSlot quando corPersonalizada é nulo', () => {
    expect(corDaCategoria({ corSlot: 3, corPersonalizada: null })).toBe(CORES[2]);
  });

  it('cai para corDoSlot quando corPersonalizada é omitido', () => {
    expect(corDaCategoria({ corSlot: 3 })).toBe(CORES[2]);
  });

  it('cai em cinza quando não há slot nem personalizada', () => {
    expect(corDaCategoria({ corSlot: null, corPersonalizada: null })).toBe('#9ca3af');
  });
});

describe('slotDisponivel', () => {
  it('está livre quando nenhum ocupante usa o slot', () => {
    expect(slotDisponivel([1, 3, 5], 2)).toBe(true);
  });

  it('está ocupado quando algum ocupante usa o slot', () => {
    expect(slotDisponivel([1, 2, 3], 2)).toBe(false);
  });

  it('lista vazia deixa todo slot livre', () => {
    expect(slotDisponivel([], 1)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/dominio/paleta.test.ts`
Expected: FAIL — `Cannot find module './paleta'`.

- [ ] **Step 3: Implementar**

Crie `src/dominio/paleta.ts`:

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
 *
 * Cor personalizada (v2): uma categoria pode trocar o slot validado por
 * qualquer hex escolhido livremente. Essa cor não passa pela validação de
 * daltonismo do script — a garantia que resta é a mesma que já vale para toda
 * cor deste app: o nome da categoria sempre aparece em texto ao lado dela.
 */

export const CORES: string[] = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
];

/** Cor do que não recebe cor própria: "Outras", ou uma categoria sem cor definida. */
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

/** "#rrggbb", maiúsculo ou minúsculo — o formato que `<input type="color">` sempre produz. */
export function hexValido(valor: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(valor);
}

export interface CategoriaComCor {
  corSlot: number | null;
  corPersonalizada?: string | null;
}

/**
 * A cor final de uma categoria: personalizada tem prioridade sobre o slot.
 * `criarCategoria` (src/dados/categorias.ts) garante que uma categoria nunca
 * tem as duas coisas ao mesmo tempo, mas se algum dado legado tivesse,
 * personalizada vence — é a intenção mais recente do usuário.
 */
export function corDaCategoria(categoria: CategoriaComCor): string {
  return categoria.corPersonalizada ?? corDoSlot(categoria.corSlot);
}

/** Um slot está livre quando nenhuma categoria ativa (sem cor personalizada) já o usa. */
export function slotDisponivel(ocupados: number[], slot: number): boolean {
  return !ocupados.includes(slot);
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run src/dominio/paleta.test.ts`
Expected: PASS.

- [ ] **Step 5: Virar `cores.ts` num re-export**

Troque **todo** o conteúdo de `src/app/(app)/cores.ts` por:

```ts
export { CORES, CINZA, corDoSlot } from '@/dominio/paleta';
```

- [ ] **Step 6: Verificar a suíte e os tipos**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: tudo verde e limpo. Nenhuma tela quebra — `orcamentos/page.tsx`, `ajustes/page.tsx` e `areas/page.tsx` continuam importando `CORES`/`corDoSlot` de `'../cores'`, que agora só repassa.

- [ ] **Step 7: Commit**

```bash
git add src/dominio/paleta.ts src/dominio/paleta.test.ts "src/app/(app)/cores.ts"
git commit -m "refactor(dominio): move a paleta para dominio/, adiciona cor personalizada e slot livre"
```

---

## Task 2: Migração — `corPersonalizada` e `corSlot` opcional

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:** nenhuma — só schema e migração. Nenhum código de aplicação muda nesta tarefa.

- [ ] **Step 1: Editar o schema**

Em `prisma/schema.prisma`, ache o `model BudgetCategory` e troque a linha do `corSlot` e acrescente a nova, assim:

```prisma
model BudgetCategory {
  id          String              @id @default(cuid())
  nome        String              @unique
  ordem       Int
  /// 1..6 — slot da paleta categórica. Nulo quando `corPersonalizada` é usada.
  corSlot     Int?
  /// "#rrggbb" — cor livre escolhida pelo usuário. Nulo quando usa `corSlot`.
  corPersonalizada String?
  arquivada   Boolean             @default(false)
  subcategorias Subcategory[]
  alocacoes   BudgetAllocation[]
  transacoes  Transaction[]
  recorrentes RecurringExpense[]
}
```

(A única mudança real é `corSlot Int` → `corSlot Int?`, mais a linha nova de `corPersonalizada`. Todo o resto do model continua idêntico.)

- [ ] **Step 2: Gerar e aplicar a migração**

Run: `npx prisma migrate dev --name orcamento_cor_personalizada`
Expected: Prisma gera uma pasta nova em `prisma/migrations/` com um `ALTER TABLE "BudgetCategory" ALTER COLUMN "corSlot" DROP NOT NULL;` e um `ADD COLUMN "corPersonalizada" TEXT;` — ambas operações seguras sobre dados existentes (soltar `NOT NULL` nunca falha; somar coluna nula nunca falha). O comando já roda `prisma generate` sozinho ao final.

- [ ] **Step 3: Verificar**

Run: `npx vitest run && npx tsc --noEmit`
Expected: a suíte inteira continua passando (nenhum código de aplicação foi tocado ainda, então nada deveria ter mudado de comportamento). Se `tsc` reclamar de `corSlot` em algum lugar, é sinal de que uma tarefa seguinte precisa acontecer antes de prosseguir — pare e confirme que está executando as tarefas na ordem deste plano.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(dados): corPersonalizada e corSlot opcional em BudgetCategory"
```

---

## Task 3: Dados — criar categoria com cor validada, listar slots livres

**Files:**
- Modify: `src/dados/categorias.ts`
- Test: `src/dados/categorias.test.ts`

**Interfaces:**
- Consumes: `hexValido`, `slotDisponivel` de `@/dominio/paleta`.
- Produces:
  - `NovaCategoria { nome: string; corSlot: number | null; corPersonalizada?: string | null }`
  - `interface SlotOcupado { slot: number; categoriaNome: string }`
  - `slotsEmUso(cliente?): Promise<SlotOcupado[]>`
  - `CategoriaComSubs` ganha `corPersonalizada?: string | null`; `corSlot` vira `number | null`.
  - `criarCategoria(dados: NovaCategoria, cliente?): Promise<{ id: string }>` — assinatura muda de forma, mas toda chamada existente com `{ nome, corSlot: N }` continua válida (`corPersonalizada` é opcional).

**Regras que este arquivo fixa (todas testadas):**

1. **Exatamente um dos dois** — `corSlot` ou `corPersonalizada` — pode ser não-nulo. Nenhum dos dois, ou os dois ao mesmo tempo, é rejeitado.
2. **Um slot ocupado por outra categoria ativa é rejeitado** — a mesma checagem que a interface vai usar para desabilitar o botão (Task 4), repetida aqui como defesa em profundidade, porque a interface nunca é a única linha de defesa neste projeto.
3. **Cor personalizada precisa ser um hex válido** (`hexValido`).
4. `slotsEmUso` só conta categorias **ativas** e **sem** cor personalizada — uma categoria arquivada libera seu slot; uma com cor personalizada nunca ocupou slot nenhum.

- [ ] **Step 1: Escrever os testes que falham**

Adicione ao fim de `src/dados/categorias.test.ts` (some `slotsEmUso` ao `import` de `./categorias` que já existe no arquivo):

```ts
describe('criarCategoria — cor', () => {
  it('rejeita quando não informa nem slot nem personalizada', async () => {
    await comRollback(async (tx) => {
      await expect(
        criarCategoria({ nome: 'Sem cor', corSlot: null }, tx),
      ).rejects.toThrow('exatamente uma cor');
    });
  });

  it('rejeita quando informa slot e personalizada ao mesmo tempo', async () => {
    await comRollback(async (tx) => {
      await expect(
        criarCategoria(
          { nome: 'Duas cores', corSlot: 1, corPersonalizada: '#123456' },
          tx,
        ),
      ).rejects.toThrow('exatamente uma cor');
    });
  });

  it('rejeita cor personalizada em formato inválido', async () => {
    await comRollback(async (tx) => {
      await expect(
        criarCategoria(
          { nome: 'Cor ruim', corSlot: null, corPersonalizada: 'não é hex' },
          tx,
        ),
      ).rejects.toThrow('esperado "#rrggbb"');
    });
  });

  it('aceita cor personalizada válida e não ocupa slot nenhum', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarCategoria(
        { nome: 'Cor livre', corSlot: null, corPersonalizada: '#a1b2c3' },
        tx,
      );
      const lista = await listarCategorias(tx);
      const criada = lista.find((c) => c.id === id)!;
      expect(criada.corSlot).toBeNull();
      expect(criada.corPersonalizada).toBe('#a1b2c3');

      const ocupados = await slotsEmUso(tx);
      expect(ocupados).toEqual([]);
    });
  });

  it('rejeita slot já ocupado por outra categoria ativa', async () => {
    await comRollback(async (tx) => {
      await criarCategoria({ nome: 'Primeira do slot', corSlot: 4 }, tx);
      await expect(
        criarCategoria({ nome: 'Segunda do slot', corSlot: 4 }, tx),
      ).rejects.toThrow('já está em uso');
    });
  });

  it('libera o slot quando a categoria dona é arquivada', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarCategoria({ nome: 'Vai arquivar', corSlot: 5 }, tx);
      await arquivarCategoria(id, tx);

      // Não lança — o slot 5 está livre de novo.
      const { id: novoId } = await criarCategoria({ nome: 'Reusa o slot', corSlot: 5 }, tx);
      expect(novoId).toBeDefined();
    });
  });
});

describe('slotsEmUso', () => {
  it('lista os slots ocupados com o nome de quem ocupa', async () => {
    await comRollback(async (tx) => {
      const a = await criarCategoria({ nome: 'Ocupante A', corSlot: 1 }, tx);
      await criarCategoria({ nome: 'Ocupante B', corSlot: 3 }, tx);

      const ocupados = await slotsEmUso(tx);
      const doA = ocupados.find((o) => o.slot === 1);
      expect(doA).toEqual({ slot: 1, categoriaNome: 'Ocupante A' });
      expect(ocupados.some((o) => o.slot === 3)).toBe(true);
      expect(a.id).toBeDefined();
    });
  });

  it('não conta categoria com cor personalizada', async () => {
    await comRollback(async (tx) => {
      await criarCategoria(
        { nome: 'Personalizada', corSlot: null, corPersonalizada: '#000000' },
        tx,
      );
      const ocupados = await slotsEmUso(tx);
      expect(ocupados).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/dados/categorias.test.ts`
Expected: FAIL — `slotsEmUso is not a function`, e os testes de validação de cor falham porque `criarCategoria` ainda não aceita `corPersonalizada`.

- [ ] **Step 3: Implementar**

Em `src/dados/categorias.ts`, troque o import do topo:

```ts
import { hexValido, slotDisponivel } from '@/dominio/paleta';

import { prisma } from './prisma';
import type { ClientePrisma } from './tipos';
```

Troque a interface `CategoriaComSubs`:

```ts
export interface CategoriaComSubs {
  id: string;
  nome: string;
  ordem: number;
  corSlot: number | null;
  corPersonalizada: string | null;
  arquivada: boolean;
  subcategorias: Array<{ id: string; nome: string; arquivada: boolean }>;
}
```

Troque a função `listarCategorias` (só o `select`/`map` mudam, o resto é idêntico):

```ts
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
    corPersonalizada: c.corPersonalizada,
    arquivada: c.arquivada,
    subcategorias: c.subcategorias.map((s) => ({
      id: s.id,
      nome: s.nome,
      arquivada: s.arquivada,
    })),
  }));
}
```

Troque a interface e a função `criarCategoria` inteiras:

```ts
export interface NovaCategoria {
  nome: string;
  corSlot: number | null;
  corPersonalizada?: string | null;
}

export interface SlotOcupado {
  slot: number;
  categoriaNome: string;
}

/**
 * Quais dos 6 slots da paleta já pertencem a alguma categoria ativa. Uma
 * categoria arquivada libera seu slot; uma categoria com cor personalizada
 * nunca ocupou slot nenhum.
 */
export async function slotsEmUso(
  cliente: ClientePrisma = prisma,
): Promise<SlotOcupado[]> {
  const linhas = await cliente.budgetCategory.findMany({
    where: { arquivada: false, corPersonalizada: null },
    select: { corSlot: true, nome: true },
  });

  const ocupados: SlotOcupado[] = [];
  for (const l of linhas) {
    if (l.corSlot === null) continue;
    ocupados.push({ slot: l.corSlot, categoriaNome: l.nome });
  }
  return ocupados;
}

export async function criarCategoria(
  dados: NovaCategoria,
  cliente: ClientePrisma = prisma,
): Promise<{ id: string }> {
  const nome = nomeLimpo(dados.nome);
  const corPersonalizada = dados.corPersonalizada ?? null;

  const temSlot = dados.corSlot !== null;
  const temPersonalizada = corPersonalizada !== null;

  if (temSlot === temPersonalizada) {
    throw new Error(
      'Informe exatamente uma cor: um slot da paleta ou uma cor personalizada',
    );
  }

  if (temSlot) {
    if (
      !Number.isInteger(dados.corSlot) ||
      dados.corSlot! < COR_SLOT_MIN ||
      dados.corSlot! > COR_SLOT_MAX
    ) {
      throw new Error(
        `corSlot deve ser inteiro entre ${COR_SLOT_MIN} e ${COR_SLOT_MAX}: ${dados.corSlot}`,
      );
    }

    const ocupados = await slotsEmUso(cliente);
    if (!slotDisponivel(ocupados.map((o) => o.slot), dados.corSlot!)) {
      const ocupante = ocupados.find((o) => o.slot === dados.corSlot);
      throw new Error(
        `Slot ${dados.corSlot} já está em uso por "${ocupante?.categoriaNome}"`,
      );
    }
  }

  if (temPersonalizada && !hexValido(corPersonalizada!)) {
    throw new Error(
      `Cor personalizada inválida, esperado "#rrggbb": ${corPersonalizada}`,
    );
  }

  const ultima = await cliente.budgetCategory.findFirst({
    orderBy: { ordem: 'desc' },
    select: { ordem: true },
  });

  const criada = await cliente.budgetCategory.create({
    data: {
      nome,
      corSlot: dados.corSlot,
      corPersonalizada,
      ordem: (ultima?.ordem ?? 0) + 1,
    },
    select: { id: true },
  });

  return criada;
}
```

`arquivarCategoria` não muda — continua exatamente como está.

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run src/dados/categorias.test.ts`
Expected: PASS — incluindo os testes que já existiam no arquivo antes desta tarefa (prova de que `corSlot: N` sozinho, sem `corPersonalizada`, continua funcionando).

- [ ] **Step 5: Verificar a suíte inteira e os tipos**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: tudo verde e limpo. Nenhum outro arquivo de teste deveria quebrar — a verificação já feita ao planejar (ver Global Constraints) confirma que nenhum teste cria duas categorias com o mesmo `corSlot` dentro do mesmo `comRollback`.

- [ ] **Step 6: Commit**

```bash
git add src/dados/categorias.ts src/dados/categorias.test.ts
git commit -m "feat(dados): valida cor personalizada e unicidade de slot ao criar categoria"
```

---

## Task 4: Interface — catálogo de cores e exclusão de orçamento

A tarefa principal, do ponto de vista de quem usa o app. Dois Client Components pequenos e autocontidos — os únicos deste plano, e só o terceiro/quarto do projeto inteiro (depois de `formulario.tsx`, `estorno.tsx` e `offline-aviso.tsx`).

**Files:**
- Create: `src/app/(app)/ajustes/seletor-de-cor.tsx`
- Create: `src/app/(app)/ajustes/botao-excluir-categoria.tsx`
- Modify: `src/app/(app)/ajustes/acoes.ts`
- Modify: `src/app/(app)/ajustes/page.tsx`
- Modify: `src/app/(app)/ajustes/ajustes.module.css`

**Interfaces:**
- Consumes: `CORES` de `../cores` (re-export de `@/dominio/paleta`); `criarCategoria`, `slotsEmUso`, `arquivarCategoria`, `SlotOcupado` de `@/dados/categorias`.

- [ ] **Step 1: Somar os estilos**

Em `src/app/(app)/ajustes/ajustes.module.css`, acrescente ao fim (não remova nada que já existe):

```css
.catalogoCores {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.swatch {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
}

.swatch:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.swatchAtivo {
  border-color: #111827;
}

.swatchPersonalizada {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  border: 2px dashed #9ca3af;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: pointer;
  padding: 0;
  position: relative;
}

.seletorNativo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: none;
  padding: 0;
  cursor: pointer;
}

.avisoDaltonismo {
  font-size: 11px;
  color: #9ca3af;
  margin: 6px 0 0;
  max-width: 320px;
}

.botaoPerigo {
  background: none;
  border: none;
  padding: 0;
  font-size: 11px;
  color: #b91c1c;
  cursor: pointer;
  text-decoration: underline;
  font-family: inherit;
  margin-left: auto;
}

.dialogo {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 20px;
  max-width: 360px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
}

.dialogo::backdrop {
  background: rgba(0, 0, 0, 0.4);
}

.dialogoAviso {
  font-size: 12.5px;
  color: #6b7280;
  margin: 8px 0 16px;
}

.dialogoBotoes {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.botaoCancelar {
  background: none;
  border: 1px solid #d1d5db;
  border-radius: 7px;
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
}

.botaoConfirmarExclusao {
  background: #b91c1c;
  color: #fff;
  border: none;
  border-radius: 7px;
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
}
```

- [ ] **Step 2: Escrever o seletor de cor**

Crie `src/app/(app)/ajustes/seletor-de-cor.tsx`:

```tsx
'use client';

import { useState } from 'react';

import { CORES } from '../cores';
import estilos from './ajustes.module.css';

export interface SlotOcupadoProp {
  slot: number;
  categoriaNome: string;
}

/**
 * Catálogo visual das 6 cores validadas (spec original, seção 9), mais um
 * botão de cor personalizada. Só existe como Client Component porque alternar
 * entre "qual dos 6 slots" e "cor livre" é estado de interface pura — nenhum
 * dado de servidor entra nessa decisão.
 *
 * Os dois campos escondidos (`corSlot`, `corPersonalizada`) são o que o
 * formulário pai de fato envia: exatamente um deles carrega valor a cada
 * envio, o outro fica com string vazia — a Server Action converte string
 * vazia em `null`.
 */
export function SeletorDeCor({ ocupados }: { ocupados: SlotOcupadoProp[] }) {
  const primeiroLivre = CORES.findIndex(
    (_, i) => !ocupados.some((o) => o.slot === i + 1),
  );
  const [escolha, setEscolha] = useState<number | 'personalizada'>(
    primeiroLivre === -1 ? 'personalizada' : primeiroLivre + 1,
  );
  const [corHex, setCorHex] = useState('#2a78d6');

  return (
    <div className={estilos.campo}>
      <span className={estilos.rotulo}>Cor</span>
      <div className={estilos.catalogoCores}>
        {CORES.map((cor, i) => {
          const slot = i + 1;
          const ocupadoPor = ocupados.find((o) => o.slot === slot);
          return (
            <button
              key={slot}
              type="button"
              disabled={Boolean(ocupadoPor)}
              onClick={() => setEscolha(slot)}
              className={`${estilos.swatch} ${escolha === slot ? estilos.swatchAtivo : ''}`}
              style={{ background: cor }}
              title={ocupadoPor ? `Já usado por ${ocupadoPor.categoriaNome}` : cor}
              aria-label={ocupadoPor ? `Cor ${slot}, já usada por ${ocupadoPor.categoriaNome}` : `Cor ${slot}`}
            />
          );
        })}
        <button
          type="button"
          onClick={() => setEscolha('personalizada')}
          className={`${estilos.swatchPersonalizada} ${escolha === 'personalizada' ? estilos.swatchAtivo : ''}`}
          title="Cor personalizada"
          aria-label="Cor personalizada"
        >
          🎨
          <input
            type="color"
            value={corHex}
            onChange={(e) => {
              setCorHex(e.target.value);
              setEscolha('personalizada');
            }}
            className={estilos.seletorNativo}
            aria-label="Escolher cor personalizada"
          />
        </button>
      </div>

      {escolha === 'personalizada' ? (
        <p className={estilos.avisoDaltonismo}>
          Cores personalizadas não passam pela validação de daltonismo da
          paleta padrão — o nome do orçamento sempre aparece ao lado da cor.
        </p>
      ) : null}

      <input
        type="hidden"
        name="corSlot"
        value={escolha === 'personalizada' ? '' : escolha}
      />
      <input
        type="hidden"
        name="corPersonalizada"
        value={escolha === 'personalizada' ? corHex : ''}
      />
    </div>
  );
}
```

- [ ] **Step 3: Escrever o popup de exclusão**

Crie `src/app/(app)/ajustes/botao-excluir-categoria.tsx`:

```tsx
'use client';

import { useRef } from 'react';

import estilos from './ajustes.module.css';

/**
 * Botão + popup de confirmação, usando o elemento `<dialog>` nativo do HTML
 * (sem biblioteca nova). Só existe como Client Component porque abrir/fechar
 * um `<dialog>` via `.showModal()`/`.close()` exige uma referência de DOM —
 * o formulário de dentro do popup continua sendo uma Server Action comum.
 */
export function BotaoExcluirCategoria({
  categoriaId,
  categoriaNome,
  acao,
}: {
  categoriaId: string;
  categoriaNome: string;
  acao: (dadosForm: FormData) => Promise<void>;
}) {
  const dialogoRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className={estilos.botaoPerigo}
        onClick={() => dialogoRef.current?.showModal()}
      >
        excluir
      </button>
      <dialog ref={dialogoRef} className={estilos.dialogo}>
        <p>
          Excluir <strong>{categoriaNome}</strong>?
        </p>
        <p className={estilos.dialogoAviso}>
          Isso arquiva o orçamento: ele some de novas escolhas (novos
          lançamentos, novos orçamentos, novas despesas fixas), mas nenhum
          lançamento, alocação ou histórico já existente é apagado ou muda de
          valor.
        </p>
        <form action={acao} className={estilos.dialogoBotoes}>
          <input type="hidden" name="id" value={categoriaId} />
          <button
            type="button"
            className={estilos.botaoCancelar}
            onClick={() => dialogoRef.current?.close()}
          >
            Cancelar
          </button>
          <button type="submit" className={estilos.botaoConfirmarExclusao}>
            Confirmar exclusão
          </button>
        </form>
      </dialog>
    </>
  );
}
```

- [ ] **Step 4: Somar as Server Actions**

Em `src/app/(app)/ajustes/acoes.ts`, troque o import de `@/dados/categorias` (que hoje é `import { buscarSubcategoria, criarCategoria, criarSubcategoria } from '@/dados/categorias';`) por:

```ts
import {
  arquivarCategoria,
  buscarSubcategoria,
  criarCategoria,
  criarSubcategoria,
} from '@/dados/categorias';
```

Troque a função `acaoCriarCategoria` inteira:

```ts
export async function acaoCriarCategoria(dadosForm: FormData): Promise<void> {
  const corSlotBruto = String(dadosForm.get('corSlot') ?? '');
  const corPersonalizadaBruta = String(dadosForm.get('corPersonalizada') ?? '');

  await criarCategoria({
    nome: String(dadosForm.get('nome') ?? ''),
    corSlot: corSlotBruto ? Number(corSlotBruto) : null,
    corPersonalizada: corPersonalizadaBruta ? corPersonalizadaBruta : null,
  });
  revalidatePath('/ajustes');
}
```

Acrescente, ao fim do arquivo:

```ts
export async function acaoExcluirCategoria(dadosForm: FormData): Promise<void> {
  await arquivarCategoria(String(dadosForm.get('id') ?? ''));
  revalidatePath('/ajustes');
  // Toda tela que lista orçamentos ativos também precisa parar de oferecer
  // esta categoria como opção.
  revalidatePath('/');
  revalidatePath('/areas');
  revalidatePath('/orcamentos');
  revalidatePath('/lancamentos/novo');
}
```

- [ ] **Step 5: Usar os dois componentes na tela**

Em `src/app/(app)/ajustes/page.tsx`, troque os imports do topo:

```tsx
import { listarCategorias, slotsEmUso } from '@/dados/categorias';
import { listarCartoes } from '@/dados/cartoes';
import { listarRecorrentes } from '@/dados/recorrentes';
import { formatarBRL } from '@/dominio/dinheiro';
import { corDaCategoria } from '@/dominio/paleta';

import {
  acaoCriarCartao,
  acaoCriarCategoria,
  acaoCriarSubcategoria,
  acaoCriarRecorrencia,
  acaoEncerrarRecorrencia,
  acaoAlternarRecorrencia,
  acaoExcluirCategoria,
} from './acoes';
import { BotaoExcluirCategoria } from './botao-excluir-categoria';
import { SeletorDeCor } from './seletor-de-cor';
import estilos from './ajustes.module.css';
```

(Note que `import { CORES } from '../cores';` sai da lista — a criação de categoria não usa mais `CORES` diretamente, e a listagem passa a usar `corDaCategoria`.)

Troque a linha do `Promise.all` para buscar também os slots ocupados:

```tsx
  const [categorias, cartoes, recorrentes, ocupados] = await Promise.all([
    listarCategorias(),
    listarCartoes(),
    listarRecorrentes(),
    slotsEmUso(),
  ]);
```

Dentro do `<form action={acaoCriarCategoria} className={estilos.linha}>`, troque o bloco inteiro do campo de cor:

```tsx
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
          <SeletorDeCor ocupados={ocupados} />
          <button type="submit" className={estilos.botao}>
            Criar orçamento
          </button>
```

(Isto substitui o campo `<div className={estilos.campo}>` que continha o `<label htmlFor="cat-cor">Cor</label>` e o `<select id="cat-cor" name="corSlot">` — o `<select>` inteiro sai, dando lugar ao `<SeletorDeCor />`.)

Na listagem de categorias, troque o bloco do item:

```tsx
            categorias.map((c) => (
              <div key={c.id} className={estilos.item}>
                <span
                  className={estilos.cor}
                  style={{ background: corDaCategoria(c) }}
                />
                <strong>{c.nome}</strong>
                <span className={estilos.subs}>
                  {c.subcategorias.length === 0
                    ? 'sem subcategorias'
                    : c.subcategorias.map((s) => s.nome).join(' · ')}
                </span>
                <BotaoExcluirCategoria
                  categoriaId={c.id}
                  categoriaNome={c.nome}
                  acao={acaoExcluirCategoria}
                />
              </div>
            ))
```

- [ ] **Step 6: Verificar**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: tudo limpo.

Este passo não tem teste automatizado próprio (Server Component + Client Components de interação pura); a verificação manual do catálogo, da cor personalizada e do popup fica para o checklist do fim do plano.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/ajustes"
git commit -m "feat(ui): catálogo de cores com slot livre e exclusão de orçamento com confirmação"
```

---

## Task 5: Propaga `corPersonalizada` — Orçamentos e Painel

`corSlot` já é `number | null` desde a Task 2 (schema) e a Task 1 (domínio). Esta tarefa é mecânica: soma o campo novo, opcional, aos tipos que já carregam `corSlot`, e troca a única leitura direta de cor na tela de Orçamentos por `corDaCategoria`.

**Files:**
- Modify: `src/dados/orcamentos.ts`
- Modify: `src/dominio/painel.ts`
- Modify: `src/dados/painel.ts`
- Modify: `src/app/(app)/orcamentos/page.tsx`

**Interfaces:**
- Consumes: `corDaCategoria` de `@/dominio/paleta`.
- Produces: `OrcamentoDoMes.corPersonalizada?: string | null`; `OrcamentoDoPainel.corPersonalizada?: string | null`; `CardDoPainel.corPersonalizada?: string | null`.

**Por que o Painel (`src/app/(app)/page.tsx`) não muda:** os cards do Painel já colorem pelo **estado** do orçamento (estourado/ativo/concluído), nunca por `corSlot` — confirmado lendo o arquivo: nenhuma linha ali chama `corDoSlot`/`CORES[...]`. `OrcamentoDoPainel`/`CardDoPainel` carregam `corSlot` só como dado de passagem, sem nenhuma leitura downstream. Esta tarefa mantém esses tipos compilando (`corSlot: number | null` já herdado, `corPersonalizada` novo e opcional), sem tocar em nenhuma linha de `src/app/(app)/page.tsx`.

- [ ] **Step 1: `src/dados/orcamentos.ts`**

Troque a interface `OrcamentoDoMes`:

```ts
export interface OrcamentoDoMes {
  categoriaId: string;
  nome: string;
  corSlot: number | null;
  corPersonalizada?: string | null;
  valorCentavos: number;
  /**
   * Competência da linha que está valendo — igual a `mes` quando foi definida
   * ali, anterior quando é herdada, e `null` quando não há alocação nenhuma.
   */
  vigenteDe: Competencia | null;
}
```

Em `orcamentosDoMes`, troque o `select` da consulta:

```ts
    select: {
      id: true,
      nome: true,
      corSlot: true,
      corPersonalizada: true,
      alocacoes: { select: { vigenteDe: true, valorCentavos: true } },
    },
```

E o `map` que monta o retorno:

```ts
  return categorias.map((c) => ({
    categoriaId: c.id,
    nome: c.nome,
    corSlot: c.corSlot,
    corPersonalizada: c.corPersonalizada,
    valorCentavos: alocacaoVigente(c.alocacoes, mes),
    vigenteDe: origemDaAlocacao(c.alocacoes, mes),
  }));
```

- [ ] **Step 2: `src/dominio/painel.ts`**

Troque a interface `OrcamentoDoPainel`:

```ts
export interface OrcamentoDoPainel {
  categoriaId: string;
  nome: string;
  corSlot: number | null;
  corPersonalizada?: string | null;
  orcadoCentavos: Centavos;
  gastoCentavos: Centavos;
}
```

Nenhuma função deste arquivo muda — nenhuma delas lê `corSlot`/`corPersonalizada` para decidir nada.

- [ ] **Step 3: `src/dados/painel.ts`**

Troque a interface `CardDoPainel`:

```ts
export interface CardDoPainel {
  categoriaId: string;
  nome: string;
  corSlot: number | null;
  corPersonalizada?: string | null;
  orcadoCentavos: number;
  gastoCentavos: number;
  restanteCentavos: number;
  estado: EstadoOrcamento;
}
```

No `select` da consulta de `categoriasArquivadasComGasto`, acrescente `corPersonalizada: true`:

```ts
  const categoriasArquivadasComGasto = idsSoComGasto.length > 0
    ? await cliente.budgetCategory.findMany({
        where: { id: { in: idsSoComGasto } },
        select: { id: true, nome: true, corSlot: true, corPersonalizada: true },
      })
    : [];
```

Na construção de `doPainel`, os dois `.map(...)` ganham o campo novo:

```ts
  const doPainel: OrcamentoDoPainel[] = [
    ...orcamentos.map((o) => ({
      categoriaId: o.categoriaId,
      nome: o.nome,
      corSlot: o.corSlot,
      corPersonalizada: o.corPersonalizada,
      orcadoCentavos: o.valorCentavos,
      gastoCentavos: gastos.get(o.categoriaId) ?? 0,
    })),
    ...categoriasArquivadasComGasto.map((c) => ({
      categoriaId: c.id,
      nome: c.nome,
      corSlot: c.corSlot,
      corPersonalizada: c.corPersonalizada,
      orcadoCentavos: 0,
      gastoCentavos: gastos.get(c.id) ?? 0,
    })),
  ];
```

E a construção de `cards` (dentro do `return`) ganha o campo:

```ts
    cards: ordenarPorCriticidade(doPainel).map((o) => ({
      categoriaId: o.categoriaId,
      nome: o.nome,
      corSlot: o.corSlot,
      corPersonalizada: o.corPersonalizada,
      orcadoCentavos: o.orcadoCentavos,
      gastoCentavos: o.gastoCentavos,
      restanteCentavos: restanteDoOrcamento(o),
      estado: estadoDoOrcamento(o),
    })),
```

- [ ] **Step 4: `src/app/(app)/orcamentos/page.tsx`**

Troque o import de `'../cores'` por:

```tsx
import { corDaCategoria } from '@/dominio/paleta';
```

(Remove a linha `import { CORES } from '../cores';`.)

Troque a única leitura de cor:

```tsx
                  <span
                    className={estilos.cor}
                    style={{ background: corDaCategoria(o) }}
                  />
```

(Antes era `style={{ background: CORES[o.corSlot - 1] }}`.)

- [ ] **Step 5: Verificar**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: tudo limpo. Nenhum teste de `orcamentos.test.ts`, `painel.test.ts` ou `dominio/painel.test.ts` deveria quebrar — todos constroem seus fixtures com `corSlot: N` (um número real), e o alargamento de tipo para `number | null` aceita esses valores sem mudança nenhuma nos testes.

- [ ] **Step 6: Commit**

```bash
git add src/dados/orcamentos.ts src/dominio/painel.ts src/dados/painel.ts "src/app/(app)/orcamentos/page.tsx"
git commit -m "feat(dados,ui): propaga cor personalizada em Orçamentos e Painel"
```

---

## Task 6: Propaga `corPersonalizada` — Áreas

Mesmo espírito da Task 5, num read-model diferente.

**Files:**
- Modify: `src/dominio/areas.ts`
- Modify: `src/dados/areas.ts`
- Modify: `src/app/(app)/areas/page.tsx`

**Interfaces:**
- Consumes: `corDaCategoria` de `@/dominio/paleta`.
- Produces: `GastoDeOrcamento.corPersonalizada?: string | null`; `SegmentoDaComposicao.corPersonalizada?: string | null`; `EntradaDoRanking.corPersonalizada?: string | null` (e, por herança de `extends`, `LinhaDoRanking` ganha o campo automaticamente, sem precisar de mudança própria).

- [ ] **Step 1: `src/dominio/areas.ts`**

Troque a interface `GastoDeOrcamento`:

```ts
export interface GastoDeOrcamento {
  categoriaId: string;
  nome: string;
  corSlot: number | null;
  corPersonalizada?: string | null;
  /** Líquido do mês. Pode ser negativo depois de um estorno. */
  gastoCentavos: Centavos;
}
```

Troque a interface `SegmentoDaComposicao`:

```ts
export interface SegmentoDaComposicao {
  /** Vazio no segmento "Outras", que não é uma categoria. */
  categoriaId: string;
  nome: string;
  /** `null` marca o segmento cinza "Outras". */
  corSlot: number | null;
  corPersonalizada?: string | null;
  gastoCentavos: Centavos;
  percentual: number;
}
```

Dentro de `composicaoPorOrcamento`, o `.map(...)` que monta `segmentos` ganha o campo:

```ts
  const segmentos: SegmentoDaComposicao[] = coloridos.map((g) => ({
    categoriaId: g.categoriaId,
    nome: g.nome,
    corSlot: g.corSlot,
    corPersonalizada: g.corPersonalizada,
    gastoCentavos: g.gastoCentavos,
    percentual: percentual(g.gastoCentavos, totalCentavos),
  }));
```

O `push` do segmento "Outras" ganha o campo explicitamente nulo (não é uma categoria, nunca tem cor personalizada):

```ts
  if (excedentes.length > 0) {
    const soma = excedentes.reduce((s, g) => s + g.gastoCentavos, 0);
    segmentos.push({
      categoriaId: '',
      nome: `Outras ${excedentes.length}`,
      corSlot: null,
      corPersonalizada: null,
      gastoCentavos: soma,
      percentual: percentual(soma, totalCentavos),
    });
  }
```

Troque a interface `EntradaDoRanking`:

```ts
export interface EntradaDoRanking {
  subcategoriaId: string;
  nome: string;
  categoriaId: string;
  nomeDoOrcamento: string;
  /** Herdado do orçamento-pai — o spec (seção 9) proíbe cor nova para subcategoria. */
  corSlot: number | null;
  corPersonalizada?: string | null;
  gastoCentavos: Centavos;
  quantidade: number;
  maiorLancamentoCentavos: Centavos;
}
```

`LinhaDoRanking extends EntradaDoRanking` já herda o campo novo — nenhuma mudança própria necessária ali. `rankearSubcategorias` também não muda: ele espalha `...e` (o objeto `EntradaDoRanking` inteiro) para montar cada `LinhaDoRanking`, então o campo novo atravessa sozinho.

- [ ] **Step 2: `src/dados/areas.ts`**

No `Promise.all`, o `select` de `budgetCategory.findMany` ganha `corPersonalizada: true`:

```ts
    cliente.budgetCategory.findMany({
      select: { id: true, nome: true, corSlot: true, corPersonalizada: true },
    }),
```

No `for` que monta `gastos`, acrescente o campo:

```ts
  const gastos: GastoDeOrcamento[] = [];
  for (const [id, gastoCentavos] of porCategoria) {
    const categoria = nomeDaCategoria.get(id);
    if (!categoria) continue;
    gastos.push({
      categoriaId: id,
      nome: categoria.nome,
      corSlot: categoria.corSlot,
      corPersonalizada: categoria.corPersonalizada,
      gastoCentavos,
    });
  }
```

No `for` que monta `entradas` (o ranking), acrescente o campo — vem de `pai`, o orçamento-pai da subcategoria:

```ts
    entradas.push({
      subcategoriaId: sub.id,
      nome: sub.nome,
      categoriaId: sub.budgetCategoryId,
      nomeDoOrcamento: pai.nome,
      corSlot: pai.corSlot,
      corPersonalizada: pai.corPersonalizada,
      gastoCentavos: stats.gastoCentavos,
      quantidade: stats.quantidade,
      maiorLancamentoCentavos: stats.maiorLancamentoCentavos,
    });
```

- [ ] **Step 3: `src/app/(app)/areas/page.tsx`**

Troque o import de `'../cores'`:

```tsx
import { corDaCategoria } from '@/dominio/paleta';
```

(Remove a linha `import { corDoSlot } from '../cores';`.)

Troque as três chamadas de `corDoSlot(x)` por `corDaCategoria(x)`, mantendo tudo o mais idêntico:

1. Na barra de composição: `background: corDaCategoria(s)` (era `background: corDoSlot(s.corSlot)`).
2. Na legenda: `background: corDaCategoria(s)` (era `background: corDoSlot(s.corSlot)`).
3. Na trilha do ranking: `background: corDaCategoria(l)` (era `background: corDoSlot(l.corSlot)`).

- [ ] **Step 4: Verificar**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: tudo limpo. Nenhum teste de `areas.test.ts` ou `dominio/areas.test.ts` deveria quebrar, pelo mesmo motivo da Task 5 — os fixtures já existentes constroem `corSlot: N` com número real, que continua válido sob o tipo alargado.

- [ ] **Step 5: Commit**

```bash
git add src/dominio/areas.ts src/dados/areas.ts "src/app/(app)/areas/page.tsx"
git commit -m "feat(dados,ui): propaga cor personalizada em Áreas"
```

---

## Ao terminar

Antes de considerar esta v2 pronta, confirme no navegador com sessão real:

- [ ] `npx vitest run` passa inteiro, `npx tsc --noEmit`, `npm run lint` e `npm run build` limpos
- [ ] Em **Ajustes**, criar um orçamento mostra 6 blocos de cor de verdade (não números) mais um botão de cor personalizada
- [ ] Criar dois orçamentos e usar a mesma cor num deles faz o slot aparecer desabilitado no segundo, com o nome de quem já usa
- [ ] Escolher "cor personalizada" abre o seletor nativo do navegador e mostra o aviso sobre daltonismo
- [ ] Criar um orçamento com cor personalizada e conferir que a cor aparece certa na lista de Ajustes, em **Orçamentos** e em **Áreas**
- [ ] Clicar em "excluir" abre o popup de confirmação; "Cancelar" fecha sem mudar nada; "Confirmar exclusão" faz o orçamento sumir da lista de Ajustes, de Orçamentos, de Áreas e do seletor de categoria em Lançamentos — mas nenhum lançamento antigo dele desaparece
- [ ] Arquivar um orçamento e criar um novo reusando a mesma cor funciona (o slot foi liberado)

**Este plano é o primeiro sub-projeto da v2.** Próximos sub-projetos de visual/UX ficam para depois, cada um com seu próprio ciclo de brainstorm → spec → plano.
