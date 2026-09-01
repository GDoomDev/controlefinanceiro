# Orçamentos e Painel — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Responder a pergunta que motivou o app inteiro — "quanto ainda tenho para gastar este mês?" — com orçamentos versionados por vigência, receitas, e o painel central.

**Architecture:** Continua a separação em três camadas. `src/dominio/` ganha dois módulos puros: as regras da central de avisos e a ordenação/decomposição do painel. `src/dados/` ganha alocações versionadas, receitas (realizadas e previstas), e dois modelos de leitura que buscam as linhas e entregam ao domínio para calcular. `src/app/` ganha as telas de Orçamentos e Receitas, e transforma o placeholder da home no Painel de verdade.

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions), TypeScript strict, Vitest, Prisma 6.19.3, Postgres (Neon).

**Spec:** `docs/superpowers/specs/2026-08-31-controle-financeiro-design.md`
**Planos anteriores:** `2026-08-31-fundacao-e-dominio.md` e `2026-08-31-lancamentos-e-cartoes.md` (ambos completos, mergeados)

## Global Constraints

- **Dinheiro é sempre inteiro em centavos.** Nenhum ponto flutuante representa valor monetário.
- **Fuso fixo `America/Sao_Paulo`** em todo cálculo que converte instante em data ou mês.
- **Competência é sempre a string `"YYYY-MM"`.** Data civil é sempre `"YYYY-MM-DD"`. Nunca `Date` no banco nem no domínio.
- **`src/dominio/` não importa Prisma, React, Next nem nada de I/O.** Só TypeScript puro.
- **`src/dados/` não contém regra de negócio.** Toda aritmética de dinheiro, data e competência vem de `src/dominio/`.
- **Toda função de escrita em `src/dados/` aceita um cliente Prisma opcional** (`cliente: ClientePrisma = prisma`).
- **Testes de `src/dados/` rodam dentro de `comRollback`**, passando `tx` — nunca o `prisma` importado direto. O banco de desenvolvimento é o banco real do usuário.
- **A competência é carimbada na gravação e nunca recalculada sozinha.**
- **TypeScript em modo `strict`.** Sem `any` implícito.
- **Prisma fixado em `6.19.3`** (sem `^`). Se um comando falhar por versão, pare e reporte em vez de migrar de major.
- Toda tarefa termina com testes passando e um commit.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/dominio/painel.ts` | **Novo.** Puro: estado de um orçamento, ordenação por criticidade, e a decomposição da barra do herói. |
| `src/dominio/avisos.ts` | **Novo.** Puro: as regras que transformam o estado do mês em avisos ordenados. |
| `src/dados/orcamentos.ts` | **Novo.** Alocações versionadas por vigência. |
| `src/dados/receitas.ts` | **Novo.** Receitas realizadas e previstas. |
| `src/dados/painel.ts` | **Novo.** Modelo de leitura do mês: busca as linhas, entrega ao domínio, devolve o resumo. |
| `src/dados/avisos.ts` | **Novo.** Monta a entrada dos avisos a partir de quatro fontes e chama o domínio. |
| `src/app/(app)/orcamentos/` | **Novo.** Tela de alocação por mês, com herdado × definido. |
| `src/app/(app)/receitas/` | **Novo.** Tela de receitas realizadas e previstas. |
| `src/app/(app)/page.tsx` | **Modificar.** Vira o Painel de verdade. |
| `src/app/(app)/painel.module.css` | **Novo.** Estilos do painel. |

**Fora do escopo deste plano:** aba de Áreas, aba de Fluxo, reembolso e estorno na interface, despesas recorrentes, PWA, e a limitação da janela de faturas em `/cartoes` (adiada deliberadamente na revisão do Plano 2). Tudo isso são os Planos 4 a 6.

---

### Task 1: Domínio do painel (puro)

Três coisas que a interface precisa e que são regra, não apresentação: em que estado um orçamento está, em que ordem os cards aparecem, e como a barra do herói se divide.

**Files:**
- Create: `src/dominio/painel.ts`
- Test: `src/dominio/painel.test.ts`

**Interfaces:**
- Consumes: `type Centavos` de `./dinheiro`.
- Produces:
  - `interface OrcamentoDoPainel { categoriaId: string; nome: string; corSlot: number; orcadoCentavos: Centavos; gastoCentavos: Centavos }`
  - `type EstadoOrcamento = 'ESTOURADO' | 'ATIVO' | 'CONCLUIDO'`
  - `estadoDoOrcamento(o: OrcamentoDoPainel): EstadoOrcamento`
  - `restanteDoOrcamento(o: OrcamentoDoPainel): Centavos`
  - `ordenarPorCriticidade(orcamentos: OrcamentoDoPainel[]): OrcamentoDoPainel[]`
  - `interface FaixasDoHeroi { gastoCentavos: Centavos; comprometidoCentavos: Centavos; livreCentavos: Centavos }`
  - `faixasDoHeroi(receitaConsiderada: Centavos, orcamentos: OrcamentoDoPainel[]): FaixasDoHeroi`

Regras (spec, seção 8.1): "primeiro os estourados, depois os demais por percentual consumido decrescente. Orçamentos que atingiram exatamente 100% sem estourar vão para o fim, esmaecidos."

- `gasto > orcado` → `ESTOURADO`; `gasto < orcado` → `ATIVO`; iguais → `CONCLUIDO`.
- A ordem é: estourados (maior excesso primeiro), ativos (maior percentual consumido primeiro), concluídos (maior orçamento primeiro).
- A barra do herói divide a receita em três: o que já saiu, o que ainda está reservado no orçamento, e o que sobra. As três somam exatamente a receita considerada — é essa a invariante que a torna legível.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/dominio/painel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  type OrcamentoDoPainel,
  estadoDoOrcamento,
  faixasDoHeroi,
  ordenarPorCriticidade,
  restanteDoOrcamento,
} from './painel';

const orc = (
  nome: string,
  orcadoCentavos: number,
  gastoCentavos: number,
): OrcamentoDoPainel => ({
  categoriaId: nome.toLowerCase(),
  nome,
  corSlot: 1,
  orcadoCentavos,
  gastoCentavos,
});

describe('estadoDoOrcamento', () => {
  it('gastou menos que o orçado é ATIVO', () => {
    expect(estadoDoOrcamento(orc('Alimentação', 120000, 94000))).toBe('ATIVO');
  });

  it('gastou mais que o orçado é ESTOURADO', () => {
    expect(estadoDoOrcamento(orc('Lazer', 50000, 62000))).toBe('ESTOURADO');
  });

  it('gastou exatamente o orçado é CONCLUIDO', () => {
    expect(estadoDoOrcamento(orc('Moradia', 220000, 220000))).toBe('CONCLUIDO');
  });

  it('gasto sem nenhum orçamento é ESTOURADO', () => {
    expect(estadoDoOrcamento(orc('Avulso', 0, 5000))).toBe('ESTOURADO');
  });

  it('sem orçamento e sem gasto é CONCLUIDO — nada a decidir', () => {
    expect(estadoDoOrcamento(orc('Vazio', 0, 0))).toBe('CONCLUIDO');
  });
});

describe('restanteDoOrcamento', () => {
  it('é o que sobra do orçado', () => {
    expect(restanteDoOrcamento(orc('Alimentação', 120000, 94000))).toBe(26000);
  });

  it('fica negativo quando estoura', () => {
    expect(restanteDoOrcamento(orc('Lazer', 50000, 62000))).toBe(-12000);
  });
});

describe('ordenarPorCriticidade', () => {
  it('põe os estourados na frente, maior excesso primeiro', () => {
    const lista = [
      orc('Alimentação', 120000, 94000),
      orc('Lazer', 50000, 62000),
      orc('Eletrônicos', 20000, 90000),
    ];
    expect(ordenarPorCriticidade(lista).map((o) => o.nome)).toEqual([
      'Eletrônicos',
      'Lazer',
      'Alimentação',
    ]);
  });

  it('ordena os ativos por percentual consumido decrescente', () => {
    const lista = [
      orc('Saúde', 30000, 9000),
      orc('Transporte', 40000, 38500),
      orc('Alimentação', 120000, 94000),
    ];
    expect(ordenarPorCriticidade(lista).map((o) => o.nome)).toEqual([
      'Transporte',
      'Alimentação',
      'Saúde',
    ]);
  });

  it('joga os concluídos para o fim', () => {
    const lista = [
      orc('Moradia', 220000, 220000),
      orc('Alimentação', 120000, 94000),
      orc('Lazer', 50000, 62000),
    ];
    expect(ordenarPorCriticidade(lista).map((o) => o.nome)).toEqual([
      'Lazer',
      'Alimentação',
      'Moradia',
    ]);
  });

  it('reproduz a ordem completa do exemplo do spec', () => {
    const lista = [
      orc('Moradia', 220000, 220000),
      orc('Alimentação', 120000, 94000),
      orc('Lazer', 50000, 62000),
      orc('Transporte', 40000, 38500),
      orc('Assinaturas', 18000, 18000),
      orc('Saúde', 30000, 9000),
    ];
    expect(ordenarPorCriticidade(lista).map((o) => o.nome)).toEqual([
      'Lazer',
      'Transporte',
      'Alimentação',
      'Saúde',
      'Moradia',
      'Assinaturas',
    ]);
  });

  it('não modifica o array recebido', () => {
    const lista = [orc('A', 100, 200), orc('B', 100, 0)];
    const copia = [...lista];
    ordenarPorCriticidade(lista);
    expect(lista).toEqual(copia);
  });
});

describe('faixasDoHeroi', () => {
  it('divide a receita em gasto, comprometido e livre', () => {
    const orcamentos = [
      orc('Alimentação', 120000, 94000),
      orc('Lazer', 50000, 62000),
    ];
    // Gasto: 94000 + 62000 = 156000
    // Máx por categoria: 120000 + 62000 = 182000 → comprometido = 182000 − 156000 = 26000
    // Livre: 609000 − 182000 = 427000
    expect(faixasDoHeroi(609000, orcamentos)).toEqual({
      gastoCentavos: 156000,
      comprometidoCentavos: 26000,
      livreCentavos: 427000,
    });
  });

  it('as três faixas sempre somam exatamente a receita considerada', () => {
    const cenarios: Array<[number, OrcamentoDoPainel[]]> = [
      [609000, [orc('A', 120000, 94000), orc('B', 50000, 62000)]],
      [100000, [orc('A', 0, 0)]],
      [0, [orc('A', 30000, 10000)]],
      [50000, [orc('A', 20000, 90000), orc('B', 10000, 0)]],
    ];
    for (const [receita, orcamentos] of cenarios) {
      const f = faixasDoHeroi(receita, orcamentos);
      expect(f.gastoCentavos + f.comprometidoCentavos + f.livreCentavos).toBe(receita);
    }
  });

  it('sem orçamento nenhum, tudo é livre', () => {
    expect(faixasDoHeroi(609000, [])).toEqual({
      gastoCentavos: 0,
      comprometidoCentavos: 0,
      livreCentavos: 609000,
    });
  });

  it('o livre fica negativo quando o comprometido passa da receita', () => {
    const f = faixasDoHeroi(50000, [orc('A', 80000, 10000)]);
    expect(f.livreCentavos).toBe(-30000);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/dominio/painel.test.ts`
Expected: FAIL — `Failed to resolve import "./painel"`

- [ ] **Step 3: Implementar `src/dominio/painel.ts`**

