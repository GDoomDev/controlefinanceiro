# Recorrentes e PWA — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os dois últimos pilares do spec — despesas fixas materializadas sob demanda, e o app instalável como PWA — e reestruturar a navegação para bater com o desenho original (quatro ícones + "Mais" no celular, botão flutuante de novo lançamento).

**Architecture:** Continua a separação em três camadas dos Planos 1–5. Despesas fixas ganham um módulo de domínio puro (vigência: uma recorrência vale ou não vale num mês) e uma camada de dados que materializa (idempotentemente) o lançamento do mês quando a tela é aberta — o mesmo espírito de "sob demanda" que `garantirFatura` já usa para faturas desde o Plano 2. O PWA usa as convenções nativas desta versão do Next.js (`app/manifest.ts`, gerado automaticamente) em vez de um `public/manifest.json` estático, e um service worker propositalmente burro: cacheia só uma página de aviso offline, nunca dados.

**Tech Stack:** Next.js 16 (App Router, Server Components + 1 Client Component para o aviso offline), TypeScript strict, Prisma 6.19.3, Postgres (Neon), Vitest, CSS Modules.

## Global Constraints

- Dinheiro é sempre **inteiro em centavos**. Ponto flutuante não aparece em nenhum ponto do domínio como valor monetário.
- Competência é sempre `"YYYY-MM"`; comparação entre competências é lexicográfica sobre a string zero-padded.
- Data civil é sempre `"YYYY-MM-DD"`. Um `Date` nunca cruza fronteira de persistência.
- Todo cálculo de mês/dia fixa o fuso em `America/Sao_Paulo` — sempre via `@/dominio/data`, nunca com `getMonth()`/`getDate()` direto.
- `src/dominio/` **não importa** Prisma, React, Next, nem faz I/O.
- `src/dados/` **não contém regra de negócio**: busca (ou grava) linhas e delega a decisão ao domínio.
- `src/app/` **não recalcula regra de domínio**.
- Toda função de `src/dados/` recebe `cliente: ClientePrisma = prisma` como último parâmetro.
- **Todo teste que escreve no banco roda dentro de `comRollback(async (tx) => {...})` e passa `tx`** — nunca o `prisma` nu. Os testes rodam contra o Postgres real, não há banco de teste separado.
- **`BudgetCategory.nome` e `Card.nome` são `@unique` no schema.** Nomes de fixture não podem repetir os de outro arquivo de teste — confira com `grep -rn "nome: '" src/dados/*.test.ts` antes de escolher um nome novo.
- **`(recorrenciaId, competencia)` é único** em `Transaction` — é essa unicidade que torna `materializarRecorrentes` idempotente via `createMany({ skipDuplicates: true })`, sem precisar checar existência antes.
- Métodos que não são `CREDITO` exigem `cardId` nulo; `CREDITO` exige `cardId` não nulo — a mesma regra que `criarLancamento` já impõe, imposta aqui também na camada de dados, nunca só confiada à interface.
- Prisma fica pinado em `6.19.3` (sem `^`).
- TypeScript em modo strict; `npx vitest run`, `npx tsc --noEmit`, `npm run lint` e `npm run build` limpos ao fim de cada tarefa.
- **Este projeto tem uma nota de AGENTS.md**: esta versão do Next.js pode ter convenções diferentes das que você já conhece. Antes de escrever qualquer código de `manifest`/`metadata`/`viewport` (Task 5), leia `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md` e `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md` primeiro — os exemplos deste plano já foram verificados contra esses arquivos, mas confirme antes de desviar deles.

**Decisão de escopo, feita ao planejar (documentada para quem revisar depois):** a materialização de recorrentes acontece explicitamente no Painel e em Lançamentos (as duas telas mais visitadas para "abrir um mês"), não dentro dos read-models de Áreas/Fluxo. Uma vez materializado, o lançamento é permanente no banco — não precisa ser "re-materializado" a cada tela. O caso residual (o usuário nunca visita Painel/Lançamentos de um mês futuro antes de olhar o Fluxo daquele mês) fica como limitação aceita: a projeção do Fluxo para aquele mês específico ficaria sem a despesa fixa até o mês ser aberto em uma das duas telas. Isso é proporcional ao peso deste plano (recorrentes é um de três pilares, não o único).

**Fora do escopo deste plano:** sincronização offline de dados (spec §11 exclui isso explicitamente — "aberto sem rede, o app exibe aviso claro em vez de aparentar ter salvo algo", nunca dados salvos de verdade offline).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/dominio/recorrencia.ts` | **Novo.** Puro: uma recorrência vale ou não num mês dado. |
| `src/dados/recorrentes.ts` | **Novo.** CRUD de despesas fixas + materialização idempotente do lançamento do mês. |
| `src/app/(app)/ajustes/page.tsx` | **Modificado.** Ganha a seção "Despesas fixas". |
| `src/app/(app)/ajustes/acoes.ts` | **Modificado.** Ganha as Server Actions de criar/encerrar/pausar/retomar. |
| `src/app/(app)/ajustes/ajustes.module.css` | **Modificado.** Duas classes novas para os controles de encerrar/pausar. |
| `src/app/(app)/page.tsx` | **Modificado.** Chama `materializarRecorrentes` antes de ler o resumo do mês. |
| `src/app/(app)/lancamentos/page.tsx` | **Modificado.** Idem. |
| `src/app/(app)/layout.tsx` | **Modificado.** `DESTINOS` vira `DESTINOS_PRINCIPAIS`/`DESTINOS_MAIS`, ganha o botão flutuante. |
| `src/app/(app)/navegacao.module.css` | **Modificado.** Classes para o botão flutuante e para esconder/mostrar destinos por breakpoint. |
| `src/app/(app)/mais/page.tsx` | **Novo.** Destino "Mais" do celular: os destinos secundários + conta/sair. |
| `src/app/(app)/mais/mais.module.css` | **Novo.** Estilos da tela. |
| `scripts/gerar-icones-pwa.mjs` | **Novo.** Script único (sem dependência nova) que gera os dois PNGs do manifest. |
| `public/icon-192.png`, `public/icon-512.png` | **Novos**, gerados pelo script acima. |
| `public/sw.js` | **Novo.** Service worker enxuto: só cacheia a página de aviso offline. |
| `public/offline.html` | **Novo.** Página estática de aviso, servida quando uma navegação falha por falta de rede. |
| `src/app/manifest.ts` | **Novo.** Convenção nativa do Next — gera `/manifest.webmanifest` e o `<link>` sozinho. |
| `src/app/layout.tsx` | **Modificado.** `metadata`/`viewport` reais, registro do service worker. |
| `src/app/(app)/offline-aviso.tsx` | **Novo.** Client Component: banner fixo quando `navigator.onLine` vira falso. |

---

## Task 1: Domínio da recorrência — vigência

Uma despesa fixa vale num mês quando está ativa, o mês não é anterior ao início, e (se houver fim) o mês não é posterior ao fim. Essa é a única decisão de negócio de todo o recurso — o resto é busca e gravação.

**Files:**
- Create: `src/dominio/recorrencia.ts`
- Test: `src/dominio/recorrencia.test.ts`

**Interfaces:**
- Consumes: `Competencia` de `@/dominio/data`.
- Produces: `VigenciaDaRecorrencia`, `vigenteNoMes`.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/dominio/recorrencia.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { type VigenciaDaRecorrencia, vigenteNoMes } from './recorrencia';

function recorrencia(overrides: Partial<VigenciaDaRecorrencia> = {}): VigenciaDaRecorrencia {
  return { ativa: true, inicio: '2026-01', fim: null, ...overrides };
}

describe('vigenteNoMes', () => {
  it('vale no mês do início', () => {
    expect(vigenteNoMes(recorrencia({ inicio: '2026-05' }), '2026-05')).toBe(true);
  });

  it('não vale antes do início', () => {
    expect(vigenteNoMes(recorrencia({ inicio: '2026-05' }), '2026-04')).toBe(false);
  });

  it('vale em qualquer mês depois do início quando não há fim', () => {
    expect(vigenteNoMes(recorrencia({ inicio: '2026-05', fim: null }), '2030-01')).toBe(true);
  });

  it('vale exatamente no mês do fim', () => {
    expect(
      vigenteNoMes(recorrencia({ inicio: '2026-01', fim: '2026-06' }), '2026-06'),
    ).toBe(true);
  });

  it('não vale depois do fim', () => {
    expect(
      vigenteNoMes(recorrencia({ inicio: '2026-01', fim: '2026-06' }), '2026-07'),
    ).toBe(false);
  });

  it('não vale quando está pausada, mesmo dentro da janela início/fim', () => {
    expect(
      vigenteNoMes(recorrencia({ ativa: false, inicio: '2026-01', fim: '2026-12' }), '2026-06'),
    ).toBe(false);
  });

  it('atravessa a virada de ano corretamente', () => {
    expect(
      vigenteNoMes(recorrencia({ inicio: '2026-11', fim: '2027-02' }), '2027-01'),
    ).toBe(true);
    expect(
      vigenteNoMes(recorrencia({ inicio: '2026-11', fim: '2027-02' }), '2027-03'),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/dominio/recorrencia.test.ts`
Expected: FAIL — `Cannot find module './recorrencia'`.

- [ ] **Step 3: Implementar**

Crie `src/dominio/recorrencia.ts`:

```ts
/**
 * Vigência de uma despesa fixa (spec, seção 13): materializada sob demanda,
 * mês a mês, enquanto a recorrência estiver ativa e dentro da janela
 * início/fim. Esta é a única decisão de negócio do recurso — o resto é
 * busca e gravação.
 */

import type { Competencia } from './data';

export interface VigenciaDaRecorrencia {
  ativa: boolean;
  /** "YYYY-MM" — primeiro mês em que a despesa vale. */
  inicio: Competencia;
  /** "YYYY-MM" — último mês em que a despesa vale, inclusive. `null` = sem fim marcado. */
  fim: Competencia | null;
}

/** "YYYY-MM" compara lexicograficamente na mesma ordem que cronologicamente. */
export function vigenteNoMes(r: VigenciaDaRecorrencia, mes: Competencia): boolean {
  if (!r.ativa) return false;
  if (mes < r.inicio) return false;
  if (r.fim !== null && mes > r.fim) return false;
  return true;
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run src/dominio/recorrencia.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar a suíte e os tipos**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: tudo verde e limpo.

- [ ] **Step 6: Commit**

```bash
git add src/dominio/recorrencia.ts src/dominio/recorrencia.test.ts
git commit -m "feat(dominio): vigência de despesa fixa por mês"
```

---

## Task 2: Dados das despesas fixas — CRUD e materialização

CRUD de `RecurringExpense`, mais a função que faz o trabalho de verdade: materializar, idempotentemente, o `Transaction` do mês para cada recorrência vigente.

**Files:**
- Create: `src/dados/recorrentes.ts`
- Test: `src/dados/recorrentes.test.ts`

**Interfaces:**
- Consumes: `vigenteNoMes`, `VigenciaDaRecorrencia` de `@/dominio/recorrencia`; `Competencia`, `diaSeguro`, `formatarDataCivil`, `partesDaCompetencia` de `@/dominio/data`; `MetodoPagamento` de `@/dominio/lancamento`; `garantirFatura` de `./faturas`; `prisma`, `ClientePrisma`.
- Produces:
  - `interface NovaRecorrencia { descricao, valorCentavos, diaDoMes, budgetCategoryId, subcategoryId, metodo, cardId: string | null, inicio: Competencia }`
  - `interface RecorrenciaListada { id, descricao, valorCentavos, diaDoMes, metodo, cardId, cartaoNome, categoriaNome, subcategoriaNome, inicio, fim, ativa }`
  - `criarRecorrencia(entrada: NovaRecorrencia, cliente?): Promise<{ id: string }>`
  - `listarRecorrentes(cliente?): Promise<RecorrenciaListada[]>`
  - `encerrarRecorrencia(id: string, fim: Competencia, cliente?): Promise<void>`
  - `pausarRecorrencia(id: string, cliente?): Promise<void>`
  - `retomarRecorrencia(id: string, cliente?): Promise<void>`
  - `materializarRecorrentes(competencia: Competencia, cliente?): Promise<{ criadas: number }>`

**Regras que este arquivo fixa (todas testadas):**

1. **A subcategoria deve pertencer ao orçamento informado** — mesma regra e mesma mensagem de erro que `criarLancamento` já usa (spec §3, hierarquia estrita).
2. **`CREDITO` exige `cardId`; os demais métodos gravam `cardId: null`**, mesmo que a entrada mande um cartão — imposto aqui, não confiado à interface.
3. **`materializarRecorrentes` não decide vigência sozinho** — busca todas as `RecurringExpense` e delega a cada uma para `vigenteNoMes`.
4. **O dia do lançamento usa `diaSeguro`**: `diaDoMes = 31` num mês de 30 dias vira o dia 30, nunca um erro nem um mês seguinte.
5. **A competência do lançamento materializado é exatamente o mês que está sendo aberto** — não é recalculada via `faturaDaCompra`/janela de fatura, mesmo para método `CREDITO`. A fatura daquele cartão naquela competência é apenas garantida (`garantirFatura`) para o lançamento poder se vincular a ela; a competência em si não é derivada da data civil como aconteceria numa compra avulsa. Isso é uma decisão de projeto (o spec não detalha o cruzamento recorrência↔fatura além de "materializadas sob demanda ao abrir o mês, com unicidade por (recorrenciaId, competencia)"): tratar a competência-alvo como dado de entrada, não como algo a redescobrir, mantém a materialização determinística e testável.
6. **Idempotência via `createMany({ skipDuplicates: true })`** sobre o índice único `(recorrenciaId, competencia)` — chamar duas vezes na mesma competência não duplica, sem precisar checar existência antes.
7. **`encerrarRecorrencia` rejeita `fim` anterior ao `inicio`.**

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/dados/recorrentes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { criarCartao } from './cartoes';
import { criarCategoria, criarSubcategoria } from './categorias';
import { totalDaFatura } from './faturas';
import {
  criarRecorrencia,
  encerrarRecorrencia,
  listarRecorrentes,
  materializarRecorrentes,
  pausarRecorrencia,
  retomarRecorrencia,
} from './recorrentes';
import { comRollback } from './rollback';
import type { ClientePrisma } from './tipos';

async function cenario(tx: ClientePrisma) {
  const categoria = await criarCategoria({ nome: 'Assinaturas', corSlot: 4 }, tx);
  const sub = await criarSubcategoria(
    { budgetCategoryId: categoria.id, nome: 'Streaming' },
    tx,
  );
  return { categoria, sub };
}

describe('criarRecorrencia', () => {
  it('cria e aparece na listagem, com os nomes de categoria/subcategoria', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);

      const { id } = await criarRecorrencia(
        {
          descricao: 'Streaming X',
          valorCentavos: 2990,
          diaDoMes: 10,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-01',
        },
        tx,
      );

      const lista = await listarRecorrentes(tx);
      const r = lista.find((x) => x.id === id)!;
      expect(r.descricao).toBe('Streaming X');
      expect(r.valorCentavos).toBe(2990);
      expect(r.categoriaNome).toBe('Assinaturas');
      expect(r.subcategoriaNome).toBe('Streaming');
      expect(r.cartaoNome).toBeNull();
      expect(r.ativa).toBe(true);
      expect(r.fim).toBeNull();
    });
  });

  it('rejeita descrição vazia', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);

      await expect(
        criarRecorrencia(
          {
            descricao: '   ',
            valorCentavos: 1000,
            diaDoMes: 5,
            budgetCategoryId: categoria.id,
            subcategoryId: sub.id,
            metodo: 'PIX',
            cardId: null,
            inicio: '2099-01',
          },
          tx,
        ),
      ).rejects.toThrow('Descrição não pode ser vazia');
    });
  });

  it('rejeita valor zero ou negativo', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);

      await expect(
        criarRecorrencia(
          {
            descricao: 'Teste',
            valorCentavos: 0,
            diaDoMes: 5,
            budgetCategoryId: categoria.id,
            subcategoryId: sub.id,
            metodo: 'PIX',
            cardId: null,
            inicio: '2099-01',
          },
          tx,
        ),
      ).rejects.toThrow('inteiro positivo');
    });
  });

  it('rejeita dia do mês fora de 1..31', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);

      await expect(
        criarRecorrencia(
          {
            descricao: 'Teste',
            valorCentavos: 1000,
            diaDoMes: 32,
            budgetCategoryId: categoria.id,
            subcategoryId: sub.id,
            metodo: 'PIX',
            cardId: null,
            inicio: '2099-01',
          },
          tx,
        ),
      ).rejects.toThrow('entre 1 e 31');
    });
  });

  it('rejeita subcategoria que pertence a outro orçamento', async () => {
    await comRollback(async (tx) => {
      const { categoria } = await cenario(tx);
      const outraCategoria = await criarCategoria({ nome: 'Lazer fixo', corSlot: 3 }, tx);
      const subDeOutra = await criarSubcategoria(
        { budgetCategoryId: outraCategoria.id, nome: 'Jogos' },
        tx,
      );

      await expect(
        criarRecorrencia(
          {
            descricao: 'Teste',
            valorCentavos: 1000,
            diaDoMes: 5,
            budgetCategoryId: categoria.id,
            subcategoryId: subDeOutra.id,
            metodo: 'PIX',
            cardId: null,
            inicio: '2099-01',
          },
          tx,
        ),
      ).rejects.toThrow('hierarquia é estrita');
    });
  });

  it('rejeita crédito sem cartão', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);

      await expect(
        criarRecorrencia(
          {
            descricao: 'Teste',
            valorCentavos: 1000,
            diaDoMes: 5,
            budgetCategoryId: categoria.id,
            subcategoryId: sub.id,
            metodo: 'CREDITO',
            cardId: null,
            inicio: '2099-01',
          },
          tx,
        ),
      ).rejects.toThrow('exige um cartão');
    });
  });

  it('zera cardId quando o método não é crédito, mesmo que a entrada mande um cartão', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const cartao = await criarCartao(
        { nome: 'Cartão das fixas', diaFechamento: 10, diaVencimento: 20 },
        tx,
      );

      const { id } = await criarRecorrencia(
        {
          descricao: 'Teste',
          valorCentavos: 1000,
          diaDoMes: 5,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: cartao.id,
          inicio: '2099-01',
        },
        tx,
      );

      const r = (await listarRecorrentes(tx)).find((x) => x.id === id)!;
      expect(r.cardId).toBeNull();
    });
  });

  it('rejeita competência de início em formato inválido', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);

      await expect(
        criarRecorrencia(
          {
            descricao: 'Teste',
            valorCentavos: 1000,
            diaDoMes: 5,
            budgetCategoryId: categoria.id,
            subcategoryId: sub.id,
            metodo: 'PIX',
            cardId: null,
            inicio: '2099/01',
          },
          tx,
        ),
      ).rejects.toThrow('Competência inválida');
    });
  });
});

describe('encerrarRecorrencia / pausarRecorrencia / retomarRecorrencia', () => {
  it('encerrarRecorrencia grava o fim', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const { id } = await criarRecorrencia(
        {
          descricao: 'Teste',
          valorCentavos: 1000,
          diaDoMes: 5,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-01',
        },
        tx,
      );

      await encerrarRecorrencia(id, '2099-06', tx);

      const r = (await listarRecorrentes(tx)).find((x) => x.id === id)!;
      expect(r.fim).toBe('2099-06');
    });
  });

  it('rejeita fim anterior ao início', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const { id } = await criarRecorrencia(
        {
          descricao: 'Teste',
          valorCentavos: 1000,
          diaDoMes: 5,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-06',
        },
        tx,
      );

      await expect(encerrarRecorrencia(id, '2099-01', tx)).rejects.toThrow(
        'não pode ser anterior ao início',
      );
    });
  });

  it('rejeita despesa fixa inexistente', async () => {
    await expect(encerrarRecorrencia('nao-existe', '2099-01')).rejects.toThrow(
      'não encontrada',
    );
  });

  it('pausar e retomar alternam ativa', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const { id } = await criarRecorrencia(
        {
          descricao: 'Teste',
          valorCentavos: 1000,
          diaDoMes: 5,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-01',
        },
        tx,
      );

      await pausarRecorrencia(id, tx);
      expect((await listarRecorrentes(tx)).find((x) => x.id === id)!.ativa).toBe(false);

      await retomarRecorrencia(id, tx);
      expect((await listarRecorrentes(tx)).find((x) => x.id === id)!.ativa).toBe(true);
    });
  });
});

describe('materializarRecorrentes', () => {
  it('cria o lançamento do mês vigente, vinculado à recorrência', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const { id } = await criarRecorrencia(
        {
          descricao: 'Streaming X',
          valorCentavos: 2990,
          diaDoMes: 10,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-01',
        },
        tx,
      );

      const resultado = await materializarRecorrentes('2099-03', tx);
      expect(resultado.criadas).toBe(1);

      const linha = await tx.transaction.findFirstOrThrow({
        where: { recorrenciaId: id, competencia: '2099-03' },
      });
      expect(linha.valorCentavos).toBe(2990);
      expect(linha.data).toBe('2099-03-10');
      expect(linha.tipo).toBe('DESPESA');
      expect(linha.status).toBe('ATIVA');
      expect(linha.parcelaNum).toBe(1);
      expect(linha.parcelaTotal).toBe(1);
    });
  });

  it('é idempotente: chamar duas vezes na mesma competência não duplica', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const { id } = await criarRecorrencia(
        {
          descricao: 'Streaming X',
          valorCentavos: 2990,
          diaDoMes: 10,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-01',
        },
        tx,
      );

      const primeira = await materializarRecorrentes('2099-03', tx);
      const segunda = await materializarRecorrentes('2099-03', tx);

      expect(primeira.criadas).toBe(1);
      expect(segunda.criadas).toBe(0);

      const linhas = await tx.transaction.findMany({
        where: { recorrenciaId: id, competencia: '2099-03' },
      });
      expect(linhas).toHaveLength(1);
    });
  });

  it('não materializa antes do início', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      await criarRecorrencia(
        {
          descricao: 'Teste',
          valorCentavos: 1000,
          diaDoMes: 5,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-06',
        },
        tx,
      );

      const resultado = await materializarRecorrentes('2099-05', tx);
      expect(resultado.criadas).toBe(0);
    });
  });

  it('não materializa depois do fim', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const { id } = await criarRecorrencia(
        {
          descricao: 'Teste',
          valorCentavos: 1000,
          diaDoMes: 5,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-01',
        },
        tx,
      );
      await encerrarRecorrencia(id, '2099-03', tx);

      const resultado = await materializarRecorrentes('2099-04', tx);
      expect(resultado.criadas).toBe(0);
    });
  });

  it('não materializa quando pausada', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const { id } = await criarRecorrencia(
        {
          descricao: 'Teste',
          valorCentavos: 1000,
          diaDoMes: 5,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-01',
        },
        tx,
      );
      await pausarRecorrencia(id, tx);

      const resultado = await materializarRecorrentes('2099-03', tx);
      expect(resultado.criadas).toBe(0);
    });
  });

  it('usa dia seguro quando diaDoMes não existe naquele mês', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const { id } = await criarRecorrencia(
        {
          descricao: 'Teste',
          valorCentavos: 1000,
          diaDoMes: 31,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-01',
        },
        tx,
      );

      // Abril de 2099 tem 30 dias.
      await materializarRecorrentes('2099-04', tx);

      const linha = await tx.transaction.findFirstOrThrow({
        where: { recorrenciaId: id, competencia: '2099-04' },
      });
      expect(linha.data).toBe('2099-04-30');
    });
  });

  it('crédito: garante a fatura do cartão naquela competência e vincula o lançamento a ela', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const cartao = await criarCartao(
        { nome: 'Cartão das fixas', diaFechamento: 10, diaVencimento: 20 },
        tx,
      );
      const { id } = await criarRecorrencia(
        {
          descricao: 'Streaming no crédito',
          valorCentavos: 3990,
          diaDoMes: 15,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'CREDITO',
          cardId: cartao.id,
          inicio: '2099-01',
        },
        tx,
      );

      await materializarRecorrentes('2099-03', tx);

      const linha = await tx.transaction.findFirstOrThrow({
        where: { recorrenciaId: id, competencia: '2099-03' },
        select: { invoiceId: true, cardId: true },
      });
      expect(linha.cardId).toBe(cartao.id);
      expect(linha.invoiceId).not.toBeNull();

      const fatura = await tx.invoice.findUniqueOrThrow({
        where: { id: linha.invoiceId! },
      });
      expect(fatura.competencia).toBe('2099-03');
      expect(await totalDaFatura(fatura.id, tx)).toBe(3990);
    });
  });

  it('materializa mais de uma recorrência vigente no mesmo mês', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      await criarRecorrencia(
        {
          descricao: 'Fixa 1',
          valorCentavos: 1000,
          diaDoMes: 5,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-01',
        },
        tx,
      );
      await criarRecorrencia(
        {
          descricao: 'Fixa 2',
          valorCentavos: 2000,
          diaDoMes: 15,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
          inicio: '2099-01',
        },
        tx,
      );

      const resultado = await materializarRecorrentes('2099-03', tx);
      expect(resultado.criadas).toBe(2);
    });
  });

  it('rejeita competência em formato inválido', async () => {
    await expect(materializarRecorrentes('2099/03')).rejects.toThrow(
      'Competência inválida',
    );
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/dados/recorrentes.test.ts`
Expected: FAIL — `Cannot find module './recorrentes'`.