```ts
/**
 * Regras do painel central (spec, seção 8.1).
 *
 * Não é apresentação: em que estado um orçamento está, em que ordem os cards
 * aparecem, e como a barra do herói se divide são decisões de negócio. A
 * interface só desenha o que este módulo decide.
 */

import type { Centavos } from './dinheiro';

export interface OrcamentoDoPainel {
  categoriaId: string;
  nome: string;
  corSlot: number;
  orcadoCentavos: Centavos;
  gastoCentavos: Centavos;
}

export type EstadoOrcamento = 'ESTOURADO' | 'ATIVO' | 'CONCLUIDO';

export function estadoDoOrcamento(o: OrcamentoDoPainel): EstadoOrcamento {
  if (o.gastoCentavos > o.orcadoCentavos) return 'ESTOURADO';
  if (o.gastoCentavos < o.orcadoCentavos) return 'ATIVO';
  return 'CONCLUIDO';
}

/** O que ainda cabe no orçamento. Negativo quando estourou. */
export function restanteDoOrcamento(o: OrcamentoDoPainel): Centavos {
  return o.orcadoCentavos - o.gastoCentavos;
}

const PESO_DO_ESTADO: Record<EstadoOrcamento, number> = {
  ESTOURADO: 0,
  ATIVO: 1,
  CONCLUIDO: 2,
};

/**
 * Estourados primeiro (maior excesso na frente), depois os ativos por
 * percentual consumido decrescente, e por último os concluídos — sobre os
 * quais não há mais nenhuma decisão a tomar.
 *
 * Devolve um array novo; não modifica o recebido.
 */
export function ordenarPorCriticidade(
  orcamentos: OrcamentoDoPainel[],
): OrcamentoDoPainel[] {
  return [...orcamentos].sort((a, b) => {
    const estadoA = estadoDoOrcamento(a);
    const estadoB = estadoDoOrcamento(b);

    if (estadoA !== estadoB) {
      return PESO_DO_ESTADO[estadoA] - PESO_DO_ESTADO[estadoB];
    }

    if (estadoA === 'ESTOURADO') {
      // Maior excesso primeiro.
      return (
        b.gastoCentavos - b.orcadoCentavos - (a.gastoCentavos - a.orcadoCentavos)
      );
    }

    if (estadoA === 'ATIVO') {
      // Maior percentual consumido primeiro. Dentro de ATIVO o orçado é sempre
      // maior que o gasto, logo maior que zero — não há divisão por zero aqui.
      return b.gastoCentavos / b.orcadoCentavos - a.gastoCentavos / a.orcadoCentavos;
    }

    // Concluídos: maior orçamento primeiro, só para dar uma ordem estável.
    return b.orcadoCentavos - a.orcadoCentavos;
  });
}

export interface FaixasDoHeroi {
  /** O que já saiu. */
  gastoCentavos: Centavos;
  /** O que ainda está reservado dentro dos orçamentos. */
  comprometidoCentavos: Centavos;
  /** O que sobra depois de honrar todos os orçamentos. Pode ser negativo. */
  livreCentavos: Centavos;
}

/**
 * Divide a receita considerada nas três faixas da barra do herói.
 *
 * As três somam exatamente a receita — é essa invariante que torna a barra
 * legível como uma linha só. `comprometido` usa o mesmo máx(orçado, gasto) da
 * fórmula da sobra (spec, seção 7), então nunca conta uma parcela duas vezes.
 */
export function faixasDoHeroi(
  receitaConsiderada: Centavos,
  orcamentos: OrcamentoDoPainel[],
): FaixasDoHeroi {
  let gastoCentavos = 0;
  let reservado = 0;

  for (const o of orcamentos) {
    gastoCentavos += o.gastoCentavos;
    reservado += Math.max(o.orcadoCentavos, o.gastoCentavos);
  }

  return {
    gastoCentavos,
    comprometidoCentavos: reservado - gastoCentavos,
    livreCentavos: receitaConsiderada - reservado,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/dominio/painel.test.ts`
Expected: PASS — 16 testes.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npx vitest run`
Expected: PASS — nenhuma regressão nos 164 testes dos planos anteriores.

- [ ] **Step 6: Commit**

```bash
git add src/dominio/painel.ts src/dominio/painel.test.ts
git commit -m "feat(dominio): estado, ordenação e faixas do painel"
```

---

### Task 2: Regras da central de avisos (puro)

**Files:**
- Create: `src/dominio/avisos.ts`
- Test: `src/dominio/avisos.test.ts`

**Interfaces:**
- Consumes: `type Centavos` de `./dinheiro`, `type Competencia` de `./data`.
- Produces:
  - `type Severidade = 'VERMELHO' | 'AMARELO' | 'AZUL' | 'CINZA'`
  - `interface Aviso { severidade: Severidade; texto: string; href: string; valorOrdenacao: Centavos }`
  - `interface EntradaAvisos { orcamentos: Array<{ nome: string; orcadoCentavos: Centavos; gastoCentavos: Centavos }>; faturasProximas: Array<{ cartaoNome: string; diasParaFechar: number; totalCentavos: Centavos }>; reembolsoPendente: { totalCentavos: Centavos; diasDoMaisAntigo: number } | null; receitaPrevistaDoProximoMesInformada: boolean; proximoMes: Competencia }`
  - `gerarAvisos(entrada: EntradaAvisos): Aviso[]`
  - `limitarAvisos(avisos: Aviso[]): { visiveis: Aviso[]; ocultos: number }`
  - `MAXIMO_AVISOS_VISIVEIS: 5`

Gatilhos (spec, seção 8.1):

| Severidade | Gatilho |
|---|---|
| Vermelho | orçamento estourado |
| Amarelo | orçamento com 90% ou mais consumido, ainda não estourado |
| Amarelo | fatura fecha em 2 dias ou menos |
| Azul | há valor pendente de reembolso lançado há mais de 30 dias |
| Cinza | receita prevista do próximo mês não informada |

Ordenação: por severidade e, dentro da mesma severidade, por valor decrescente. No máximo 5 visíveis; o resto vira uma contagem.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/dominio/avisos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { type EntradaAvisos, gerarAvisos, limitarAvisos } from './avisos';

const vazio = (over: Partial<EntradaAvisos> = {}): EntradaAvisos => ({
  orcamentos: [],
  faturasProximas: [],
  reembolsoPendente: null,
  receitaPrevistaDoProximoMesInformada: true,
  proximoMes: '2026-10',
  ...over,
});

describe('gerarAvisos — orçamentos', () => {
  it('avisa em vermelho quando um orçamento estoura', () => {
    const avisos = gerarAvisos(
      vazio({ orcamentos: [{ nome: 'Lazer', orcadoCentavos: 50000, gastoCentavos: 62000 }] }),
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0].severidade).toBe('VERMELHO');
    expect(avisos[0].texto).toContain('Lazer');
    expect(avisos[0].texto).toContain('R$ 120,00');
  });

  it('avisa em amarelo a partir de 90% consumido', () => {
    const avisos = gerarAvisos(
      vazio({
        orcamentos: [{ nome: 'Transporte', orcadoCentavos: 40000, gastoCentavos: 38500 }],
      }),
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0].severidade).toBe('AMARELO');
    expect(avisos[0].texto).toContain('Transporte');
    expect(avisos[0].texto).toContain('R$ 15,00');
  });

  it('exatamente 90% já dispara o aviso', () => {
    const avisos = gerarAvisos(
      vazio({ orcamentos: [{ nome: 'Saúde', orcadoCentavos: 10000, gastoCentavos: 9000 }] }),
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0].severidade).toBe('AMARELO');
  });

  it('não avisa nada abaixo de 90%', () => {
    const avisos = gerarAvisos(
      vazio({
        orcamentos: [{ nome: 'Alimentação', orcadoCentavos: 120000, gastoCentavos: 94000 }],
      }),
    );
    expect(avisos).toEqual([]);
  });

  it('não avisa sobre orçamento zerado sem gasto', () => {
    const avisos = gerarAvisos(
      vazio({ orcamentos: [{ nome: 'Vazio', orcadoCentavos: 0, gastoCentavos: 0 }] }),
    );
    expect(avisos).toEqual([]);
  });

  it('gasto sem orçamento nenhum conta como estouro', () => {
    const avisos = gerarAvisos(
      vazio({ orcamentos: [{ nome: 'Avulso', orcadoCentavos: 0, gastoCentavos: 5000 }] }),
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0].severidade).toBe('VERMELHO');
  });
});

describe('gerarAvisos — outras fontes', () => {
  it('avisa em amarelo quando uma fatura fecha em 2 dias ou menos', () => {
    const avisos = gerarAvisos(
      vazio({
        faturasProximas: [
          { cartaoNome: 'Nubank', diasParaFechar: 1, totalCentavos: 294000 },
        ],
      }),
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0].severidade).toBe('AMARELO');
    expect(avisos[0].texto).toContain('Nubank');
  });

  it('avisa em azul sobre reembolso pendente há mais de 30 dias', () => {
    const avisos = gerarAvisos(
      vazio({ reembolsoPendente: { totalCentavos: 48000, diasDoMaisAntigo: 42 } }),
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0].severidade).toBe('AZUL');
    expect(avisos[0].texto).toContain('R$ 480,00');
    expect(avisos[0].texto).toContain('42');
  });

  it('não avisa sobre reembolso recente', () => {
    const avisos = gerarAvisos(
      vazio({ reembolsoPendente: { totalCentavos: 48000, diasDoMaisAntigo: 5 } }),
    );
    expect(avisos).toEqual([]);
  });

  it('avisa em cinza quando falta a receita prevista do próximo mês', () => {
    const avisos = gerarAvisos(
      vazio({ receitaPrevistaDoProximoMesInformada: false, proximoMes: '2026-10' }),
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0].severidade).toBe('CINZA');
    expect(avisos[0].texto).toContain('2026-10');
  });
});

describe('gerarAvisos — ordenação', () => {
  it('ordena por severidade e, dentro dela, por valor decrescente', () => {
    const avisos = gerarAvisos({
      orcamentos: [
        { nome: 'Lazer', orcadoCentavos: 50000, gastoCentavos: 62000 },
        { nome: 'Eletrônicos', orcadoCentavos: 20000, gastoCentavos: 90000 },
        { nome: 'Transporte', orcadoCentavos: 40000, gastoCentavos: 38500 },
      ],
      faturasProximas: [
        { cartaoNome: 'Nubank', diasParaFechar: 1, totalCentavos: 294000 },
      ],
      reembolsoPendente: { totalCentavos: 48000, diasDoMaisAntigo: 42 },
      receitaPrevistaDoProximoMesInformada: false,
      proximoMes: '2026-10',
    });

    expect(avisos.map((a) => a.severidade)).toEqual([
      'VERMELHO',
      'VERMELHO',
      'AMARELO',
      'AMARELO',
      'AZUL',
      'CINZA',
    ]);
    // Dentro do vermelho, o maior estouro primeiro (70000 antes de 12000).
    expect(avisos[0].texto).toContain('Eletrônicos');
    // Dentro do amarelo, a fatura de 294000 vem antes do restante de 1500.
    expect(avisos[2].texto).toContain('Nubank');
  });
});

describe('limitarAvisos', () => {
  const avisoFalso = (i: number) => ({
    severidade: 'VERMELHO' as const,
    texto: `aviso ${i}`,
    href: '/',
    valorOrdenacao: i,
  });

  it('mostra todos quando cabem', () => {
    const { visiveis, ocultos } = limitarAvisos([1, 2, 3].map(avisoFalso));
    expect(visiveis).toHaveLength(3);
    expect(ocultos).toBe(0);
  });

  it('corta em cinco e conta o resto', () => {
    const { visiveis, ocultos } = limitarAvisos([1, 2, 3, 4, 5, 6, 7].map(avisoFalso));
    expect(visiveis).toHaveLength(5);
    expect(ocultos).toBe(2);
  });

  it('lista vazia devolve vazio', () => {
    expect(limitarAvisos([])).toEqual({ visiveis: [], ocultos: 0 });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/dominio/avisos.test.ts`
Expected: FAIL — `Failed to resolve import "./avisos"`

- [ ] **Step 3: Implementar `src/dominio/avisos.ts`**

```ts
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
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/dominio/avisos.test.ts`
Expected: PASS — 14 testes.

- [ ] **Step 5: Commit**

```bash
git add src/dominio/avisos.ts src/dominio/avisos.test.ts
git commit -m "feat(dominio): regras da central de avisos"
```

---

### Task 3: Alocações de orçamento versionadas

**Files:**
- Create: `src/dados/orcamentos.ts`
- Test: `src/dados/orcamentos.test.ts`

**Interfaces:**
- Consumes: `prisma` de `./prisma`, `type ClientePrisma` de `./tipos`, `comRollback` de `./rollback` (só no teste), `criarCategoria` de `./categorias` (só no teste), `type Alocacao`/`alocacaoVigente`/`origemDaAlocacao` de `@/dominio/orcamento`, `type Competencia` de `@/dominio/data`.
- Produces:
  - `interface OrcamentoDoMes { categoriaId: string; nome: string; corSlot: number; valorCentavos: number; vigenteDe: Competencia | null }`
  - `listarAlocacoes(budgetCategoryId: string, cliente?: ClientePrisma): Promise<Alocacao[]>`
  - `definirAlocacao(dados: { budgetCategoryId: string; vigenteDe: Competencia; valorCentavos: number }, cliente?: ClientePrisma): Promise<void>`
  - `removerAlocacao(budgetCategoryId: string, vigenteDe: Competencia, cliente?: ClientePrisma): Promise<void>`
  - `orcamentosDoMes(mes: Competencia, cliente?: ClientePrisma): Promise<OrcamentoDoMes[]>`

Regras (spec, seção 5): guarda-se **uma linha por mudança**, não uma por mês. `definirAlocacao` é um upsert na chave `(budgetCategoryId, vigenteDe)`. `orcamentosDoMes` resolve o valor vigente usando as funções puras do domínio — `vigenteDe` no retorno é a competência da linha que está valendo, e serve para a tela distinguir "herdado de setembro" de "definido neste mês". É `null` quando não há alocação vigente.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/dados/orcamentos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { criarCategoria } from './categorias';
import {
  definirAlocacao,
  listarAlocacoes,
  orcamentosDoMes,
  removerAlocacao,
} from './orcamentos';
import { comRollback } from './rollback';