- [ ] **Step 3: Implementar**

Crie `src/dados/recorrentes.ts`:

```ts
import {
  type Competencia,
  diaSeguro,
  formatarDataCivil,
  partesDaCompetencia,
} from '@/dominio/data';
import type { MetodoPagamento } from '@/dominio/lancamento';
import { vigenteNoMes } from '@/dominio/recorrencia';

import { garantirFatura } from './faturas';
import { prisma } from './prisma';
import type { ClientePrisma } from './tipos';

export interface NovaRecorrencia {
  descricao: string;
  valorCentavos: number;
  /** 1..31 — dia do mês em que a despesa é lançada. */
  diaDoMes: number;
  budgetCategoryId: string;
  subcategoryId: string;
  metodo: MetodoPagamento;
  cardId: string | null;
  /** "YYYY-MM" — primeira competência em que a despesa vale. */
  inicio: Competencia;
}

export interface RecorrenciaListada {
  id: string;
  descricao: string;
  valorCentavos: number;
  diaDoMes: number;
  metodo: MetodoPagamento;
  cardId: string | null;
  cartaoNome: string | null;
  categoriaNome: string;
  subcategoriaNome: string;
  inicio: Competencia;
  fim: Competencia | null;
  ativa: boolean;
}

function validarCompetencia(c: Competencia): void {
  if (!/^\d{4}-\d{2}$/.test(c)) {
    throw new Error(`Competência inválida, esperado "YYYY-MM": ${c}`);
  }
}

export async function criarRecorrencia(
  entrada: NovaRecorrencia,
  cliente: ClientePrisma = prisma,
): Promise<{ id: string }> {
  const descricao = entrada.descricao.trim();
  if (descricao.length === 0) {
    throw new Error('Descrição não pode ser vazia');
  }
  if (!Number.isInteger(entrada.valorCentavos) || entrada.valorCentavos <= 0) {
    throw new Error(
      `Valor deve ser inteiro positivo em centavos: ${entrada.valorCentavos}`,
    );
  }
  if (!Number.isInteger(entrada.diaDoMes) || entrada.diaDoMes < 1 || entrada.diaDoMes > 31) {
    throw new Error(`Dia do mês deve ser inteiro entre 1 e 31: ${entrada.diaDoMes}`);
  }
  validarCompetencia(entrada.inicio);

  // Regra de integridade do spec, seção 3: a subcategoria tem de pertencer ao
  // orçamento informado — o banco só barraria um id inexistente, não a
  // combinação trocada.
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

  if (entrada.metodo === 'CREDITO' && !entrada.cardId) {
    throw new Error('Despesa fixa no crédito exige um cartão');
  }

  return cliente.recurringExpense.create({
    data: {
      descricao,
      valorCentavos: entrada.valorCentavos,
      diaDoMes: entrada.diaDoMes,
      budgetCategoryId: entrada.budgetCategoryId,
      subcategoryId: entrada.subcategoryId,
      metodo: entrada.metodo,
      // Métodos que não são crédito exigem cardId nulo (mesma regra do
      // lançamento avulso, spec seção 3) — imposto aqui, não só na interface.
      cardId: entrada.metodo === 'CREDITO' ? entrada.cardId : null,
      inicio: entrada.inicio,
    },
    select: { id: true },
  });
}

export async function listarRecorrentes(
  cliente: ClientePrisma = prisma,
): Promise<RecorrenciaListada[]> {
  const linhas = await cliente.recurringExpense.findMany({
    orderBy: { descricao: 'asc' },
    select: {
      id: true,
      descricao: true,
      valorCentavos: true,
      diaDoMes: true,
      metodo: true,
      cardId: true,
      inicio: true,
      fim: true,
      ativa: true,
      budgetCategory: { select: { nome: true } },
      subcategory: { select: { nome: true } },
      card: { select: { nome: true } },
    },
  });

  return linhas.map((r) => ({
    id: r.id,
    descricao: r.descricao,
    valorCentavos: r.valorCentavos,
    diaDoMes: r.diaDoMes,
    metodo: r.metodo,
    cardId: r.cardId,
    cartaoNome: r.card?.nome ?? null,
    categoriaNome: r.budgetCategory.nome,
    subcategoriaNome: r.subcategory.nome,
    inicio: r.inicio,
    fim: r.fim,
    ativa: r.ativa,
  }));
}

export async function encerrarRecorrencia(
  id: string,
  fim: Competencia,
  cliente: ClientePrisma = prisma,
): Promise<void> {
  validarCompetencia(fim);

  const recorrencia = await cliente.recurringExpense.findUnique({
    where: { id },
    select: { inicio: true },
  });
  if (!recorrencia) {
    throw new Error(`Despesa fixa não encontrada: ${id}`);
  }
  if (fim < recorrencia.inicio) {
    throw new Error(`Fim (${fim}) não pode ser anterior ao início (${recorrencia.inicio})`);
  }

  await cliente.recurringExpense.update({ where: { id }, data: { fim } });
}

export async function pausarRecorrencia(
  id: string,
  cliente: ClientePrisma = prisma,
): Promise<void> {
  await cliente.recurringExpense.update({ where: { id }, data: { ativa: false } });
}

export async function retomarRecorrencia(
  id: string,
  cliente: ClientePrisma = prisma,
): Promise<void> {
  await cliente.recurringExpense.update({ where: { id }, data: { ativa: true } });
}

/**
 * Materializa, se ainda não existirem, os lançamentos das despesas fixas
 * vigentes naquele mês (spec, seção 13). Idempotente: a unicidade em banco
 * por (recorrenciaId, competencia) faz o `createMany` da mesma competência
 * nunca duplicar — chamar de novo é sempre seguro.
 *
 * A competência do lançamento é a competência pedida, sem recálculo via
 * janela de fatura — só a fatura daquele cartão naquele mês é garantida
 * (`garantirFatura`), para o lançamento ter onde se vincular.
 */
export async function materializarRecorrentes(
  competencia: Competencia,
  cliente: ClientePrisma = prisma,
): Promise<{ criadas: number }> {
  validarCompetencia(competencia);

  const todas = await cliente.recurringExpense.findMany({
    select: {
      id: true,
      descricao: true,
      valorCentavos: true,
      diaDoMes: true,
      budgetCategoryId: true,
      subcategoryId: true,
      metodo: true,
      cardId: true,
      inicio: true,
      fim: true,
      ativa: true,
    },
  });

  const vigentes = todas.filter((r) => vigenteNoMes(r, competencia));
  if (vigentes.length === 0) {
    return { criadas: 0 };
  }

  const { ano, mes } = partesDaCompetencia(competencia);

  const linhas = await Promise.all(
    vigentes.map(async (r) => {
      const dia = diaSeguro(r.diaDoMes, ano, mes);
      const invoiceId =
        r.metodo === 'CREDITO' && r.cardId
          ? (await garantirFatura(r.cardId, competencia, cliente)).id
          : null;

      return {
        tipo: 'DESPESA' as const,
        descricao: r.descricao,
        valorCentavos: r.valorCentavos,
        data: formatarDataCivil({ ano, mes, dia }),
        metodo: r.metodo,
        cardId: r.metodo === 'CREDITO' ? r.cardId : null,
        invoiceId,
        budgetCategoryId: r.budgetCategoryId,
        subcategoryId: r.subcategoryId,
        competencia,
        reembolsoAlvoCentavos: 0,
        parcelaNum: 1,
        parcelaTotal: 1,
        recorrenciaId: r.id,
      };
    }),
  );

  const resultado = await cliente.transaction.createMany({
    data: linhas,
    skipDuplicates: true,
  });

  return { criadas: resultado.count };
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run src/dados/recorrentes.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar a suíte e os tipos**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: tudo verde e limpo.

- [ ] **Step 6: Commit**

```bash
git add src/dados/recorrentes.ts src/dados/recorrentes.test.ts
git commit -m "feat(dados): CRUD de despesas fixas e materialização idempotente"
```

---

## Task 3: Tela de Ajustes ganha "Despesas fixas", e o mês passa a se materializar

A seção nova em Ajustes cria, lista, encerra e pausa/retoma despesas fixas. Painel e Lançamentos passam a chamar `materializarRecorrentes` antes de ler os dados do mês.

**Files:**
- Modify: `src/app/(app)/ajustes/page.tsx`
- Modify: `src/app/(app)/ajustes/acoes.ts`
- Modify: `src/app/(app)/ajustes/ajustes.module.css`
- Modify: `src/app/(app)/page.tsx`
- Modify: `src/app/(app)/lancamentos/page.tsx`

**Interfaces:**
- Consumes: `criarRecorrencia`, `listarRecorrentes`, `encerrarRecorrencia`, `pausarRecorrencia`, `retomarRecorrencia`, `materializarRecorrentes` de `@/dados/recorrentes`; `listarCategorias` de `@/dados/categorias` (já usado); `listarCartoes` de `@/dados/cartoes` (já usado); `emCentavos` de `@/dominio/dinheiro`.

- [ ] **Step 1: Somar as Server Actions**

Em `src/app/(app)/ajustes/acoes.ts`, adicione ao topo do arquivo (mantendo os imports e funções que já existem):

```ts
import { emCentavos } from '@/dominio/dinheiro';
import type { MetodoPagamento } from '@/dominio/lancamento';
import {
  criarRecorrencia,
  encerrarRecorrencia,
  pausarRecorrencia,
  retomarRecorrencia,
} from '@/dados/recorrentes';
```

E ao fim do arquivo:

```ts
export async function acaoCriarRecorrencia(dadosForm: FormData): Promise<void> {
  const metodo = String(dadosForm.get('metodo') ?? 'PIX') as MetodoPagamento;
  const cardIdBruto = String(dadosForm.get('cardId') ?? '');

  await criarRecorrencia({
    descricao: String(dadosForm.get('descricao') ?? ''),
    valorCentavos: emCentavos(Number(dadosForm.get('valor') ?? 0)),
    diaDoMes: Number(dadosForm.get('diaDoMes')),
    budgetCategoryId: String(dadosForm.get('budgetCategoryId') ?? ''),
    subcategoryId: String(dadosForm.get('subcategoryId') ?? ''),
    metodo,
    cardId: metodo === 'CREDITO' && cardIdBruto ? cardIdBruto : null,
    inicio: String(dadosForm.get('inicio') ?? ''),
  });
  revalidatePath('/ajustes');
}