describe('definirAlocacao e listarAlocacoes', () => {
  it('grava uma linha por mudança', async () => {
    await comRollback(async (tx) => {
      const cat = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
      await definirAlocacao(
        { budgetCategoryId: cat.id, vigenteDe: '2026-08', valorCentavos: 100000 },
        tx,
      );
      await definirAlocacao(
        { budgetCategoryId: cat.id, vigenteDe: '2026-09', valorCentavos: 80000 },
        tx,
      );

      const alocacoes = await listarAlocacoes(cat.id, tx);
      expect(alocacoes).toEqual([
        { vigenteDe: '2026-08', valorCentavos: 100000 },
        { vigenteDe: '2026-09', valorCentavos: 80000 },
      ]);
    });
  });

  it('redefinir a mesma vigência substitui em vez de duplicar', async () => {
    await comRollback(async (tx) => {
      const cat = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
      await definirAlocacao(
        { budgetCategoryId: cat.id, vigenteDe: '2026-08', valorCentavos: 100000 },
        tx,
      );
      await definirAlocacao(
        { budgetCategoryId: cat.id, vigenteDe: '2026-08', valorCentavos: 120000 },
        tx,
      );

      const alocacoes = await listarAlocacoes(cat.id, tx);
      expect(alocacoes).toEqual([{ vigenteDe: '2026-08', valorCentavos: 120000 }]);
    });
  });

  it('rejeita valor negativo', async () => {
    await comRollback(async (tx) => {
      const cat = await criarCategoria({ nome: 'X', corSlot: 1 }, tx);
      await expect(
        definirAlocacao(
          { budgetCategoryId: cat.id, vigenteDe: '2026-08', valorCentavos: -1 },
          tx,
        ),
      ).rejects.toThrow();
    });
  });

  it('rejeita competência em formato inválido', async () => {
    await comRollback(async (tx) => {
      const cat = await criarCategoria({ nome: 'X', corSlot: 1 }, tx);
      await expect(
        definirAlocacao(
          { budgetCategoryId: cat.id, vigenteDe: '08/2026', valorCentavos: 1000 },
          tx,
        ),
      ).rejects.toThrow();
    });
  });
});

describe('removerAlocacao', () => {
  it('remove só a linha daquela vigência', async () => {
    await comRollback(async (tx) => {
      const cat = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
      await definirAlocacao(
        { budgetCategoryId: cat.id, vigenteDe: '2026-08', valorCentavos: 100000 },
        tx,
      );
      await definirAlocacao(
        { budgetCategoryId: cat.id, vigenteDe: '2026-09', valorCentavos: 80000 },
        tx,
      );

      await removerAlocacao(cat.id, '2026-09', tx);

      expect(await listarAlocacoes(cat.id, tx)).toEqual([
        { vigenteDe: '2026-08', valorCentavos: 100000 },
      ]);
    });
  });
});