export async function acaoEncerrarRecorrencia(dadosForm: FormData): Promise<void> {
  await encerrarRecorrencia(
    String(dadosForm.get('id') ?? ''),
    String(dadosForm.get('fim') ?? ''),
  );
  revalidatePath('/ajustes');
}

export async function acaoAlternarRecorrencia(dadosForm: FormData): Promise<void> {
  const id = String(dadosForm.get('id') ?? '');
  // O campo carrega o estado ATUAL (antes deste clique): se estava ativa,
  // este clique pausa; se estava pausada, este clique retoma.
  const estavaAtiva = dadosForm.get('ativa') === '1';
  if (estavaAtiva) {
    await pausarRecorrencia(id);
  } else {
    await retomarRecorrencia(id);
  }
  revalidatePath('/ajustes');
}
```

- [ ] **Step 2: Somar os estilos**

Em `src/app/(app)/ajustes/ajustes.module.css`, acrescente ao fim:

```css
.recorrenciaTopo {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  width: 100%;
}

.recorrenciaControles {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pausada {
  color: #9ca3af;
  font-style: italic;
}

.botaoTexto {
  background: none;
  border: none;
  padding: 0;
  font-size: 11px;
  color: #6b7280;
  cursor: pointer;
  text-decoration: underline;
  font-family: inherit;
}

.entradaPequena {
  border: 1px solid #d1d5db;
  border-radius: 7px;
  padding: 5px 7px;
  font-size: 11px;
  font-family: inherit;
  width: 120px;
}
```

- [ ] **Step 3: Somar a seção na tela**

Em `src/app/(app)/ajustes/page.tsx`, atualize os imports do topo:

```tsx
import { listarCategorias } from '@/dados/categorias';
import { listarCartoes } from '@/dados/cartoes';
import { listarRecorrentes } from '@/dados/recorrentes';
import { formatarBRL } from '@/dominio/dinheiro';

import {
  acaoCriarCartao,
  acaoCriarCategoria,
  acaoCriarSubcategoria,
  acaoCriarRecorrencia,
  acaoEncerrarRecorrencia,
  acaoAlternarRecorrencia,
} from './acoes';
import estilos from './ajustes.module.css';
import { CORES } from '../cores';
```

E troque a linha do `Promise.all` por:

```tsx
  const [categorias, cartoes, recorrentes] = await Promise.all([
    listarCategorias(),
    listarCartoes(),
    listarRecorrentes(),
  ]);
```

Acrescente, como a última `<section>` do arquivo (depois da seção "Cartões"), antes do `</>` final:

```tsx
      <section className={estilos.secao}>
        <div className={estilos.titulo}>Despesas fixas</div>

        {categorias.length === 0 ? (
          <div className={estilos.vazio}>Crie um orçamento primeiro.</div>
        ) : (
          <form action={acaoCriarRecorrencia} className={estilos.linha}>
            <div className={estilos.campo}>
              <label className={estilos.rotulo} htmlFor="rec-descricao">
                Descrição
              </label>
              <input
                id="rec-descricao"
                name="descricao"
                required
                className={estilos.entrada}
                placeholder="Streaming"
              />
            </div>
            <div className={estilos.campo}>
              <label className={estilos.rotulo} htmlFor="rec-valor">
                Valor
              </label>
              <input
                id="rec-valor"
                name="valor"
                type="number"
                step="0.01"
                min="0.01"
                required
                className={estilos.entrada}
                style={{ width: 90 }}
              />
            </div>
            <div className={estilos.campo}>
              <label className={estilos.rotulo} htmlFor="rec-dia">
                Dia do mês
              </label>
              <input
                id="rec-dia"
                name="diaDoMes"
                type="number"
                min={1}
                max={31}
                required
                className={estilos.entrada}
                style={{ width: 70 }}
              />
            </div>
            <div className={estilos.campo}>
              <label className={estilos.rotulo} htmlFor="rec-cat">
                Orçamento
              </label>
              <select id="rec-cat" name="budgetCategoryId" className={estilos.entrada}>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className={estilos.campo}>
              <label className={estilos.rotulo} htmlFor="rec-sub">
                Subcategoria
              </label>
              <select id="rec-sub" name="subcategoryId" className={estilos.entrada}>
                {categorias.flatMap((c) =>
                  c.subcategorias.map((s) => (
                    <option key={s.id} value={s.id}>
                      {c.nome} — {s.nome}
                    </option>
                  )),
                )}
              </select>
            </div>
            <div className={estilos.campo}>
              <label className={estilos.rotulo} htmlFor="rec-metodo">
                Método
              </label>
              <select id="rec-metodo" name="metodo" className={estilos.entrada}>
                <option value="PIX">Pix</option>
                <option value="DEBITO">Débito</option>
                <option value="DINHEIRO">Dinheiro</option>
                <option value="BOLETO">Boleto</option>
                <option value="CREDITO">Crédito</option>
              </select>
            </div>
            <div className={estilos.campo}>
              <label className={estilos.rotulo} htmlFor="rec-cartao">
                Cartão (se crédito)
              </label>
              <select id="rec-cartao" name="cardId" className={estilos.entrada}>
                <option value="">—</option>
                {cartoes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className={estilos.campo}>
              <label className={estilos.rotulo} htmlFor="rec-inicio">
                Início
              </label>
              <input
                id="rec-inicio"
                name="inicio"
                type="month"
                required
                className={estilos.entrada}
              />
            </div>
            <button type="submit" className={estilos.botao}>
              Criar despesa fixa
            </button>
          </form>
        )}

        <div className={estilos.lista}>
          {recorrentes.length === 0 ? (
            <div className={estilos.vazio}>Nenhuma despesa fixa cadastrada ainda.</div>
          ) : (
            recorrentes.map((r) => (
              <div key={r.id} className={estilos.item}>
                <div className={estilos.recorrenciaTopo}>
                  <span>
                    <strong className={r.ativa ? '' : estilos.pausada}>
                      {r.descricao}
                    </strong>
                    <span className={estilos.subs}>
                      {' '}
                      {formatarBRL(r.valorCentavos)} · dia {r.diaDoMes} ·{' '}
                      {r.categoriaNome} › {r.subcategoriaNome}
                      {r.cartaoNome ? ` · ${r.cartaoNome}` : ''}
                      {' · desde '}
                      {r.inicio}
                      {r.fim ? ` até ${r.fim}` : ''}
                      {r.ativa ? '' : ' · pausada'}
                    </span>
                  </span>

                  <div className={estilos.recorrenciaControles}>
                    <form action={acaoAlternarRecorrencia}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="ativa" value={r.ativa ? '1' : '0'} />
                      <button type="submit" className={estilos.botaoTexto}>
                        {r.ativa ? 'pausar' : 'retomar'}
                      </button>
                    </form>

                    <form
                      action={acaoEncerrarRecorrencia}
                      style={{ display: 'flex', gap: 6, alignItems: 'center' }}
                    >
                      <input type="hidden" name="id" value={r.id} />
                      <input
                        type="month"
                        name="fim"
                        defaultValue={r.fim ?? undefined}
                        className={estilos.entradaPequena}
                      />
                      <button type="submit" className={estilos.botaoTexto}>
                        encerrar em
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
```

- [ ] **Step 4: Materializar o mês no Painel**

Em `src/app/(app)/page.tsx`, some ao import de `@/dados/painel`:

```tsx
import { materializarRecorrentes } from '@/dados/recorrentes';
```

E, logo depois de calcular `competencia` (antes do `Promise.all` que busca `resumo`/`avisos`), acrescente:

```tsx
  // Materializa as despesas fixas vigentes neste mês antes de ler o resumo —
  // idempotente, então navegar de novo para o mesmo mês não duplica nada
  // (spec, seção 13).
  await materializarRecorrentes(competencia);
```

- [ ] **Step 5: Materializar o mês em Lançamentos**

Em `src/app/(app)/lancamentos/page.tsx`, some o import:

```tsx
import { materializarRecorrentes } from '@/dados/recorrentes';
```

E, logo depois de calcular `competencia` (antes de `listarLancamentos`):

```tsx
  await materializarRecorrentes(competencia);
```

- [ ] **Step 6: Verificar**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: tudo limpo. Nenhum teste existente quebra — `materializarRecorrentes` é um no-op (`{ criadas: 0 }`) sempre que não há `RecurringExpense` cadastrada, que é o caso de todo teste de Painel/Lançamentos já escrito.

Este passo não tem teste automatizado próprio (é fiação de Server Component); a verificação manual do fluxo completo (criar despesa fixa → navegar até o mês dela → ver o lançamento aparecer) fica para o checklist do fim do plano.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/ajustes" "src/app/(app)/page.tsx" "src/app/(app)/lancamentos/page.tsx"
git commit -m "feat(ui): despesas fixas em Ajustes, materializadas ao abrir Painel e Lançamentos"
```

---

## Task 4: Navegação — quatro ícones + "Mais" no celular, botão flutuante

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/app/(app)/navegacao.module.css`
- Create: `src/app/(app)/mais/page.tsx`
- Create: `src/app/(app)/mais/mais.module.css`

**Decisão de produto (spec §8: "barra inferior com quatro ícones mais 'Mais' no celular"):** os quatro destinos fixos no celular são **Painel, Lançamentos, Áreas, Fluxo** — as telas de acompanhamento do dia a dia. Reembolsos, Cartões, Orçamentos, Receitas e Ajustes ficam atrás de "Mais". No desktop a barra lateral continua mostrando todos os destinos, sem esconder nada atrás de "Mais" — só o celular tem espaço limitado.

- [ ] **Step 1: Escrever a tela "Mais"**

Crie `src/app/(app)/mais/mais.module.css`:

```css
.lista {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 24px;
}

.item {
  display: block;
  padding: 13px 15px;
  font-size: 14px;
  color: #111827;
  text-decoration: none;
}

.item:hover {
  background: #f9fafb;
}

.item + .item {
  border-top: 1px solid #f3f4f6;
}

.conta {
  font-size: 12px;
  color: #6b7280;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sair {
  align-self: flex-start;
  background: none;
  border: none;
  padding: 0;
  font-size: 12px;
  color: #6b7280;
  cursor: pointer;
  text-decoration: underline;
  font-family: inherit;
}
```

Crie `src/app/(app)/mais/page.tsx`:

```tsx
import Link from 'next/link';

import { auth, signOut } from '@/auth';

import estilos from './mais.module.css';

const DESTINOS_MAIS = [
  { href: '/orcamentos', rotulo: 'Orçamentos' },
  { href: '/reembolsos', rotulo: 'Reembolsos' },
  { href: '/receitas', rotulo: 'Receitas' },
  { href: '/cartoes', rotulo: 'Cartões' },
  { href: '/ajustes', rotulo: 'Ajustes' },
];

export default async function Mais() {
  const sessao = await auth();

  return (
    <>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Mais</h1>

      <div className={estilos.lista}>
        {DESTINOS_MAIS.map((d) => (
          <Link key={d.href} href={d.href} className={estilos.item}>
            {d.rotulo}
          </Link>
        ))}
      </div>

      <div className={estilos.conta}>
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
    </>
  );
}
```

- [ ] **Step 2: Reestruturar o layout**

Em `src/app/(app)/layout.tsx`, troque o array `DESTINOS` único por dois arrays:

```tsx
const DESTINOS_PRINCIPAIS = [
  { href: '/', rotulo: 'Painel' },
  { href: '/lancamentos', rotulo: 'Lançamentos' },
  { href: '/areas', rotulo: 'Áreas' },
  { href: '/fluxo', rotulo: 'Fluxo' },
];

const DESTINOS_SECUNDARIOS = [
  { href: '/orcamentos', rotulo: 'Orçamentos' },
  { href: '/reembolsos', rotulo: 'Reembolsos' },
  { href: '/receitas', rotulo: 'Receitas' },
  { href: '/cartoes', rotulo: 'Cartões' },
  { href: '/ajustes', rotulo: 'Ajustes' },
];
```

E troque o corpo do componente para:

```tsx
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
        {DESTINOS_PRINCIPAIS.map((d) => (
          <Link key={d.href} href={d.href} className={estilos.link}>
            {d.rotulo}
          </Link>
        ))}
        {DESTINOS_SECUNDARIOS.map((d) => (
          <Link
            key={d.href}
            href={d.href}
            className={`${estilos.link} ${estilos.destinoSecundario}`}
          >
            {d.rotulo}
          </Link>
        ))}
        <Link href="/mais" className={`${estilos.link} ${estilos.linkMais}`}>
          Mais
        </Link>
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

      {/* Sempre acessível, em qualquer tela (spec, seção 8). */}
      <Link href="/lancamentos/novo" className={estilos.fab} aria-label="Novo lançamento">
        +
      </Link>

      <main className={estilos.conteudo}>{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Somar os estilos**

Em `src/app/(app)/navegacao.module.css`, acrescente (não remova nada que já existe):

```css
.destinoSecundario {
  /* No desktop é um link igual aos outros — a regra abaixo só entra em
     efeito no celular. */
}

.linkMais {
  display: none;
}

.fab {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: 52px;
  height: 52px;
  border-radius: 999px;
  background: #2a78d6;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  line-height: 1;
  text-decoration: none;
  box-shadow: 0 4px 14px rgba(42, 120, 214, 0.4);
  z-index: 20;
}

.fab:hover {
  background: #1e5aa8;
}
```

E, dentro do bloco `@media (max-width: 720px) { ... }` que já existe, acrescente estas três regras (ao lado das que já existem, sem removê-las):

```css
  .destinoSecundario {
    display: none;
  }

  .linkMais {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .fab {
    bottom: 76px;
  }
```

- [ ] **Step 4: Verificar**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: tudo limpo, `/mais` entre as rotas compiladas.

Este passo não tem teste automatizado (navegação é puramente visual); confira no checklist do fim do plano que, numa janela estreita (celular), só Painel/Lançamentos/Áreas/Fluxo/Mais aparecem na barra inferior, e que o botão flutuante fica visível em toda tela.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/layout.tsx" "src/app/(app)/navegacao.module.css" "src/app/(app)/mais"
git commit -m "feat(ui): navegação em quatro-mais-Mais no celular, com botão flutuante"
```

---

## Task 5: PWA — manifest, ícones, service worker enxuto

**Antes de escrever este código**, leia `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md` e `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md` — esta versão do Next pode ter convenções diferentes das que você já conhece (nota do AGENTS.md deste repositório). O código abaixo já foi verificado contra esses dois arquivos nesta versão exata (`next@16.3.4`); se algo divergir na sua leitura, siga a documentação real, não este texto.

**Files:**
- Create: `scripts/gerar-icones-pwa.mjs`
- Create: `public/icon-192.png`, `public/icon-512.png` (gerados pelo script acima)
- Create: `public/sw.js`
- Create: `public/offline.html`
- Create: `src/app/manifest.ts`
- Modify: `src/app/layout.tsx`

**Interfaces:** nenhuma — esta tarefa não toca `src/dominio/`, `src/dados/` nem qualquer teste. Verificação é só `tsc`/`lint`/`build` mais checagem manual.

- [ ] **Step 1: Gerar os ícones**

Crie `scripts/gerar-icones-pwa.mjs`:

```js
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tabela[n] = c >>> 0;
  }
  return tabela;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = TABELA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(tipo, dados) {
  const tipoBuf = Buffer.from(tipo, 'ascii');
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tipoBuf, dados])), 0);
  return Buffer.concat([tamanho, tipoBuf, dados, crc]);
}

/**
 * Ícone quadrado sólido com um losango branco centralizado — o suficiente
 * para instalar na tela inicial (spec, seção 11: "service worker enxuto").
 * PNG truecolor 8 bits, sem paleta, sem dependência nenhuma além de
 * `node:zlib` para o deflate do IDAT.
 */
function gerarIcone(tamanho) {
  const FUNDO = [0x2a, 0x78, 0xd6]; // azul do slot 1 da paleta (spec, seção 9)
  const MARCA = [0xff, 0xff, 0xff];

  const bytesPorLinha = 1 + tamanho * 3; // 1 byte de filtro + RGB por pixel
  const raw = Buffer.alloc(tamanho * bytesPorLinha);
  const meio = tamanho / 2;
  const raioLosango = tamanho * 0.28;

  for (let y = 0; y < tamanho; y++) {
    const inicioDaLinha = y * bytesPorLinha;
    raw[inicioDaLinha] = 0; // filtro None
    for (let x = 0; x < tamanho; x++) {
      const dentroDoLosango = Math.abs(x - meio) + Math.abs(y - meio) <= raioLosango;
      const cor = dentroDoLosango ? MARCA : FUNDO;
      const offset = inicioDaLinha + 1 + x * 3;
      raw[offset] = cor[0];
      raw[offset + 1] = cor[1];
      raw[offset + 2] = cor[2];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tamanho, 0);
  ihdr.writeUInt32BE(tamanho, 4);
  ihdr[8] = 8; // profundidade de bits
  ihdr[9] = 2; // tipo de cor: truecolor (RGB)
  ihdr[10] = 0; // compressão
  ihdr[11] = 0; // filtro
  ihdr[12] = 0; // sem interlace

  const assinaturaPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const idat = deflateSync(raw);

  return Buffer.concat([
    assinaturaPng,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync('public/icon-192.png', gerarIcone(192));
writeFileSync('public/icon-512.png', gerarIcone(512));
console.log('Ícones gerados: public/icon-192.png, public/icon-512.png');
```

Run: `node scripts/gerar-icones-pwa.mjs`
Expected: imprime a mensagem de sucesso, e `public/icon-192.png`/`public/icon-512.png` existem.

Confira que os arquivos são PNGs válidos:

Run: `file public/icon-192.png public/icon-512.png`
Expected: ambos reportam `PNG image data, 192 x 192, 8-bit/color RGB` e `... 512 x 512, ...` respectivamente. Se o comando `file` não existir no seu ambiente, abra os dois arquivos num visualizador de imagens para confirmar que renderizam (um quadrado azul com um losango branco no meio).

- [ ] **Step 2: Manifest via convenção nativa do Next**

Crie `src/app/manifest.ts`:

```ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Controle Financeiro',
    short_name: 'Financeiro',
    description:
      'Organização financeira pessoal — orçamentos, cartões, reembolsos e projeção de sobra mensal.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2a78d6',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
```

Esse arquivo é servido e linkado automaticamente pelo Next — não precisa de `<link rel="manifest">` manual em lugar nenhum.

- [ ] **Step 3: Página de aviso offline**

Crie `public/offline.html`:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sem conexão — Controle Financeiro</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        margin: 0;
        padding: 24px;
        text-align: center;
        color: #111827;
        background: #ffffff;
      }
      h1 {
        font-size: 18px;
        margin-bottom: 8px;
      }
      p {
        font-size: 14px;
        color: #6b7280;
        max-width: 320px;
        margin-bottom: 20px;
      }
      button {
        background: #111827;
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 10px 20px;
        font-size: 14px;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <h1>Sem conexão</h1>
    <p>
      O Controle Financeiro precisa de internet para carregar seus dados —
      nada foi salvo enquanto você estiver offline. Tente novamente quando
      voltar a ficar online.
    </p>
    <button onclick="location.reload()">Tentar novamente</button>
  </body>
</html>
```

- [ ] **Step 4: Service worker enxuto**

Crie `public/sw.js`:

```js
const CACHE = 'controle-financeiro-shell-v1';
const URL_OFFLINE = '/offline.html';

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE).then((cache) => cache.add(URL_OFFLINE)));
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(self.clients.claim());
});

// Nenhum dado é cacheado — só a página de aviso. O app precisa de conexão
// real para mostrar números que fazem sentido (spec, seção 11: "sem
// sincronização offline... o app exibe aviso claro em vez de aparentar ter
// salvo algo").
self.addEventListener('fetch', (evento) => {
  if (evento.request.mode !== 'navigate') return;

  evento.respondWith(fetch(evento.request).catch(() => caches.match(URL_OFFLINE)));
});
```

- [ ] **Step 5: Metadata, viewport e registro do service worker**

Em `src/app/layout.tsx`, troque o conteúdo inteiro por:

```tsx
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Controle Financeiro",
  description:
    "Organização financeira pessoal — orçamentos, cartões, reembolsos e projeção de sobra mensal.",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#2a78d6",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js')); }",
          }}
        />
      </body>
    </html>
  );
}
```

Note que a linha `export default function RootLayout({ children }: LayoutProps<"/">)` já existia — o tipo `LayoutProps<"/">` é gerado pelo Next em `.next/types/` (só existe depois de um build/dev; se `tsc` reclamar de "Cannot find name 'LayoutProps'" antes de rodar `npm run build` uma vez, isso é esperado neste projeto e não é um bug seu).

- [ ] **Step 6: Verificar**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: tudo limpo. `npm run build` deve reportar `/manifest.webmanifest` entre as rotas.

- [ ] **Step 7: Commit**

```bash
git add scripts/gerar-icones-pwa.mjs public/icon-192.png public/icon-512.png public/sw.js public/offline.html src/app/manifest.ts src/app/layout.tsx
git commit -m "feat(pwa): manifest, ícones e service worker enxuto"
```

---

## Task 6: Aviso de "sem conexão" durante o uso

O service worker cobre o caso de abrir o app já offline (Task 5). Falta o caso de o app já estar aberto e a conexão cair no meio do uso — só um script no navegador consegue perceber isso (`navigator.onLine` e os eventos `online`/`offline`), por isso é o único Client Component novo deste plano.

**Files:**
- Create: `src/app/(app)/offline-aviso.tsx`
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/app/(app)/navegacao.module.css`

**Interfaces:** nenhuma — Client Component autocontido, sem props.

- [ ] **Step 1: Escrever o componente**

Crie `src/app/(app)/offline-aviso.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';

import estilos from './navegacao.module.css';

/**
 * Só um script no navegador sabe se a conexão caiu no meio do uso — por isso
 * este é o único Client Component novo do plano. Nenhum dado é escondido ou
 * fingido: o aviso só aparece, nunca substitui o conteúdo real (spec, seção
 * 11 — "o app exibe aviso claro em vez de aparentar ter salvo algo").
 */
export function AvisoOffline() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);

    const aoFicarOffline = () => setOffline(true);
    const aoFicarOnline = () => setOffline(false);

    window.addEventListener('offline', aoFicarOffline);
    window.addEventListener('online', aoFicarOnline);

    return () => {
      window.removeEventListener('offline', aoFicarOffline);
      window.removeEventListener('online', aoFicarOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className={estilos.avisoOffline} role="status">
      Sem conexão — o que você vir agora pode estar desatualizado, e nada novo
      será salvo até você voltar a ficar online.
    </div>
  );
}
```

- [ ] **Step 2: Somar o estilo**

Em `src/app/(app)/navegacao.module.css`, acrescente:

```css
.avisoOffline {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: #b45309;
  color: #fff;
  font-size: 12.5px;
  text-align: center;
  padding: 8px 12px;
  z-index: 30;
}
```

- [ ] **Step 3: Renderizar no layout**

Em `src/app/(app)/layout.tsx`, some o import:

```tsx
import { AvisoOffline } from './offline-aviso';
```

E renderize logo no início do JSX retornado, antes de `<div className={estilos.casca}>`:

```tsx
  return (
    <>
      <AvisoOffline />
      <div className={estilos.casca}>
        {/* ...conteúdo que já existia, sem mudanças... */}
      </div>
    </>
  );
```

(É só envolver o `<div className={estilos.casca}>` já existente, com todo o seu conteúdo interno intacto, num fragment que também renderiza `<AvisoOffline />` antes dele.)

- [ ] **Step 4: Verificar**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: tudo limpo.

Este componente não tem teste automatizado (depende de `navigator.onLine`, uma API só do navegador). Verificação manual no checklist do fim do plano: abra as ferramentas de desenvolvedor, na aba Network marque "Offline", confirme que o aviso aparece no topo; desmarque e confirme que ele some.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/offline-aviso.tsx" "src/app/(app)/layout.tsx" "src/app/(app)/navegacao.module.css"
git commit -m "feat(ui): aviso de sem-conexão quando o app cai offline em uso"
```

---

## Ao terminar

Este é o último plano da série: com ele, todo o spec de 2026-08-31 está implementado.

Antes de considerar o app pronto, confirme no navegador com sessão real:

- [ ] `npx vitest run` passa inteiro, `npx tsc --noEmit`, `npm run lint` e `npm run build` limpos
- [ ] Em **Ajustes**, criar uma despesa fixa com início no mês corrente; navegar até **Painel** ou **Lançamentos** do mês corrente faz o lançamento aparecer sozinho
- [ ] Navegar para o mesmo mês de novo **não duplica** o lançamento
- [ ] "Pausar" uma despesa fixa e navegar para um mês novo **não** materializa nada; "retomar" volta a materializar
- [ ] "Encerrar em" um mês anterior ao atual faz meses depois daquele pararem de materializar
- [ ] Numa janela estreita (ou no celular de verdade), a barra inferior mostra só Painel/Lançamentos/Áreas/Fluxo + "Mais"; tocar em "Mais" leva à lista com Orçamentos/Reembolsos/Receitas/Cartões/Ajustes e o botão de sair
- [ ] O botão flutuante de "+" aparece em toda tela e leva direto para `/lancamentos/novo`
- [ ] No Chrome (desktop ou Android), o ícone de instalar aparece na barra de endereço; instalar abre o app em tela cheia, sem a barra do navegador
- [ ] Com o app já aberto, marcar "Offline" nas ferramentas de desenvolvedor mostra o aviso no topo; desmarcar faz ele sumir
- [ ] Recarregar a página estando offline mostra a página de aviso (não uma tela de erro do navegador)

**Este plano fecha a série.** Não há próximo plano — o spec de `docs/superpowers/specs/2026-08-31-controle-financeiro-design.md` está implementado por inteiro entre os Planos 1 a 6.