describe('orcamentosDoMes', () => {
  it('reproduz a herança do spec: alterar dezembro não mexe em outubro', async () => {
    await comRollback(async (tx) => {
      const cat = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
      for (const [vigenteDe, valorCentavos] of [
        ['2026-08', 100000],
        ['2026-09', 80000],
        ['2026-12', 60000],
      ] as const) {
        await definirAlocacao({ budgetCategoryId: cat.id, vigenteDe, valorCentavos }, tx);
      }

      const valorEm = async (mes: string) => {
        const lista = await orcamentosDoMes(mes, tx);
        return lista.find((o) => o.categoriaId === cat.id)!.valorCentavos;
      };

      expect(await valorEm('2026-08')).toBe(100000);
      expect(await valorEm('2026-09')).toBe(80000);
      expect(await valorEm('2026-10')).toBe(80000);
      expect(await valorEm('2026-11')).toBe(80000);
      expect(await valorEm('2026-12')).toBe(60000);
      expect(await valorEm('2027-01')).toBe(60000);
    });
  });

  it('distingue herdado de definido no próprio mês', async () => {
    await comRollback(async (tx) => {
      const cat = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
      await definirAlocacao(
        { budgetCategoryId: cat.id, vigenteDe: '2026-09', valorCentavos: 80000 },
        tx,
      );

      const setembro = (await orcamentosDoMes('2026-09', tx)).find(
        (o) => o.categoriaId === cat.id,
      )!;
      expect(setembro.vigenteDe).toBe('2026-09');

      const novembro = (await orcamentosDoMes('2026-11', tx)).find(
        (o) => o.categoriaId === cat.id,
      )!;
      expect(novembro.vigenteDe).toBe('2026-09');
    });
  });

  it('categoria sem alocação vigente aparece com zero e sem origem', async () => {
    await comRollback(async (tx) => {
      const cat = await criarCategoria({ nome: 'Nova', corSlot: 3 }, tx);
      const lista = await orcamentosDoMes('2026-09', tx);
      const nova = lista.find((o) => o.categoriaId === cat.id)!;
      expect(nova.valorCentavos).toBe(0);
      expect(nova.vigenteDe).toBeNull();
    });
  });

  it('traz o nome e a cor da categoria junto', async () => {
    await comRollback(async (tx) => {
      const cat = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
      const lista = await orcamentosDoMes('2026-09', tx);
      const alimentacao = lista.find((o) => o.categoriaId === cat.id)!;
      expect(alimentacao.nome).toBe('Alimentação');
      expect(alimentacao.corSlot).toBe(2);
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/dados/orcamentos.test.ts`
Expected: FAIL — `Failed to resolve import "./orcamentos"`

- [ ] **Step 3: Implementar `src/dados/orcamentos.ts`**

```ts
import type { Competencia } from '@/dominio/data';
import {
  type Alocacao,
  alocacaoVigente,
  origemDaAlocacao,
} from '@/dominio/orcamento';

import { prisma } from './prisma';
import type { ClientePrisma } from './tipos';

export interface OrcamentoDoMes {
  categoriaId: string;
  nome: string;
  corSlot: number;
  valorCentavos: number;
  /**
   * Competência da linha que está valendo — igual a `mes` quando foi definida
   * ali, anterior quando é herdada, e `null` quando não há alocação nenhuma.
   */
  vigenteDe: Competencia | null;
}

function validarCompetencia(c: Competencia): void {
  if (!/^\d{4}-\d{2}$/.test(c)) {
    throw new Error(`Competência inválida, esperado "YYYY-MM": ${c}`);
  }
}

export async function listarAlocacoes(
  budgetCategoryId: string,
  cliente: ClientePrisma = prisma,
): Promise<Alocacao[]> {
  return cliente.budgetAllocation.findMany({
    where: { budgetCategoryId },
    orderBy: { vigenteDe: 'asc' },
    select: { vigenteDe: true, valorCentavos: true },
  });
}

/** Upsert na chave (categoria, vigência): redefinir o mesmo mês substitui. */
export async function definirAlocacao(
  dados: { budgetCategoryId: string; vigenteDe: Competencia; valorCentavos: number },
  cliente: ClientePrisma = prisma,
): Promise<void> {
  validarCompetencia(dados.vigenteDe);

  if (!Number.isInteger(dados.valorCentavos) || dados.valorCentavos < 0) {
    throw new Error(
      `Valor do orçamento deve ser inteiro não negativo em centavos: ${dados.valorCentavos}`,
    );
  }

  await cliente.budgetAllocation.upsert({
    where: {
      budgetCategoryId_vigenteDe: {
        budgetCategoryId: dados.budgetCategoryId,
        vigenteDe: dados.vigenteDe,
      },
    },
    create: dados,
    update: { valorCentavos: dados.valorCentavos },
  });
}

export async function removerAlocacao(
  budgetCategoryId: string,
  vigenteDe: Competencia,
  cliente: ClientePrisma = prisma,
): Promise<void> {
  await cliente.budgetAllocation.deleteMany({
    where: { budgetCategoryId, vigenteDe },
  });
}

/**
 * Orçamento vigente de cada categoria naquele mês. Quem decide qual linha vale
 * é o domínio (`alocacaoVigente`); aqui só buscamos as linhas.
 */
export async function orcamentosDoMes(
  mes: Competencia,
  cliente: ClientePrisma = prisma,
): Promise<OrcamentoDoMes[]> {
  validarCompetencia(mes);

  const categorias = await cliente.budgetCategory.findMany({
    where: { arquivada: false },
    orderBy: { ordem: 'asc' },
    select: {
      id: true,
      nome: true,
      corSlot: true,
      alocacoes: { select: { vigenteDe: true, valorCentavos: true } },
    },
  });

  return categorias.map((c) => ({
    categoriaId: c.id,
    nome: c.nome,
    corSlot: c.corSlot,
    valorCentavos: alocacaoVigente(c.alocacoes, mes),
    vigenteDe: origemDaAlocacao(c.alocacoes, mes),
  }));
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/dados/orcamentos.test.ts`
Expected: PASS — 9 testes.

- [ ] **Step 5: Commit**

```bash
git add src/dados/orcamentos.ts src/dados/orcamentos.test.ts
git commit -m "feat(dados): alocações de orçamento versionadas por vigência"
```

---

### Task 4: Receitas realizadas e previstas

Hoje o app não sabe registrar receita nenhuma — `criarLancamento` grava `tipo: 'DESPESA'` fixo. Sem isso, a fórmula da sobra não tem numerador.

**Files:**
- Create: `src/dados/receitas.ts`
- Test: `src/dados/receitas.test.ts`

**Interfaces:**
- Consumes: `prisma` de `./prisma`, `type ClientePrisma` de `./tipos`, `comRollback` de `./rollback` (só no teste), `type Competencia`/`competenciaDe`/`lerDataCivil` de `@/dominio/data`, `type MetodoPagamento` de `@/dominio/lancamento`.
- Produces:
  - `interface NovaReceita { descricao: string; valorCentavos: number; data: string; metodo: MetodoPagamento }`
  - `interface ReceitaListada { id: string; descricao: string; valorCentavos: number; data: string; competencia: Competencia; metodo: MetodoPagamento }`
  - `interface ReceitaPrevistaListada { id: string; competencia: Competencia; descricao: string; valorCentavos: number }`
  - `criarReceita(entrada: NovaReceita, cliente?: ClientePrisma): Promise<{ id: string }>`
  - `listarReceitas(competencia: Competencia, cliente?: ClientePrisma): Promise<ReceitaListada[]>`
  - `apagarReceita(id: string, cliente?: ClientePrisma): Promise<void>`
  - `receitaRealizadaDoMes(competencia: Competencia, cliente?: ClientePrisma): Promise<number>`
  - `criarReceitaPrevista(dados: { competencia: Competencia; descricao: string; valorCentavos: number }, cliente?: ClientePrisma): Promise<{ id: string }>`
  - `listarReceitasPrevistas(competencia: Competencia, cliente?: ClientePrisma): Promise<ReceitaPrevistaListada[]>`
  - `apagarReceitaPrevista(id: string, cliente?: ClientePrisma): Promise<void>`
  - `receitaPrevistaDoMes(competencia: Competencia, cliente?: ClientePrisma): Promise<number>`

Regras (spec, seção 3): receita **não** aceita categoria nem subcategoria, e nunca entra em fatura — `cardId` e `invoiceId` ficam nulos. A competência é sempre o mês da própria data, porque receita não passa por cartão. Uma receita é uma `Transaction` com `tipo = 'RECEITA'`; uma receita **prevista** é uma linha de `ExpectedIncome`, que é outra tabela e não é um lançamento.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/dados/receitas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { comRollback } from './rollback';
import {
  apagarReceita,
  apagarReceitaPrevista,
  criarReceita,
  criarReceitaPrevista,
  listarReceitas,
  listarReceitasPrevistas,
  receitaPrevistaDoMes,
  receitaRealizadaDoMes,
} from './receitas';

const salario = {
  descricao: 'Salário',
  valorCentavos: 609000,
  data: '2026-09-05',
  metodo: 'PIX' as const,
};

describe('criarReceita', () => {
  it('grava na competência do mês da própria data', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarReceita(salario, tx);
      const lista = await listarReceitas('2026-09', tx);
      const criada = lista.find((r) => r.id === id);
      expect(criada?.descricao).toBe('Salário');
      expect(criada?.valorCentavos).toBe(609000);
      expect(criada?.competencia).toBe('2026-09');
    });
  });

  it('não vincula categoria, subcategoria, cartão nem fatura', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarReceita(salario, tx);
      const linha = await tx.transaction.findUnique({
        where: { id },
        select: {
          tipo: true,
          budgetCategoryId: true,
          subcategoryId: true,
          cardId: true,
          invoiceId: true,
        },
      });
      expect(linha?.tipo).toBe('RECEITA');
      expect(linha?.budgetCategoryId).toBeNull();
      expect(linha?.subcategoryId).toBeNull();
      expect(linha?.cardId).toBeNull();
      expect(linha?.invoiceId).toBeNull();
    });
  });

  it('não aparece na listagem de despesas de nenhum mês', async () => {
    await comRollback(async (tx) => {
      await criarReceita(salario, tx);
      const despesas = await tx.transaction.findMany({
        where: { competencia: '2026-09', tipo: 'DESPESA' },
        select: { descricao: true },
      });
      expect(despesas.map((d) => d.descricao)).not.toContain('Salário');
    });
  });

  it('rejeita valor zero ou negativo', async () => {
    await comRollback(async (tx) => {
      await expect(criarReceita({ ...salario, valorCentavos: 0 }, tx)).rejects.toThrow();
      await expect(
        criarReceita({ ...salario, valorCentavos: -100 }, tx),
      ).rejects.toThrow();
    });
  });

  it('rejeita data em formato inválido', async () => {
    await comRollback(async (tx) => {
      await expect(criarReceita({ ...salario, data: '05/09/2026' }, tx)).rejects.toThrow();
    });
  });

  it('rejeita descrição vazia', async () => {
    await comRollback(async (tx) => {
      await expect(criarReceita({ ...salario, descricao: '  ' }, tx)).rejects.toThrow();
    });
  });
});

describe('receitaRealizadaDoMes', () => {
  it('soma as receitas daquele mês', async () => {
    await comRollback(async (tx) => {
      await criarReceita(salario, tx);
      await criarReceita(
        { descricao: 'Freela', valorCentavos: 150000, data: '2026-09-20', metodo: 'PIX' },
        tx,
      );
      await criarReceita({ ...salario, data: '2026-10-05' }, tx);

      expect(await receitaRealizadaDoMes('2026-09', tx)).toBe(759000);
      expect(await receitaRealizadaDoMes('2026-10', tx)).toBe(609000);
    });
  });

  it('é zero num mês sem receita', async () => {
    await comRollback(async (tx) => {
      expect(await receitaRealizadaDoMes('2026-09', tx)).toBe(0);
    });
  });
});

describe('apagarReceita', () => {
  it('remove a receita da listagem e da soma', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarReceita(salario, tx);
      await apagarReceita(id, tx);
      expect(await listarReceitas('2026-09', tx)).toEqual([]);
      expect(await receitaRealizadaDoMes('2026-09', tx)).toBe(0);
    });
  });
});

describe('receita prevista', () => {
  it('cria, lista e soma', async () => {
    await comRollback(async (tx) => {
      await criarReceitaPrevista(
        { competencia: '2026-10', descricao: 'Salário', valorCentavos: 609000 },
        tx,
      );
      await criarReceitaPrevista(
        { competencia: '2026-10', descricao: 'Aluguel recebido', valorCentavos: 120000 },
        tx,
      );

      const lista = await listarReceitasPrevistas('2026-10', tx);
      expect(lista).toHaveLength(2);
      expect(await receitaPrevistaDoMes('2026-10', tx)).toBe(729000);
    });
  });

  it('é zero num mês sem previsão', async () => {
    await comRollback(async (tx) => {
      expect(await receitaPrevistaDoMes('2026-10', tx)).toBe(0);
    });
  });

  it('não se mistura com a receita realizada', async () => {
    await comRollback(async (tx) => {
      await criarReceita({ ...salario, data: '2026-10-05' }, tx);
      await criarReceitaPrevista(
        { competencia: '2026-10', descricao: 'Salário', valorCentavos: 609000 },
        tx,
      );

      expect(await receitaRealizadaDoMes('2026-10', tx)).toBe(609000);
      expect(await receitaPrevistaDoMes('2026-10', tx)).toBe(609000);
      expect(await listarReceitas('2026-10', tx)).toHaveLength(1);
      expect(await listarReceitasPrevistas('2026-10', tx)).toHaveLength(1);
    });
  });

  it('apaga uma previsão', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarReceitaPrevista(
        { competencia: '2026-10', descricao: 'Salário', valorCentavos: 609000 },
        tx,
      );
      await apagarReceitaPrevista(id, tx);
      expect(await receitaPrevistaDoMes('2026-10', tx)).toBe(0);
    });
  });

  it('rejeita valor zero ou negativo e competência inválida', async () => {
    await comRollback(async (tx) => {
      await expect(
        criarReceitaPrevista(
          { competencia: '2026-10', descricao: 'X', valorCentavos: 0 },
          tx,
        ),
      ).rejects.toThrow();
      await expect(
        criarReceitaPrevista(
          { competencia: '10/2026', descricao: 'X', valorCentavos: 1000 },
          tx,
        ),
      ).rejects.toThrow();
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/dados/receitas.test.ts`
Expected: FAIL — `Failed to resolve import "./receitas"`

- [ ] **Step 3: Implementar `src/dados/receitas.ts`**

```ts
import { type Competencia, competenciaDe, lerDataCivil } from '@/dominio/data';
import type { MetodoPagamento } from '@/dominio/lancamento';

import { prisma } from './prisma';
import type { ClientePrisma } from './tipos';

export interface NovaReceita {
  descricao: string;
  valorCentavos: number;
  /** "YYYY-MM-DD" */
  data: string;
  metodo: MetodoPagamento;
}

export interface ReceitaListada {
  id: string;
  descricao: string;
  valorCentavos: number;
  data: string;
  competencia: Competencia;
  metodo: MetodoPagamento;
}

export interface ReceitaPrevistaListada {
  id: string;
  competencia: Competencia;
  descricao: string;
  valorCentavos: number;
}

function validarCompetencia(c: Competencia): void {
  if (!/^\d{4}-\d{2}$/.test(c)) {
    throw new Error(`Competência inválida, esperado "YYYY-MM": ${c}`);
  }
}

function validarValor(valorCentavos: number): void {
  if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) {
    throw new Error(`Valor deve ser inteiro positivo em centavos: ${valorCentavos}`);
  }
}

function descricaoLimpa(descricao: string): string {
  const limpa = descricao.trim();
  if (limpa.length === 0) {
    throw new Error('Descrição não pode ser vazia');
  }
  return limpa;
}

/**
 * Receita é uma `Transaction` com `tipo = 'RECEITA'`. Nunca tem categoria,
 * subcategoria, cartão ou fatura (spec, seção 3) — e por não passar por cartão,
 * a competência é sempre o mês da própria data.
 */
export async function criarReceita(
  entrada: NovaReceita,
  cliente: ClientePrisma = prisma,
): Promise<{ id: string }> {
  const descricao = descricaoLimpa(entrada.descricao);
  validarValor(entrada.valorCentavos);
  const data = lerDataCivil(entrada.data);

  return cliente.transaction.create({
    data: {
      tipo: 'RECEITA',
      descricao,
      valorCentavos: entrada.valorCentavos,
      data: entrada.data,
      metodo: entrada.metodo,
      competencia: competenciaDe(data),
      cardId: null,
      invoiceId: null,
      budgetCategoryId: null,
      subcategoryId: null,
    },
    select: { id: true },
  });
}

export async function listarReceitas(
  competencia: Competencia,
  cliente: ClientePrisma = prisma,
): Promise<ReceitaListada[]> {
  validarCompetencia(competencia);

  return cliente.transaction.findMany({
    where: { competencia, tipo: 'RECEITA', status: 'ATIVA' },
    orderBy: [{ data: 'desc' }, { descricao: 'asc' }],
    select: {
      id: true,
      descricao: true,
      valorCentavos: true,
      data: true,
      competencia: true,
      metodo: true,
    },
  });
}

export async function apagarReceita(
  id: string,
  cliente: ClientePrisma = prisma,
): Promise<void> {
  await cliente.transaction.delete({ where: { id } });
}

export async function receitaRealizadaDoMes(
  competencia: Competencia,
  cliente: ClientePrisma = prisma,
): Promise<number> {
  validarCompetencia(competencia);

  const soma = await cliente.transaction.aggregate({
    where: { competencia, tipo: 'RECEITA', status: 'ATIVA' },
    _sum: { valorCentavos: true },
  });

  return soma._sum.valorCentavos ?? 0;
}

/**
 * Receita prevista é `ExpectedIncome` — outra tabela, não um lançamento. Ela
 * existe para dar numerador à projeção de meses que ainda não aconteceram.
 */
export async function criarReceitaPrevista(
  dados: { competencia: Competencia; descricao: string; valorCentavos: number },
  cliente: ClientePrisma = prisma,
): Promise<{ id: string }> {
  validarCompetencia(dados.competencia);
  validarValor(dados.valorCentavos);
  const descricao = descricaoLimpa(dados.descricao);

  return cliente.expectedIncome.create({
    data: { competencia: dados.competencia, descricao, valorCentavos: dados.valorCentavos },
    select: { id: true },
  });
}

export async function listarReceitasPrevistas(
  competencia: Competencia,
  cliente: ClientePrisma = prisma,
): Promise<ReceitaPrevistaListada[]> {
  validarCompetencia(competencia);

  return cliente.expectedIncome.findMany({
    where: { competencia },
    orderBy: { descricao: 'asc' },
    select: { id: true, competencia: true, descricao: true, valorCentavos: true },
  });
}

export async function apagarReceitaPrevista(
  id: string,
  cliente: ClientePrisma = prisma,
): Promise<void> {
  await cliente.expectedIncome.delete({ where: { id } });
}

export async function receitaPrevistaDoMes(
  competencia: Competencia,
  cliente: ClientePrisma = prisma,
): Promise<number> {
  validarCompetencia(competencia);

  const soma = await cliente.expectedIncome.aggregate({
    where: { competencia },
    _sum: { valorCentavos: true },
  });

  return soma._sum.valorCentavos ?? 0;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/dados/receitas.test.ts`
Expected: PASS — 14 testes.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npx vitest run`
Expected: PASS — nenhuma regressão.

- [ ] **Step 6: Commit**

```bash
git add src/dados/receitas.ts src/dados/receitas.test.ts
git commit -m "feat(dados): receitas realizadas e previstas"
```

---

### Task 5: Modelo de leitura do mês

Junta orçamentos, gastos e receitas num único objeto, delegando toda a conta ao domínio.

**Files:**
- Create: `src/dados/painel.ts`
- Test: `src/dados/painel.test.ts`

**Interfaces:**
- Consumes: `prisma` de `./prisma`, `type ClientePrisma` de `./tipos`, `orcamentosDoMes` de `./orcamentos`, `receitaRealizadaDoMes`/`receitaPrevistaDoMes` de `./receitas`, `type DespesaAgregavel`/`type CreditoAgregavel`/`gastoPorCategoria`/`despesaLiquida`/`receitaConsiderada`/`sobraRealizada`/`sobraProjetada` de `@/dominio/agregacao`, `type OrcamentoDoPainel`/`faixasDoHeroi`/`ordenarPorCriticidade`/`restanteDoOrcamento`/`estadoDoOrcamento` de `@/dominio/painel`, `type Competencia`/`competenciaDe`/`dataCivilEm` de `@/dominio/data`.
- Produces:
  - `interface CardDoPainel { categoriaId: string; nome: string; corSlot: number; orcadoCentavos: number; gastoCentavos: number; restanteCentavos: number; estado: 'ESTOURADO' | 'ATIVO' | 'CONCLUIDO' }`
  - `interface ResumoDoMes { competencia: Competencia; ehMesPassado: boolean; receitaRealizada: number; receitaPrevista: number; receitaConsiderada: number; despesaLiquida: number; sobraRealizada: number; sobraProjetada: number; faixas: { gastoCentavos: number; comprometidoCentavos: number; livreCentavos: number }; cards: CardDoPainel[] }`
  - `resumoDoMes(mes: Competencia, cliente?: ClientePrisma): Promise<ResumoDoMes>`

Regras: `ehMesPassado` compara `mes` com a competência de hoje em São Paulo — a comparação lexicográfica de `"YYYY-MM"` já é cronológica. Os cards vêm ordenados por criticidade. A invariante da barra do herói (as três faixas somando a receita considerada) é testada aqui de novo, agora com dados reais do banco.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/dados/painel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { criarCategoria, criarSubcategoria } from './categorias';
import { criarLancamento } from './lancamentos';
import { definirAlocacao } from './orcamentos';
import { resumoDoMes } from './painel';
import { criarReceita, criarReceitaPrevista } from './receitas';
import { comRollback } from './rollback';
import type { ClientePrisma } from './tipos';

async function cenario(tx: ClientePrisma) {
  const alimentacao = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
  const delivery = await criarSubcategoria(
    { budgetCategoryId: alimentacao.id, nome: 'Delivery' },
    tx,
  );
  const lazer = await criarCategoria({ nome: 'Lazer', corSlot: 3 }, tx);
  const bar = await criarSubcategoria({ budgetCategoryId: lazer.id, nome: 'Bar' }, tx);

  await definirAlocacao(
    { budgetCategoryId: alimentacao.id, vigenteDe: '2026-09', valorCentavos: 120000 },
    tx,
  );
  await definirAlocacao(
    { budgetCategoryId: lazer.id, vigenteDe: '2026-09', valorCentavos: 50000 },
    tx,
  );

  return { alimentacao, delivery, lazer, bar };
}

async function gastar(
  tx: ClientePrisma,
  categoriaId: string,
  subcategoriaId: string,
  valorCentavos: number,
) {
  await criarLancamento(
    {
      descricao: 'Gasto',
      valorCentavos,
      data: '2026-09-10',
      metodo: 'PIX',
      cardId: null,
      budgetCategoryId: categoriaId,
      subcategoryId: subcategoriaId,
      parcelas: 1,
      reembolsoAlvoCentavos: 0,
    },
    tx,
  );
}

describe('resumoDoMes', () => {
  it('monta os cards com orçado, gasto e restante', async () => {
    await comRollback(async (tx) => {
      const { alimentacao, delivery } = await cenario(tx);
      await gastar(tx, alimentacao.id, delivery.id, 94000);

      const resumo = await resumoDoMes('2026-09', tx);
      const card = resumo.cards.find((c) => c.categoriaId === alimentacao.id)!;
      expect(card.orcadoCentavos).toBe(120000);
      expect(card.gastoCentavos).toBe(94000);
      expect(card.restanteCentavos).toBe(26000);
      expect(card.estado).toBe('ATIVO');
    });
  });

  it('ordena os cards por criticidade — estourado primeiro', async () => {
    await comRollback(async (tx) => {
      const { alimentacao, delivery, lazer, bar } = await cenario(tx);
      await gastar(tx, alimentacao.id, delivery.id, 94000);
      await gastar(tx, lazer.id, bar.id, 62000);

      const resumo = await resumoDoMes('2026-09', tx);
      const nomes = resumo.cards
        .filter((c) => [alimentacao.id, lazer.id].includes(c.categoriaId))
        .map((c) => c.nome);
      expect(nomes[0]).toBe('Lazer');
    });
  });

  it('soma a despesa líquida do mês', async () => {
    await comRollback(async (tx) => {
      const { alimentacao, delivery, lazer, bar } = await cenario(tx);
      await gastar(tx, alimentacao.id, delivery.id, 94000);
      await gastar(tx, lazer.id, bar.id, 62000);

      const resumo = await resumoDoMes('2026-09', tx);
      expect(resumo.despesaLiquida).toBe(156000);
    });
  });

  it('usa a receita realizada e a prevista, e considera a maior no mês futuro', async () => {
    await comRollback(async (tx) => {
      await criarReceita(
        { descricao: 'Salário', valorCentavos: 609000, data: '2026-09-05', metodo: 'PIX' },
        tx,
      );
      await criarReceitaPrevista(
        { competencia: '2026-09', descricao: 'Salário', valorCentavos: 600000 },
        tx,
      );

      const resumo = await resumoDoMes('2026-09', tx);
      expect(resumo.receitaRealizada).toBe(609000);
      expect(resumo.receitaPrevista).toBe(600000);
      // Mês não passado usa máx(prevista, realizada).
      if (!resumo.ehMesPassado) {
        expect(resumo.receitaConsiderada).toBe(609000);
      }
    });
  });

  it('as três faixas do herói somam exatamente a receita considerada', async () => {
    await comRollback(async (tx) => {
      const { alimentacao, delivery, lazer, bar } = await cenario(tx);
      await gastar(tx, alimentacao.id, delivery.id, 94000);
      await gastar(tx, lazer.id, bar.id, 62000);
      await criarReceita(
        { descricao: 'Salário', valorCentavos: 609000, data: '2026-09-05', metodo: 'PIX' },
        tx,
      );

      const r = await resumoDoMes('2026-09', tx);
      expect(
        r.faixas.gastoCentavos + r.faixas.comprometidoCentavos + r.faixas.livreCentavos,
      ).toBe(r.receitaConsiderada);
    });
  });

  it('a faixa livre é a própria sobra projetada', async () => {
    await comRollback(async (tx) => {
      const { alimentacao, delivery } = await cenario(tx);
      await gastar(tx, alimentacao.id, delivery.id, 94000);
      await criarReceita(
        { descricao: 'Salário', valorCentavos: 609000, data: '2026-09-05', metodo: 'PIX' },
        tx,
      );

      const r = await resumoDoMes('2026-09', tx);
      expect(r.faixas.livreCentavos).toBe(r.sobraProjetada);
    });
  });

  it('a sobra realizada é receita menos despesa líquida', async () => {
    await comRollback(async (tx) => {
      const { alimentacao, delivery } = await cenario(tx);
      await gastar(tx, alimentacao.id, delivery.id, 94000);
      await criarReceita(
        { descricao: 'Salário', valorCentavos: 609000, data: '2026-09-05', metodo: 'PIX' },
        tx,
      );

      const r = await resumoDoMes('2026-09', tx);
      expect(r.sobraRealizada).toBe(609000 - 94000);
    });
  });

  it('um mês vazio devolve zeros sem quebrar', async () => {
    await comRollback(async (tx) => {
      const r = await resumoDoMes('2027-06', tx);
      expect(r.despesaLiquida).toBe(0);
      expect(r.receitaRealizada).toBe(0);
      expect(r.faixas.gastoCentavos).toBe(0);
    });
  });

  it('marca corretamente um mês claramente passado', async () => {
    await comRollback(async (tx) => {
      const r = await resumoDoMes('2020-01', tx);
      expect(r.ehMesPassado).toBe(true);
    });
  });

  it('rejeita competência inválida', async () => {
    await comRollback(async (tx) => {
      await expect(resumoDoMes('09/2026', tx)).rejects.toThrow();
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/dados/painel.test.ts`
Expected: FAIL — `Failed to resolve import "./painel"`

- [ ] **Step 3: Implementar `src/dados/painel.ts`**

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
  type EstadoOrcamento,
  type OrcamentoDoPainel,
  estadoDoOrcamento,
  faixasDoHeroi,
  ordenarPorCriticidade,
  restanteDoOrcamento,
} from '@/dominio/painel';

import { orcamentosDoMes } from './orcamentos';
import { prisma } from './prisma';
import { receitaPrevistaDoMes, receitaRealizadaDoMes } from './receitas';
import type { ClientePrisma } from './tipos';

export interface CardDoPainel {
  categoriaId: string;
  nome: string;
  corSlot: number;
  orcadoCentavos: number;
  gastoCentavos: number;
  restanteCentavos: number;
  estado: EstadoOrcamento;
}

export interface ResumoDoMes {
  competencia: Competencia;
  ehMesPassado: boolean;
  receitaRealizada: number;
  receitaPrevista: number;
  receitaConsiderada: number;
  despesaLiquida: number;
  sobraRealizada: number;
  sobraProjetada: number;
  faixas: {
    gastoCentavos: number;
    comprometidoCentavos: number;
    livreCentavos: number;
  };
  cards: CardDoPainel[];
}

function validarCompetencia(c: Competencia): void {
  if (!/^\d{4}-\d{2}$/.test(c)) {
    throw new Error(`Competência inválida, esperado "YYYY-MM": ${c}`);
  }
}

/**
 * Resumo do mês para o painel. Busca as linhas e entrega ao domínio — nenhuma
 * aritmética de dinheiro acontece neste arquivo.
 */
export async function resumoDoMes(
  mes: Competencia,
  cliente: ClientePrisma = prisma,
): Promise<ResumoDoMes> {
  validarCompetencia(mes);

  // "YYYY-MM" compara lexicograficamente na mesma ordem que cronologicamente.
  const mesCorrente = competenciaDe(dataCivilEm(new Date()));
  const ehMesPassado = mes < mesCorrente;

  const [orcamentos, realizada, prevista, transacoes, creditos] = await Promise.all([
    orcamentosDoMes(mes, cliente),
    receitaRealizadaDoMes(mes, cliente),
    receitaPrevistaDoMes(mes, cliente),
    cliente.transaction.findMany({
      where: { competencia: mes, tipo: 'DESPESA' },
      select: {
        competencia: true,
        budgetCategoryId: true,
        valorCentavos: true,
        status: true,
      },
    }),
    cliente.credito.findMany({
      where: { competenciaCredito: mes },
      select: {
        competenciaCredito: true,
        valorCentavos: true,
        transaction: { select: { budgetCategoryId: true } },
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

  const gastos = gastoPorCategoria(despesas, creditosAgregaveis, mes);

  const doPainel: OrcamentoDoPainel[] = orcamentos.map((o) => ({
    categoriaId: o.categoriaId,
    nome: o.nome,
    corSlot: o.corSlot,
    orcadoCentavos: o.valorCentavos,
    gastoCentavos: gastos.get(o.categoriaId) ?? 0,
  }));

  const considerada = receitaConsiderada(prevista, realizada, ehMesPassado);
  const liquida = despesaLiquida(despesas, creditosAgregaveis, mes);

  const orcamentosParaFormula = new Map(
    doPainel.map((o) => [o.categoriaId, o.orcadoCentavos]),
  );

  return {
    competencia: mes,
    ehMesPassado,
    receitaRealizada: realizada,
    receitaPrevista: prevista,
    receitaConsiderada: considerada,
    despesaLiquida: liquida,
    sobraRealizada: sobraRealizada(realizada, liquida),
    sobraProjetada: sobraProjetada(considerada, orcamentosParaFormula, gastos),
    faixas: faixasDoHeroi(considerada, doPainel),
    cards: ordenarPorCriticidade(doPainel).map((o) => ({
      categoriaId: o.categoriaId,
      nome: o.nome,
      corSlot: o.corSlot,
      orcadoCentavos: o.orcadoCentavos,
      gastoCentavos: o.gastoCentavos,
      restanteCentavos: restanteDoOrcamento(o),
      estado: estadoDoOrcamento(o),
    })),
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/dados/painel.test.ts`
Expected: PASS — 10 testes.

- [ ] **Step 5: Commit**

```bash
git add src/dados/painel.ts src/dados/painel.test.ts
git commit -m "feat(dados): modelo de leitura do painel mensal"
```

---

### Task 6: Fontes da central de avisos

**Files:**
- Create: `src/dados/avisos.ts`
- Test: `src/dados/avisos.test.ts`

**Interfaces:**
- Consumes: `prisma` de `./prisma`, `type ClientePrisma` de `./tipos`, `resumoDoMes` de `./painel`, `receitaPrevistaDoMes` de `./receitas`, `listarCartoes`/`regraDoCartao` de `./cartoes`, `totalDaFatura` de `./faturas`, `type Aviso`/`type EntradaAvisos`/`gerarAvisos`/`limitarAvisos` de `@/dominio/avisos`, `type Competencia`/`type DataCivil`/`dataCivilEm`/`lerDataCivil`/`somarMeses` de `@/dominio/data`, `faturaDaCompra` de `@/dominio/fatura`, `pendente` de `@/dominio/reembolso`.
- Produces:
  - `avisosDoMes(mes: Competencia, cliente?: ClientePrisma): Promise<{ visiveis: Aviso[]; ocultos: number }>`

Regras: monta a `EntradaAvisos` a partir de quatro fontes — os cards do resumo do mês, os cartões com fatura fechando em breve, os reembolsos ainda pendentes, e a receita prevista do mês seguinte — e entrega ao domínio, que decide o que vira aviso e em que ordem.

Para "dias para fechar" e para o total: reusa `faturaDaCompra(hoje, regra)` — a fatura que uma compra de hoje pegaria é exatamente a que está aberta e prestes a fechar. Isso evita somar todas as faturas abertas do cartão, já que as parcelas futuras também estão `ABERTA` e inflariam o aviso. O total sai de `totalDaFatura`, a mesma função que a tela de Cartões usa.

Para "reembolso pendente": soma `reembolsoAlvoCentavos − Σ créditos` de cada transação com alvo maior que zero, usando `pendente` do domínio, e mede a idade pela data da transação mais antiga que ainda tem saldo.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/dados/avisos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { avisosDoMes } from './avisos';
import { criarCategoria, criarSubcategoria } from './categorias';
import { criarLancamento } from './lancamentos';
import { definirAlocacao } from './orcamentos';
import { comRollback } from './rollback';
import type { ClientePrisma } from './tipos';

async function categoriaComGasto(
  tx: ClientePrisma,
  nome: string,
  orcadoCentavos: number,
  gastoCentavos: number,
) {
  const cat = await criarCategoria({ nome, corSlot: 1 }, tx);
  const sub = await criarSubcategoria({ budgetCategoryId: cat.id, nome: `${nome}-sub` }, tx);
  await definirAlocacao(
    { budgetCategoryId: cat.id, vigenteDe: '2026-09', valorCentavos: orcadoCentavos },
    tx,
  );
  if (gastoCentavos > 0) {
    await criarLancamento(
      {
        descricao: `Gasto ${nome}`,
        valorCentavos: gastoCentavos,
        data: '2026-09-10',
        metodo: 'PIX',
        cardId: null,
        budgetCategoryId: cat.id,
        subcategoryId: sub.id,
        parcelas: 1,
        reembolsoAlvoCentavos: 0,
      },
      tx,
    );
  }
  return cat;
}

describe('avisosDoMes', () => {
  it('avisa sobre orçamento estourado', async () => {
    await comRollback(async (tx) => {
      await categoriaComGasto(tx, 'Lazer', 50000, 62000);
      const { visiveis } = await avisosDoMes('2026-09', tx);
      const estouro = visiveis.find((a) => a.texto.includes('Lazer'));
      expect(estouro?.severidade).toBe('VERMELHO');
    });
  });

  it('avisa sobre orçamento perto do limite', async () => {
    await comRollback(async (tx) => {
      await categoriaComGasto(tx, 'Transporte', 40000, 38500);
      const { visiveis } = await avisosDoMes('2026-09', tx);
      const atencao = visiveis.find((a) => a.texto.includes('Transporte'));
      expect(atencao?.severidade).toBe('AMARELO');
    });
  });

  it('não avisa sobre orçamento tranquilo', async () => {
    await comRollback(async (tx) => {
      await categoriaComGasto(tx, 'Saúde', 30000, 9000);
      const { visiveis } = await avisosDoMes('2026-09', tx);
      expect(visiveis.find((a) => a.texto.includes('Saúde'))).toBeUndefined();
    });
  });

  it('avisa quando falta a receita prevista do mês seguinte', async () => {
    await comRollback(async (tx) => {
      const { visiveis } = await avisosDoMes('2026-09', tx);
      const cinza = visiveis.find((a) => a.severidade === 'CINZA');
      expect(cinza?.texto).toContain('2026-10');
    });
  });

  it('para de avisar quando a receita prevista do mês seguinte existe', async () => {
    await comRollback(async (tx) => {
      await tx.expectedIncome.create({
        data: { competencia: '2026-10', descricao: 'Salário', valorCentavos: 609000 },
      });
      const { visiveis } = await avisosDoMes('2026-09', tx);
      expect(visiveis.find((a) => a.severidade === 'CINZA')).toBeUndefined();
    });
  });

  it('nunca mostra mais de cinco avisos', async () => {
    await comRollback(async (tx) => {
      for (const nome of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
        await categoriaComGasto(tx, nome, 10000, 20000);
      }
      const { visiveis, ocultos } = await avisosDoMes('2026-09', tx);
      expect(visiveis).toHaveLength(5);
      expect(ocultos).toBeGreaterThan(0);
    });
  });

  it('devolve nada quando não há o que avisar', async () => {
    await comRollback(async (tx) => {
      await tx.expectedIncome.create({
        data: { competencia: '2026-10', descricao: 'Salário', valorCentavos: 609000 },
      });
      const { visiveis, ocultos } = await avisosDoMes('2026-09', tx);
      expect(visiveis).toEqual([]);
      expect(ocultos).toBe(0);
    });
  });

  it('rejeita competência inválida', async () => {
    await comRollback(async (tx) => {
      await expect(avisosDoMes('09/2026', tx)).rejects.toThrow();
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/dados/avisos.test.ts`
Expected: FAIL — `Failed to resolve import "./avisos"`

- [ ] **Step 3: Implementar `src/dados/avisos.ts`**

```ts
import {
  type Aviso,
  type EntradaAvisos,
  gerarAvisos,
  limitarAvisos,
} from '@/dominio/avisos';
import {
  type Competencia,
  type DataCivil,
  dataCivilEm,
  lerDataCivil,
  somarMeses,
} from '@/dominio/data';
import { faturaDaCompra } from '@/dominio/fatura';
import { pendente } from '@/dominio/reembolso';

import { listarCartoes, regraDoCartao } from './cartoes';
import { totalDaFatura } from './faturas';
import { resumoDoMes } from './painel';
import { prisma } from './prisma';
import { receitaPrevistaDoMes } from './receitas';
import type { ClientePrisma } from './tipos';

function validarCompetencia(c: Competencia): void {
  if (!/^\d{4}-\d{2}$/.test(c)) {
    throw new Error(`Competência inválida, esperado "YYYY-MM": ${c}`);
  }
}

/** Converte uma data civil num número de dias absoluto, para subtrair datas. */
function emDiasAbsolutos(d: DataCivil): number {
  return Math.floor(Date.UTC(d.ano, d.mes - 1, d.dia) / 86400000);
}

/**
 * Avisos do mês (spec, seção 8.1). Busca as quatro fontes e entrega ao
 * domínio, que decide o que vira aviso, com que severidade e em que ordem.
 */
export async function avisosDoMes(
  mes: Competencia,
  cliente: ClientePrisma = prisma,
): Promise<{ visiveis: Aviso[]; ocultos: number }> {
  validarCompetencia(mes);

  const hoje = dataCivilEm(new Date());
  const proximoMes = somarMeses(mes, 1);

  const [resumo, cartoes, previstaProximo, reembolsaveis] = await Promise.all([
    resumoDoMes(mes, cliente),
    listarCartoes(cliente),
    receitaPrevistaDoMes(proximoMes, cliente),
    cliente.transaction.findMany({
      where: { reembolsoAlvoCentavos: { gt: 0 }, status: 'ATIVA' },
      select: {
        data: true,
        reembolsoAlvoCentavos: true,
        creditos: { select: { valorCentavos: true } },
      },
    }),
  ]);

  const faturasProximas = await Promise.all(
    cartoes.map(async (cartao) => {
      // A fatura que uma compra de HOJE pegaria é exatamente a que está aberta
      // e prestes a fechar. Reusar o motor de competência aqui evita somar
      // todas as faturas abertas do cartão — as parcelas futuras também estão
      // ABERTA, e incluí-las inflaria o aviso.
      const aberta = faturaDaCompra(hoje, regraDoCartao(cartao));

      const persistida = await cliente.invoice.findUnique({
        where: {
          cardId_competencia: { cardId: cartao.id, competencia: aberta.competencia },
        },
        select: { id: true },
      });

      return {
        cartaoNome: cartao.nome,
        diasParaFechar: emDiasAbsolutos(aberta.fechamento) - emDiasAbsolutos(hoje),
        totalCentavos: persistida ? await totalDaFatura(persistida.id, cliente) : 0,
      };
    }),
  );

  let pendenteTotal = 0;
  let dataMaisAntiga: string | null = null;

  for (const t of reembolsaveis) {
    const restante = pendente(t.reembolsoAlvoCentavos, t.creditos);
    if (restante <= 0) continue;
    pendenteTotal += restante;
    if (dataMaisAntiga === null || t.data < dataMaisAntiga) {
      dataMaisAntiga = t.data;
    }
  }

  const reembolsoPendente =
    pendenteTotal > 0 && dataMaisAntiga !== null
      ? {
          totalCentavos: pendenteTotal,
          diasDoMaisAntigo:
            emDiasAbsolutos(hoje) - emDiasAbsolutos(lerDataCivil(dataMaisAntiga)),
        }
      : null;

  const entrada: EntradaAvisos = {
    orcamentos: resumo.cards.map((c) => ({
      nome: c.nome,
      orcadoCentavos: c.orcadoCentavos,
      gastoCentavos: c.gastoCentavos,
    })),
    faturasProximas,
    reembolsoPendente,
    receitaPrevistaDoProximoMesInformada: previstaProximo > 0,
    proximoMes,
  };

  return limitarAvisos(gerarAvisos(entrada));
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/dados/avisos.test.ts`
Expected: PASS — 8 testes.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npx vitest run`
Expected: PASS — nenhuma regressão.

- [ ] **Step 6: Commit**

```bash
git add src/dados/avisos.ts src/dados/avisos.test.ts
git commit -m "feat(dados): fontes da central de avisos"
```

---

### Task 7: Tela de Orçamentos

**Files:**
- Create: `src/app/(app)/orcamentos/page.tsx`
- Create: `src/app/(app)/orcamentos/acoes.ts`
- Create: `src/app/(app)/orcamentos/orcamentos.module.css`
- Modify: `src/app/(app)/layout.tsx` — acrescentar o destino "Orçamentos" à navegação

**Interfaces:**
- Consumes: `orcamentosDoMes`/`definirAlocacao`/`removerAlocacao` de `@/dados/orcamentos`; `formatarBRL`/`emCentavos` de `@/dominio/dinheiro`; `competenciaDe`/`dataCivilEm`/`somarMeses` de `@/dominio/data`.
- Produces: Server Actions `acaoDefinirAlocacao`, `acaoRemoverAlocacao`.

A tela mostra, para o mês escolhido, cada orçamento com seu valor e uma etiqueta dizendo se aquele valor foi **definido neste mês** ou **herdado** de um mês anterior — e, quando herdado, de qual. Editar grava uma linha nova de vigência naquele mês; remover a definição faz o valor voltar a ser herdado.

- [ ] **Step 1: Criar `src/app/(app)/orcamentos/acoes.ts`**

```ts
'use server';

import { revalidatePath } from 'next/cache';

import { definirAlocacao, removerAlocacao } from '@/dados/orcamentos';
import { emCentavos } from '@/dominio/dinheiro';

export async function acaoDefinirAlocacao(dadosForm: FormData): Promise<void> {
  const bruto = String(dadosForm.get('valor') ?? '').replace(',', '.');
  const numero = Number(bruto);
  if (!Number.isFinite(numero) || numero < 0) {
    throw new Error(`Valor inválido: ${String(dadosForm.get('valor') ?? '')}`);
  }

  await definirAlocacao({
    budgetCategoryId: String(dadosForm.get('budgetCategoryId') ?? ''),
    vigenteDe: String(dadosForm.get('mes') ?? ''),
    valorCentavos: emCentavos(numero),
  });

  revalidatePath('/orcamentos');
  revalidatePath('/');
}

export async function acaoRemoverAlocacao(dadosForm: FormData): Promise<void> {
  await removerAlocacao(
    String(dadosForm.get('budgetCategoryId') ?? ''),
    String(dadosForm.get('mes') ?? ''),
  );

  revalidatePath('/orcamentos');
  revalidatePath('/');
}
```

- [ ] **Step 2: Criar `src/app/(app)/orcamentos/orcamentos.module.css`**

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
  margin-bottom: 18px;
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

.lista {
  border: 1px solid #e5e7eb;
  border-radius: 9px;
  overflow: hidden;
}

.linha {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  flex-wrap: wrap;
}

.linha + .linha {
  border-top: 1px solid #f3f4f6;
}

.cor {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex-shrink: 0;
}

.nome {
  font-size: 13.5px;
  font-weight: 500;
  min-width: 130px;
}

.origem {
  font-size: 11px;
  color: #9ca3af;
  flex: 1;
}

.definido {
  color: #2a78d6;
}

.entrada {
  border: 1px solid #d1d5db;
  border-radius: 7px;
  padding: 6px 9px;
  font-size: 13px;
  font-family: inherit;
  width: 110px;
  text-align: right;
}

.botao {
  background: #111827;
  color: #fff;
  border: none;
  border-radius: 7px;
  padding: 7px 12px;
  font-size: 12px;
  cursor: pointer;
}

.remover {
  background: none;
  border: none;
  color: #6b7280;
  font-size: 11px;
  cursor: pointer;
  text-decoration: underline;
}

.total {
  margin-top: 16px;
  font-size: 14px;
  text-align: right;
}

.vazio {
  padding: 20px 14px;
  font-size: 13px;
  color: #9ca3af;
}
```

- [ ] **Step 3: Criar `src/app/(app)/orcamentos/page.tsx`**

```tsx
import Link from 'next/link';

import { orcamentosDoMes } from '@/dados/orcamentos';
import { competenciaDe, dataCivilEm, somarMeses } from '@/dominio/data';
import { formatarBRL } from '@/dominio/dinheiro';

import { acaoDefinirAlocacao, acaoRemoverAlocacao } from './acoes';
import estilos from './orcamentos.module.css';

/** Paleta do spec, seção 9 — validada para daltonismo nos dois temas. */
const CORES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];

export default async function Orcamentos({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const competencia = mes ?? competenciaDe(dataCivilEm(new Date()));

  const orcamentos = await orcamentosDoMes(competencia);
  const total = orcamentos.reduce((a, o) => a + o.valorCentavos, 0);

  return (
    <>
      <div className={estilos.cabecalho}>
        <h1 style={{ margin: 0 }}>Orçamentos</h1>
      </div>

      <div className={estilos.meses}>
        <Link
          href={`/orcamentos?mes=${somarMeses(competencia, -1)}`}
          className={estilos.mesLink}
        >
          ‹ {somarMeses(competencia, -1)}
        </Link>
        <span className={estilos.mesAtual}>{competencia}</span>
        <Link
          href={`/orcamentos?mes=${somarMeses(competencia, 1)}`}
          className={estilos.mesLink}
        >
          {somarMeses(competencia, 1)} ›
        </Link>
      </div>

      <p style={{ fontSize: 12.5, color: '#6b7280', marginTop: 0, marginBottom: 16 }}>
        Alterar um mês vale dele em diante, até a próxima mudança — meses
        anteriores não mudam.
      </p>

      {orcamentos.length === 0 ? (
        <div className={estilos.vazio}>
          Nenhum orçamento cadastrado. Crie categorias em{' '}
          <Link href="/ajustes">Ajustes</Link>.
        </div>
      ) : (
        <>
          <div className={estilos.lista}>
            {orcamentos.map((o) => {
              const definidoAqui = o.vigenteDe === competencia;
              return (
                <div key={o.categoriaId} className={estilos.linha}>
                  <span
                    className={estilos.cor}
                    style={{ background: CORES[o.corSlot - 1] }}
                  />
                  <span className={estilos.nome}>{o.nome}</span>

                  <span className={estilos.origem}>
                    {o.vigenteDe === null ? (
                      'sem orçamento definido'
                    ) : definidoAqui ? (
                      <span className={estilos.definido}>definido neste mês</span>
                    ) : (
                      `herdado de ${o.vigenteDe}`
                    )}
                  </span>

                  <form action={acaoDefinirAlocacao} className={estilos.linha} style={{ padding: 0, gap: 8 }}>
                    <input type="hidden" name="budgetCategoryId" value={o.categoriaId} />
                    <input type="hidden" name="mes" value={competencia} />
                    <input
                      name="valor"
                      className={estilos.entrada}
                      inputMode="decimal"
                      defaultValue={(o.valorCentavos / 100).toFixed(2)}
                      aria-label={`Orçamento de ${o.nome} em ${competencia}`}
                    />
                    <button type="submit" className={estilos.botao}>
                      Salvar
                    </button>
                  </form>

                  {definidoAqui ? (
                    <form action={acaoRemoverAlocacao}>
                      <input type="hidden" name="budgetCategoryId" value={o.categoriaId} />
                      <input type="hidden" name="mes" value={competencia} />
                      <button type="submit" className={estilos.remover}>
                        voltar a herdar
                      </button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className={estilos.total}>
            Total orçado em {competencia}: <strong>{formatarBRL(total)}</strong>
          </div>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 4: Acrescentar o destino à navegação**

Em `src/app/(app)/layout.tsx`, o array `DESTINOS` hoje tem quatro entradas. Acrescente **Orçamentos** logo depois de Painel, deixando o array assim:

```tsx
const DESTINOS = [
  { href: '/', rotulo: 'Painel' },
  { href: '/orcamentos', rotulo: 'Orçamentos' },
  { href: '/lancamentos', rotulo: 'Lançamentos' },
  { href: '/cartoes', rotulo: 'Cartões' },
  { href: '/ajustes', rotulo: 'Ajustes' },
];
```

- [ ] **Step 5: Rodar a suíte e o build**

Run: `npx vitest run && npm run build`
Expected: testes passam (esta tarefa não adiciona testes automatizados) e o build compila sem erro de tipo.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): tela de orçamentos com herdado × definido"
```

---

### Task 8: Tela de Receitas

**Files:**
- Create: `src/app/(app)/receitas/page.tsx`
- Create: `src/app/(app)/receitas/acoes.ts`
- Create: `src/app/(app)/receitas/receitas.module.css`
- Modify: `src/app/(app)/layout.tsx` — acrescentar o destino "Receitas"

**Interfaces:**
- Consumes: `criarReceita`/`listarReceitas`/`apagarReceita`/`criarReceitaPrevista`/`listarReceitasPrevistas`/`apagarReceitaPrevista` de `@/dados/receitas`; `formatarBRL`/`emCentavos` de `@/dominio/dinheiro`; `competenciaDe`/`dataCivilEm`/`formatarDataCivil`/`somarMeses` de `@/dominio/data`.
- Produces: Server Actions `acaoCriarReceita`, `acaoApagarReceita`, `acaoCriarReceitaPrevista`, `acaoApagarReceitaPrevista`.

Duas seções no mesmo mês: o que **entrou** (receitas realizadas) e o que **está previsto entrar** (que alimenta a projeção dos meses futuros).

- [ ] **Step 1: Criar `src/app/(app)/receitas/acoes.ts`**

```ts
'use server';

import { revalidatePath } from 'next/cache';

import {
  apagarReceita,
  apagarReceitaPrevista,
  criarReceita,
  criarReceitaPrevista,
} from '@/dados/receitas';
import type { MetodoPagamento } from '@/dominio/lancamento';
import { emCentavos } from '@/dominio/dinheiro';

function lerValorEmCentavos(dadosForm: FormData, campo: string): number {
  const bruto = String(dadosForm.get(campo) ?? '').replace(',', '.');
  const numero = Number(bruto);
  if (!Number.isFinite(numero) || numero <= 0) {
    throw new Error(`Valor inválido: ${String(dadosForm.get(campo) ?? '')}`);
  }
  return emCentavos(numero);
}

function revalidar(): void {
  revalidatePath('/receitas');
  revalidatePath('/');
}

export async function acaoCriarReceita(dadosForm: FormData): Promise<void> {
  await criarReceita({
    descricao: String(dadosForm.get('descricao') ?? ''),
    valorCentavos: lerValorEmCentavos(dadosForm, 'valor'),
    data: String(dadosForm.get('data') ?? ''),
    metodo: String(dadosForm.get('metodo') ?? 'PIX') as MetodoPagamento,
  });
  revalidar();
}

export async function acaoApagarReceita(dadosForm: FormData): Promise<void> {
  await apagarReceita(String(dadosForm.get('id') ?? ''));
  revalidar();
}

export async function acaoCriarReceitaPrevista(dadosForm: FormData): Promise<void> {
  await criarReceitaPrevista({
    competencia: String(dadosForm.get('competencia') ?? ''),
    descricao: String(dadosForm.get('descricao') ?? ''),
    valorCentavos: lerValorEmCentavos(dadosForm, 'valor'),
  });
  revalidar();
}

export async function acaoApagarReceitaPrevista(dadosForm: FormData): Promise<void> {
  await apagarReceitaPrevista(String(dadosForm.get('id') ?? ''));
  revalidar();
}
```

- [ ] **Step 2: Criar `src/app/(app)/receitas/receitas.module.css`**

```css
.meses {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 13px;
  margin-bottom: 20px;
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

.secao {
  margin-bottom: 34px;
}

.titulo {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
}

.explica {
  font-size: 12px;
  color: #6b7280;
  margin: 0 0 12px;
}

.form {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  flex-wrap: wrap;
  margin-bottom: 14px;
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
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 13px;
  font-size: 13px;
}

.item + .item {
  border-top: 1px solid #f3f4f6;
}

.descricao {
  flex: 1;
}

.meta {
  color: #9ca3af;
  font-size: 11.5px;
}

.valor {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: #16a34a;
}

.apagar {
  background: none;
  border: none;
  color: #dc2626;
  font-size: 11px;
  cursor: pointer;
}

.vazio {
  padding: 16px 13px;
  font-size: 13px;
  color: #9ca3af;
}

.total {
  margin-top: 12px;
  font-size: 14px;
  text-align: right;
}
```

- [ ] **Step 3: Criar `src/app/(app)/receitas/page.tsx`**

```tsx
import Link from 'next/link';

import {
  listarReceitas,
  listarReceitasPrevistas,
} from '@/dados/receitas';
import {
  competenciaDe,
  dataCivilEm,
  formatarDataCivil,
  somarMeses,
} from '@/dominio/data';
import { formatarBRL } from '@/dominio/dinheiro';

import {
  acaoApagarReceita,
  acaoApagarReceitaPrevista,
  acaoCriarReceita,
  acaoCriarReceitaPrevista,
} from './acoes';
import estilos from './receitas.module.css';

export default async function Receitas({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const competencia = mes ?? competenciaDe(dataCivilEm(new Date()));
  const hoje = formatarDataCivil(dataCivilEm(new Date()));

  const [realizadas, previstas] = await Promise.all([
    listarReceitas(competencia),
    listarReceitasPrevistas(competencia),
  ]);

  const totalRealizado = realizadas.reduce((a, r) => a + r.valorCentavos, 0);
  const totalPrevisto = previstas.reduce((a, r) => a + r.valorCentavos, 0);

  return (
    <>
      <h1>Receitas</h1>

      <div className={estilos.meses}>
        <Link
          href={`/receitas?mes=${somarMeses(competencia, -1)}`}
          className={estilos.mesLink}
        >
          ‹ {somarMeses(competencia, -1)}
        </Link>
        <span className={estilos.mesAtual}>{competencia}</span>
        <Link
          href={`/receitas?mes=${somarMeses(competencia, 1)}`}
          className={estilos.mesLink}
        >
          {somarMeses(competencia, 1)} ›
        </Link>
      </div>

      <section className={estilos.secao}>
        <div className={estilos.titulo}>Recebido</div>
        <p className={estilos.explica}>O que de fato entrou neste mês.</p>

        <form action={acaoCriarReceita} className={estilos.form}>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="r-descricao">
              Descrição
            </label>
            <input
              id="r-descricao"
              name="descricao"
              required
              className={estilos.entrada}
              placeholder="Salário"
            />
          </div>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="r-valor">
              Valor (R$)
            </label>
            <input
              id="r-valor"
              name="valor"
              required
              inputMode="decimal"
              className={estilos.entrada}
              placeholder="6090,00"
              style={{ width: 110 }}
            />
          </div>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="r-data">
              Data
            </label>
            <input
              id="r-data"
              name="data"
              type="date"
              required
              defaultValue={hoje}
              className={estilos.entrada}
            />
          </div>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="r-metodo">
              Método
            </label>
            <select id="r-metodo" name="metodo" className={estilos.entrada}>
              <option value="PIX">Pix</option>
              <option value="DEBITO">Débito</option>
              <option value="DINHEIRO">Dinheiro</option>
              <option value="BOLETO">Boleto</option>
            </select>
          </div>
          <button type="submit" className={estilos.botao}>
            Registrar
          </button>
        </form>

        <div className={estilos.lista}>
          {realizadas.length === 0 ? (
            <div className={estilos.vazio}>Nenhuma receita registrada em {competencia}.</div>
          ) : (
            realizadas.map((r) => (
              <div key={r.id} className={estilos.item}>
                <span className={estilos.descricao}>
                  {r.descricao}
                  <div className={estilos.meta}>
                    {r.data} · {r.metodo}
                  </div>
                </span>
                <span className={estilos.valor}>{formatarBRL(r.valorCentavos)}</span>
                <form action={acaoApagarReceita}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className={estilos.apagar}>
                    apagar
                  </button>
                </form>
              </div>
            ))
          )}
        </div>

        {realizadas.length > 0 ? (
          <div className={estilos.total}>
            Total recebido: <strong>{formatarBRL(totalRealizado)}</strong>
          </div>
        ) : null}
      </section>

      <section className={estilos.secao}>
        <div className={estilos.titulo}>Previsto</div>
        <p className={estilos.explica}>
          Quanto você espera receber neste mês. É daqui que sai a projeção de
          quanto vai sobrar num mês que ainda não aconteceu.
        </p>

        <form action={acaoCriarReceitaPrevista} className={estilos.form}>
          <input type="hidden" name="competencia" value={competencia} />
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="p-descricao">
              Descrição
            </label>
            <input
              id="p-descricao"
              name="descricao"
              required
              className={estilos.entrada}
              placeholder="Salário"
            />
          </div>
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor="p-valor">
              Valor (R$)
            </label>
            <input
              id="p-valor"
              name="valor"
              required
              inputMode="decimal"
              className={estilos.entrada}
              placeholder="6090,00"
              style={{ width: 110 }}
            />
          </div>
          <button type="submit" className={estilos.botao}>
            Prever
          </button>
        </form>

        <div className={estilos.lista}>
          {previstas.length === 0 ? (
            <div className={estilos.vazio}>
              Nenhuma previsão para {competencia}.
            </div>
          ) : (
            previstas.map((r) => (
              <div key={r.id} className={estilos.item}>
                <span className={estilos.descricao}>{r.descricao}</span>
                <span className={estilos.valor}>{formatarBRL(r.valorCentavos)}</span>
                <form action={acaoApagarReceitaPrevista}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className={estilos.apagar}>
                    apagar
                  </button>
                </form>
              </div>
            ))
          )}
        </div>

        {previstas.length > 0 ? (
          <div className={estilos.total}>
            Total previsto: <strong>{formatarBRL(totalPrevisto)}</strong>
          </div>
        ) : null}
      </section>
    </>
  );
}
```

- [ ] **Step 4: Acrescentar o destino à navegação**

Em `src/app/(app)/layout.tsx`, o array `DESTINOS` já ganhou "Orçamentos" na Task 7. Acrescente **Receitas** logo depois de Lançamentos, deixando o array assim:

```tsx
const DESTINOS = [
  { href: '/', rotulo: 'Painel' },
  { href: '/orcamentos', rotulo: 'Orçamentos' },
  { href: '/lancamentos', rotulo: 'Lançamentos' },
  { href: '/receitas', rotulo: 'Receitas' },
  { href: '/cartoes', rotulo: 'Cartões' },
  { href: '/ajustes', rotulo: 'Ajustes' },
];
```

- [ ] **Step 5: Rodar a suíte e o build**

Run: `npx vitest run && npm run build`
Expected: testes passam e o build compila sem erro de tipo.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): tela de receitas realizadas e previstas"
```

---

### Task 9: Painel — herói e cards de orçamento

O placeholder da home vira a tela que responde "quanto ainda tenho para gastar".

**Files:**
- Modify: `src/app/(app)/page.tsx` — substituir o placeholder inteiro
- Create: `src/app/(app)/painel.module.css`

**Interfaces:**
- Consumes: `resumoDoMes` de `@/dados/painel`; `formatarBRL` de `@/dominio/dinheiro`; `competenciaDe`/`dataCivilEm`/`somarMeses` de `@/dominio/data`.
- Produces: a home autenticada, agora exibindo o resumo do mês.

Layout aprovado nos mockups: herói com a sobra projetada e a barra de consumo dividida em três, e abaixo os cards de orçamento em grade, já ordenados por criticidade pelo modelo de leitura. O número grande de cada card é o **restante**, não o gasto — é ele que responde "posso gastar isso?".

- [ ] **Step 1: Criar `src/app/(app)/painel.module.css`**

```css
.cabecalho {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 11px;
  margin-bottom: 14px;
  gap: 12px;
  flex-wrap: wrap;
}

.meses {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 14px;
}

.mesLink {
  color: #9ca3af;
  text-decoration: none;
  padding: 2px 6px;
  border-radius: 6px;
}

.mesLink:hover {
  background: #f3f4f6;
}

.mesAtual {
  font-size: 15px;
  font-weight: 600;
}

.realizado {
  text-align: right;
}

.realizado b {
  display: block;
  font-size: 14px;
  color: #6b7280;
  font-variant-numeric: tabular-nums;
}

.realizado span {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #9ca3af;
}

.heroi {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 14px;
}

.heroiRotulo {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: #9ca3af;
}

.heroiValor {
  font-size: 28px;
  font-weight: 680;
  letter-spacing: -0.9px;
  margin: 2px 0 11px;
}

.positivo {
  color: #16a34a;
}

.negativo {
  color: #dc2626;
}

.heroiValor em {
  font-size: 12px;
  font-weight: 400;
  color: #6b7280;
  font-style: normal;
  margin-left: 7px;
}

.trilha {
  height: 9px;
  background: #e5e7eb;
  border-radius: 99px;
  overflow: hidden;
  display: flex;
  gap: 2px;
}

.legenda {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #6b7280;
  margin-top: 6px;
  gap: 8px;
  flex-wrap: wrap;
}

.grade {
  display: grid;
  gap: 9px;
  grid-template-columns: repeat(3, 1fr);
}

.card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px;
  position: relative;
}

.cardConcluido {
  opacity: 0.45;
}

.cardNome {
  font-size: 11px;
  color: #6b7280;
  font-weight: 500;
  margin-bottom: 7px;
}

.cardValor {
  font-size: 20px;
  font-weight: 660;
  letter-spacing: -0.5px;
  font-variant-numeric: tabular-nums;
}

.cardSub {
  font-size: 10px;
  color: #9ca3af;
  margin-top: 2px;
}

.cardTrilha {
  height: 5px;
  background: #e5e7eb;
  border-radius: 99px;
  margin-top: 9px;
  overflow: hidden;
}

.cardPreenchimento {
  height: 100%;
  border-radius: 99px;
}

.bandeira {
  position: absolute;
  top: 10px;
  right: 11px;
  font-size: 11px;
}

.vazio {
  padding: 28px 14px;
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
}

@media (max-width: 720px) {
  .grade {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

- [ ] **Step 2: Substituir `src/app/(app)/page.tsx`**

```tsx
import Link from 'next/link';

import { resumoDoMes } from '@/dados/painel';
import { competenciaDe, dataCivilEm, somarMeses } from '@/dominio/data';
import { formatarBRL } from '@/dominio/dinheiro';

import estilos from './painel.module.css';

const VERDE = '#16a34a';
const AMBAR = '#d97706';
const VERMELHO = '#dc2626';
const CINZA = '#9ca3af';

/** Largura de uma faixa da barra, em porcentagem. Nunca negativa. */
function largura(parte: number, total: number): string {
  if (total <= 0) return '0%';
  return `${Math.max(0, (parte / total) * 100)}%`;
}

export default async function Painel({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const competencia = mes ?? competenciaDe(dataCivilEm(new Date()));
  const resumo = await resumoDoMes(competencia);

  const sobra = resumo.sobraProjetada;

  return (
    <>
      <div className={estilos.cabecalho}>
        <div className={estilos.meses}>
          <Link href={`/?mes=${somarMeses(competencia, -1)}`} className={estilos.mesLink}>
            ‹
          </Link>
          <span className={estilos.mesAtual}>{competencia}</span>
          <Link href={`/?mes=${somarMeses(competencia, 1)}`} className={estilos.mesLink}>
            ›
          </Link>
        </div>
        <div className={estilos.realizado}>
          <b>{formatarBRL(resumo.sobraRealizada)}</b>
          <span>realizado até aqui</span>
        </div>
      </div>

      <div className={estilos.heroi}>
        <div className={estilos.heroiRotulo}>
          {resumo.ehMesPassado ? 'Sobrou neste mês' : 'Sobra projetada do fechamento'}
        </div>
        <div
          className={`${estilos.heroiValor} ${sobra >= 0 ? estilos.positivo : estilos.negativo}`}
        >
          {formatarBRL(sobra)}
          <em>de {formatarBRL(resumo.receitaConsiderada)} de receita</em>
        </div>

        <div className={estilos.trilha}>
          <div
            style={{
              width: largura(resumo.faixas.gastoCentavos, resumo.receitaConsiderada),
              background: VERDE,
            }}
          />
          <div
            style={{
              width: largura(
                resumo.faixas.comprometidoCentavos,
                resumo.receitaConsiderada,
              ),
              background: AMBAR,
            }}
          />
        </div>
        <div className={estilos.legenda}>
          <span>{formatarBRL(resumo.faixas.gastoCentavos)} já gastos</span>
          <span>{formatarBRL(resumo.faixas.comprometidoCentavos)} comprometidos</span>
          <span>{formatarBRL(resumo.faixas.livreCentavos)} livres</span>
        </div>
      </div>

      {resumo.cards.length === 0 ? (
        <div className={estilos.vazio}>
          Nenhum orçamento definido. Comece em{' '}
          <Link href="/orcamentos">Orçamentos</Link>.
        </div>
      ) : (
        <div className={estilos.grade}>
          {resumo.cards.map((c) => {
            const cor =
              c.estado === 'ESTOURADO'
                ? VERMELHO
                : c.estado === 'CONCLUIDO'
                  ? CINZA
                  : c.restanteCentavos <= c.orcadoCentavos * 0.1
                    ? AMBAR
                    : VERDE;

            const consumido =
              c.orcadoCentavos > 0
                ? Math.min(100, (c.gastoCentavos / c.orcadoCentavos) * 100)
                : 100;

            return (
              <div
                key={c.categoriaId}
                className={`${estilos.card} ${c.estado === 'CONCLUIDO' ? estilos.cardConcluido : ''}`}
              >
                {c.estado === 'ESTOURADO' ? (
                  <span className={estilos.bandeira}>🔴</span>
                ) : null}
                <div className={estilos.cardNome}>{c.nome}</div>
                <div className={estilos.cardValor} style={{ color: cor }}>
                  {formatarBRL(c.restanteCentavos)}
                </div>
                <div className={estilos.cardSub}>
                  gastou {formatarBRL(c.gastoCentavos)} de{' '}
                  {formatarBRL(c.orcadoCentavos)}
                </div>
                <div className={estilos.cardTrilha}>
                  <div
                    className={estilos.cardPreenchimento}
                    style={{ width: `${consumido}%`, background: cor }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Rodar a suíte e o build**

Run: `npx vitest run && npm run build`
Expected: testes passam e o build compila sem erro de tipo.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(ui): painel com herói da sobra e cards de orçamento"
```

---

### Task 10: Painel — central de avisos

**Files:**
- Modify: `src/app/(app)/page.tsx` — inserir o bloco de avisos entre o herói e a grade
- Modify: `src/app/(app)/painel.module.css` — acrescentar os estilos dos avisos

**Interfaces:**
- Consumes: `avisosDoMes` de `@/dados/avisos`; `type Severidade` de `@/dominio/avisos`.
- Produces: o bloco de avisos no painel.

Cada aviso é uma faixa própria, com barra colorida à esquerda, ordenadas por urgência — exatamente como validado nos mockups. Clicar leva ao lugar de resolver.

- [ ] **Step 1: Acrescentar os estilos ao fim de `src/app/(app)/painel.module.css`**

```css
.avisos {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}

.aviso {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 12px;
  border: 1px solid;
  border-left-width: 3px;
  text-decoration: none;
}

.avisoVermelho {
  background: #fef2f2;
  border-color: #fecaca;
  border-left-color: #dc2626;
  color: #991b1b;
}

.avisoAmarelo {
  background: #fffbeb;
  border-color: #fde68a;
  border-left-color: #d97706;
  color: #92400e;
}

.avisoAzul {
  background: #eff6ff;
  border-color: #bfdbfe;
  border-left-color: #2563eb;
  color: #1e40af;
}

.avisoCinza {
  background: #f9fafb;
  border-color: #e5e7eb;
  border-left-color: #9ca3af;
  color: #4b5563;
}

.avisoTexto {
  flex: 1;
}

.avisoIr {
  font-size: 11px;
  opacity: 0.6;
}

.avisoMais {
  font-size: 11px;
  color: #6b7280;
  padding: 4px 12px;
}
```

- [ ] **Step 2: Inserir o bloco de avisos em `src/app/(app)/page.tsx`**

Três mudanças no arquivo, todas pequenas.

Primeiro, acrescente aos imports do topo:

```tsx
import { avisosDoMes } from '@/dados/avisos';
import type { Severidade } from '@/dominio/avisos';
```

Segundo, acrescente este mapa logo depois das constantes de cor (`VERDE`, `AMBAR`, `VERMELHO`, `CINZA`), antes da função `largura`:

```tsx
const CLASSE_DA_SEVERIDADE: Record<Severidade, string> = {
  VERMELHO: estilos.avisoVermelho,
  AMARELO: estilos.avisoAmarelo,
  AZUL: estilos.avisoAzul,
  CINZA: estilos.avisoCinza,
};

const ICONE_DA_SEVERIDADE: Record<Severidade, string> = {
  VERMELHO: '⚠',
  AMARELO: '◐',
  AZUL: '↩',
  CINZA: '✎',
};
```

Terceiro, troque a linha que busca só o resumo:

```tsx
  const resumo = await resumoDoMes(competencia);
```

por esta, que busca as duas coisas em paralelo:

```tsx
  const [resumo, avisos] = await Promise.all([
    resumoDoMes(competencia),
    avisosDoMes(competencia),
  ]);
```

E insira este bloco **entre** o fechamento do `<div className={estilos.heroi}>` e o `{resumo.cards.length === 0 ? (`:

```tsx
      {avisos.visiveis.length > 0 ? (
        <div className={estilos.avisos}>
          {avisos.visiveis.map((a, i) => (
            <Link
              key={`${a.severidade}-${i}`}
              href={a.href}
              className={`${estilos.aviso} ${CLASSE_DA_SEVERIDADE[a.severidade]}`}
            >
              <span>{ICONE_DA_SEVERIDADE[a.severidade]}</span>
              <span className={estilos.avisoTexto}>{a.texto}</span>
              <span className={estilos.avisoIr}>ver ›</span>
            </Link>
          ))}
          {avisos.ocultos > 0 ? (
            <div className={estilos.avisoMais}>
              + {avisos.ocultos} aviso{avisos.ocultos > 1 ? 's' : ''} de menor
              prioridade
            </div>
          ) : null}
        </div>
      ) : null}
```

- [ ] **Step 3: Rodar a suíte e o build**

Run: `npx vitest run && npm run build`
Expected: testes passam e o build compila sem erro de tipo.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(ui): central de avisos no painel"
```

---

## Ao terminar

Este plano fecha a pergunta que motivou o app: abrir o Painel e ver quanto ainda cabe em cada orçamento, e quanto deve sobrar no fim do mês.

Antes de começar o Plano 4, confirme no navegador com sessão real:

- [ ] `npx vitest run` passa inteiro e `npm run build` compila
- [ ] Em **Orçamentos**, definir um valor em setembro e navegar para outubro mostra "herdado de 2026-09"
- [ ] Definir um valor diferente em dezembro **não** muda outubro nem novembro
- [ ] "Voltar a herdar" remove a definição do mês e o valor volta ao herdado
- [ ] Em **Receitas**, registrar um salário faz o herói do Painel mudar
- [ ] No **Painel**, um orçamento estourado aparece em vermelho, no topo, e gera um aviso
- [ ] As três faixas da barra do herói somam a receita — confira os três números da legenda

**Fica para os planos seguintes:** aba de Áreas e aba de Fluxo (Plano 4); reembolso e estorno na interface, mais a janela de faturas em `/cartoes` (Plano 5); despesas recorrentes e PWA (Plano 6).
