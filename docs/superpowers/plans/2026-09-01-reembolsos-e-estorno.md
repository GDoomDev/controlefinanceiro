# Reembolsos e Estorno — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o ciclo do dinheiro que volta — a tela de Reembolsos ("quem me deve?"), o recebimento parcial ou total, o formulário de estorno com prévia do efeito exato, e a janela de faturas em `/cartoes`.

**Architecture:** Continua a separação em três camadas dos Planos 1–4. O domínio de reembolso e estorno **já existe** desde o Plano 1 (`src/dominio/reembolso.ts`: `pendente`, `validarRecebimento`, `planejarEstorno`, `planejarEstornoParcial`) e nunca foi ligado à interface — este plano o completa com o estado derivado e o resumo da prévia, escreve a camada de dados que faltava, e constrói as telas. O formulário de estorno roda o mesmo `planejarEstorno` no navegador para a prévia ao vivo e no servidor na gravação, exatamente como o formulário de lançamento já faz com `planejarLancamento` desde o Plano 2.

**Tech Stack:** Next.js 16 (App Router, Server Components + um Client Component para a prévia), TypeScript strict, Prisma 6.19.3, Postgres (Neon), Vitest, CSS Modules.

## Global Constraints

- Dinheiro é sempre **inteiro em centavos**. Ponto flutuante não aparece em nenhum ponto do domínio como valor monetário.
- Competência é sempre `"YYYY-MM"`; comparação entre competências é lexicográfica sobre a string zero-padded.
- Data civil é sempre `"YYYY-MM-DD"`. Um `Date` nunca cruza fronteira de persistência.
- Todo cálculo de mês/dia fixa o fuso em `America/Sao_Paulo` — sempre via `@/dominio/data`, nunca com `getMonth()`/`getDate()` direto.
- `src/dominio/` **não importa** Prisma, React, Next, nem faz I/O.
- `src/dados/` **não contém regra de negócio**: busca linhas e delega o cálculo ao domínio.
- `src/app/` **não recalcula regra de domínio**.
- Toda função de `src/dados/` recebe `cliente: ClientePrisma = prisma` como último parâmetro.
- **Todo teste que escreve no banco roda dentro de `comRollback(async (tx) => {...})` e passa `tx`** — nunca o `prisma` nu. Os testes rodam contra o Postgres real, não há banco de teste separado.
- **Toda asserção sobre uma lista global** (que devolve tudo do banco, como `listarReembolsos`) filtra pelos ids que o próprio teste criou — `resultado.pendentes.find((r) => r.transactionId === id)` — nunca asserta o tamanho total da lista nem soma tudo.
- **`BudgetCategory.nome` e `Card.nome` são `@unique` no schema.** Nomes de fixture não podem repetir os de outro arquivo de teste: o rollback isola escrita, mas dois arquivos rodando em paralelo colidem no índice único. Os nomes deste plano (`Reembolsáveis`, `Estornáveis`, `Casa do estorno`, `Cartão do estorno`) foram escolhidos para não colidir com os já usados na suíte.
- **`origem` separa os dois créditos e nunca pode ser ignorada.** Um `Credito` de origem `ESTORNO` **não** abate reembolso pendente; um de origem `REEMBOLSO` **não** abate fatura. Toda consulta que soma créditos filtra por `origem` explicitamente. Esse exato bug já foi encontrado duas vezes neste projeto (`totalDaFatura` no Plano 2, `avisosDoMes` no Plano 3) — é a regressão mais provável deste plano.
- **O crédito de reembolso vale na competência ORIGINAL da despesa** (`competenciaCredito = transaction.competencia`), qualquer que seja a data do recebimento (spec §6.1). Nunca derive a competência do crédito a partir de `recebidoEm`.
- Cancelamento e crédito de um estorno são gravados **numa transação só** — tudo ou nada (spec §13).
- Transação `CANCELADA` é preservada no banco, nunca apagada (spec §13).
- Prisma fica pinado em `6.19.3` (sem `^`).
- TypeScript em modo strict; `npx vitest run`, `npx tsc --noEmit`, `npm run lint` e `npm run build` limpos ao fim de cada tarefa.

**Fora do escopo deste plano:** despesas recorrentes e PWA (Plano 6).

**Divergência conhecida, herdada e deixada para o Plano 6:** o spec §8 descreve sete destinos, com "barra inferior com quatro ícones mais 'Mais' no celular, e botão flutuante de novo lançamento sempre acessível". A navegação hoje tem oito destinos numa lista plana, e este plano acrescenta o nono (Reembolsos), sem botão flutuante. Reestruturar a navegação em quatro-mais-"Mais" é trabalho de casca móvel, que é o assunto do Plano 6 — não se resolve de passagem aqui.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/dominio/data.ts` | **Modificado.** Ganha `diasEntre` — hoje essa aritmética está duplicada como helper privado dentro de `src/dados/avisos.ts`, que é camada de dados. Este plano precisa dela numa terceira. |
| `src/dados/avisos.ts` | **Modificado.** Passa a usar `diasEntre` do domínio; o helper privado sai. |
| `src/dominio/reembolso.ts` | **Modificado.** Ganha o estado derivado (`estadoDoReembolso`), a ordenação da tela, e o resumo da prévia do estorno (`resumirPlanoEstorno`). O que já existe ali não muda. |
| `src/dominio/fatura.ts` | **Modificado.** Ganha `janelaDeFaturas` — qual faixa de faturas `/cartoes` mostra. |
| `src/dados/reembolsos.ts` | **Novo.** Lista os reembolsáveis com pendente/estado calculados pelo domínio, e grava um recebimento. |
| `src/dados/estorno.ts` | **Novo.** Monta o alvo do estorno (parcelas + status da fatura de cada uma) e aplica o plano do domínio numa transação só. |
| `src/app/(app)/reembolsos/page.tsx` | **Novo.** Tela de Reembolsos. |
| `src/app/(app)/reembolsos/acoes.ts` | **Novo.** Server Action do recebimento. |
| `src/app/(app)/reembolsos/reembolsos.module.css` | **Novo.** Estilos da tela. |
| `src/app/(app)/lancamentos/[id]/estornar/page.tsx` | **Novo.** Server Component que busca o alvo e entrega ao formulário. |
| `src/app/(app)/lancamentos/[id]/estornar/estorno.tsx` | **Novo.** Client Component: prévia ao vivo do efeito exato. |
| `src/app/(app)/lancamentos/[id]/estornar/acoes.ts` | **Novo.** Server Action do estorno. |
| `src/app/(app)/lancamentos/[id]/estornar/estorno.module.css` | **Novo.** Estilos do formulário. |
| `src/app/(app)/lancamentos/page.tsx` | **Modificado.** Ganha o link "estornar" em cada linha. |
| `src/app/(app)/cartoes/page.tsx` | **Modificado.** Passa a mostrar só a janela de faturas, com link "ver todas". |
| `src/dominio/avisos.ts` | **Modificado.** O aviso azul de reembolso passa a apontar para `/reembolsos` em vez de `/lancamentos`. |
| `src/app/(app)/layout.tsx` | **Modificado.** Destino novo na navegação. |

---

## Task 1: Domínio do reembolso — estado derivado e ordenação

O spec §6.1 define quatro estados e diz que eles são **derivados, nunca armazenados** — "não há campo de status que possa divergir dos valores". A tela precisa desse estado e de uma ordem. Precisa também saber há quantos dias cada pendência está parada, e essa aritmética de datas hoje mora, como helper privado, dentro de `src/dados/avisos.ts` — camada errada, e este plano seria a terceira cópia.

**Files:**
- Modify: `src/dominio/data.ts`
- Test: `src/dominio/data.test.ts`
- Modify: `src/dados/avisos.ts`
- Modify: `src/dominio/reembolso.ts`
- Test: `src/dominio/reembolso.test.ts`

**Interfaces:**
- Consumes: `DataCivil` de `@/dominio/data`, `Centavos` de `@/dominio/dinheiro`, e o que `reembolso.ts` já exporta (`Recebimento`, `recebido`, `pendente`).
- Produces:
  - `diasEntre(de: DataCivil, ate: DataCivil): number` em `data.ts`
  - `type EstadoReembolso = 'NAO_REEMBOLSAVEL' | 'PENDENTE' | 'PARCIAL' | 'QUITADO'`
  - `estadoDoReembolso(alvoCentavos: Centavos, recebimentos: Recebimento[]): EstadoReembolso`
  - `interface ReembolsoOrdenavel { diasParado: number; pendenteCentavos: Centavos }`
  - `ordenarPorAntiguidade<T extends ReembolsoOrdenavel>(itens: T[]): T[]`

**A tabela do spec §6.1, que `estadoDoReembolso` implementa literalmente:**

| Situação | Estado |
|---|---|
| `alvo = 0` | `NAO_REEMBOLSAVEL` |
| `recebido = 0` | `PENDENTE` |
| `0 < recebido < alvo` | `PARCIAL` |
| `recebido = alvo` | `QUITADO` |

**Ordem da tela:** mais parado primeiro (`diasParado` decrescente), desempatando por maior pendente. A pergunta que a tela responde é "quem me deve?", e o sinal de risco que o próprio app já escolheu para o assunto é a idade — o aviso azul do Painel dispara em "pendente lançado há mais de 30 dias", não em valor. Quem está parado há mais tempo é quem precisa ser cobrado.

- [ ] **Step 1: Escrever os testes de `diasEntre` que falham**

Adicione ao fim de `src/dominio/data.test.ts`. Some `diasEntre` ao `import` de `./data` que já existe no arquivo — não crie um segundo.

```ts
describe('diasEntre', () => {
  it('conta os dias entre duas datas do mesmo mês', () => {
    expect(diasEntre({ ano: 2026, mes: 9, dia: 1 }, { ano: 2026, mes: 9, dia: 15 })).toBe(14);
  });

  it('é zero para a mesma data', () => {
    expect(diasEntre({ ano: 2026, mes: 9, dia: 7 }, { ano: 2026, mes: 9, dia: 7 })).toBe(0);
  });

  it('é negativo quando a segunda data é anterior', () => {
    expect(diasEntre({ ano: 2026, mes: 9, dia: 15 }, { ano: 2026, mes: 9, dia: 1 })).toBe(-14);
  });

  it('atravessa a virada de mês', () => {
    expect(diasEntre({ ano: 2026, mes: 8, dia: 30 }, { ano: 2026, mes: 9, dia: 2 })).toBe(3);
  });

  it('atravessa a virada de ano', () => {
    expect(diasEntre({ ano: 2026, mes: 12, dia: 28 }, { ano: 2027, mes: 1, dia: 4 })).toBe(7);
  });

  it('conta o dia extra de um ano bissexto', () => {
    // 2028 é bissexto: fevereiro tem 29 dias.
    expect(diasEntre({ ano: 2028, mes: 2, dia: 28 }, { ano: 2028, mes: 3, dia: 1 })).toBe(2);
    // 2027 não é: fevereiro tem 28.
    expect(diasEntre({ ano: 2027, mes: 2, dia: 28 }, { ano: 2027, mes: 3, dia: 1 })).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/dominio/data.test.ts`
Expected: FAIL — `diasEntre is not a function`.

- [ ] **Step 3: Implementar `diasEntre`**

Acrescente ao fim de `src/dominio/data.ts`:

```ts
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
```

- [ ] **Step 4: Rodar os testes de data**

Run: `npx vitest run src/dominio/data.test.ts`
Expected: PASS.

- [ ] **Step 5: Fazer `avisos.ts` usar a função do domínio**

Em `src/dados/avisos.ts`: apague o helper privado

```ts
/** Converte uma data civil num número de dias absoluto, para subtrair datas. */
function emDiasAbsolutos(d: DataCivil): number {
  return Math.floor(Date.UTC(d.ano, d.mes - 1, d.dia) / 86400000);
}
```

e troque os dois usos pela função do domínio (some `diasEntre` ao import de `@/dominio/data` que já existe no arquivo):

- `diasParaFechar: emDiasAbsolutos(aberta.fechamento) - emDiasAbsolutos(hoje)` vira
  `diasParaFechar: diasEntre(hoje, aberta.fechamento)`
- `diasDoMaisAntigo: emDiasAbsolutos(hoje) - emDiasAbsolutos(lerDataCivil(dataMaisAntiga))` vira
  `diasDoMaisAntigo: diasEntre(lerDataCivil(dataMaisAntiga), hoje)`

Confira a ordem dos argumentos nos dois casos — `diasEntre(de, ate)` conta **de** o primeiro **até** o segundo. Se o import de `DataCivil` ficar sem uso depois disso, remova-o (o lint reclama).

- [ ] **Step 6: Confirmar que nada regrediu**

Run: `npx vitest run src/dados/avisos.test.ts src/dominio/avisos.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS, limpo. Os avisos de fatura próxima e de reembolso parado continuam com os mesmos números — a extração não muda comportamento nenhum.

- [ ] **Step 7: Commit da extração**

```bash
git add src/dominio/data.ts src/dominio/data.test.ts src/dados/avisos.ts
git commit -m "refactor(dominio): move a aritmética de dias civis para o domínio"
```

- [ ] **Step 8: Escrever os testes do estado e da ordenação**

Adicione ao fim de `src/dominio/reembolso.test.ts`. Some `estadoDoReembolso` e `ordenarPorAntiguidade` ao `import` de `./reembolso` que já existe no arquivo.

```ts
describe('estadoDoReembolso', () => {
  it('alvo zero não é reembolsável, mesmo sem recebimento', () => {
    expect(estadoDoReembolso(0, [])).toBe('NAO_REEMBOLSAVEL');
  });

  it('alvo positivo sem recebimento nenhum está pendente', () => {
    expect(estadoDoReembolso(20000, [])).toBe('PENDENTE');
  });

  it('recebimento menor que o alvo é parcial', () => {
    expect(estadoDoReembolso(20000, [{ valorCentavos: 5000 }])).toBe('PARCIAL');
  });

  it('recebimentos que somam o alvo quitam', () => {
    expect(
      estadoDoReembolso(20000, [{ valorCentavos: 12000 }, { valorCentavos: 8000 }]),
    ).toBe('QUITADO');
  });

  it('está quitado no centavo exato, não um antes', () => {
    expect(estadoDoReembolso(20000, [{ valorCentavos: 19999 }])).toBe('PARCIAL');
    expect(estadoDoReembolso(20000, [{ valorCentavos: 20000 }])).toBe('QUITADO');
  });
});

describe('ordenarPorAntiguidade', () => {
  it('põe o mais parado na frente', () => {
    const ordenados = ordenarPorAntiguidade([
      { diasParado: 3, pendenteCentavos: 100 },
      { diasParado: 40, pendenteCentavos: 100 },
      { diasParado: 12, pendenteCentavos: 100 },
    ]);

    expect(ordenados.map((r) => r.diasParado)).toEqual([40, 12, 3]);
  });

  it('desempata pelo maior pendente', () => {
    const ordenados = ordenarPorAntiguidade([
      { diasParado: 10, pendenteCentavos: 500 },
      { diasParado: 10, pendenteCentavos: 9000 },
    ]);

    expect(ordenados.map((r) => r.pendenteCentavos)).toEqual([9000, 500]);
  });

  it('não modifica o array recebido', () => {
    const entrada = [
      { diasParado: 1, pendenteCentavos: 100 },
      { diasParado: 90, pendenteCentavos: 100 },
    ];
    ordenarPorAntiguidade(entrada);

    expect(entrada.map((r) => r.diasParado)).toEqual([1, 90]);
  });
});
```

- [ ] **Step 9: Rodar para ver falhar**

Run: `npx vitest run src/dominio/reembolso.test.ts`
Expected: FAIL — `estadoDoReembolso is not a function`.

- [ ] **Step 10: Implementar**

Acrescente ao fim de `src/dominio/reembolso.ts`:

```ts
/**
 * Os quatro estados do spec (seção 6.1). Sempre DERIVADO do alvo e dos
 * recebimentos — nunca há um campo de status no banco que possa divergir.
 */
export type EstadoReembolso = 'NAO_REEMBOLSAVEL' | 'PENDENTE' | 'PARCIAL' | 'QUITADO';

export function estadoDoReembolso(
  alvoCentavos: Centavos,
  recebimentos: Recebimento[],
): EstadoReembolso {
  if (alvoCentavos <= 0) return 'NAO_REEMBOLSAVEL';

  const total = recebido(recebimentos);
  if (total <= 0) return 'PENDENTE';
  if (total >= alvoCentavos) return 'QUITADO';
  return 'PARCIAL';
}

export interface ReembolsoOrdenavel {
  diasParado: number;
  pendenteCentavos: Centavos;
}

/**
 * Mais parado primeiro; empate vai para o maior pendente.
 *
 * A tela responde "quem me deve?", e o sinal de risco que o app já elegeu
 * para o assunto é a idade — o aviso azul do Painel dispara por dias parados,
 * não por valor (spec, seção 8.1). Quem está há mais tempo sem pagar é quem
 * precisa ser cobrado.
 *
 * Devolve um array novo; não modifica o recebido.
 */
export function ordenarPorAntiguidade<T extends ReembolsoOrdenavel>(itens: T[]): T[] {
  return [...itens].sort(
    (a, b) => b.diasParado - a.diasParado || b.pendenteCentavos - a.pendenteCentavos,
  );
}
```

- [ ] **Step 11: Rodar os testes**

Run: `npx vitest run src/dominio/reembolso.test.ts`
Expected: PASS.

- [ ] **Step 12: Verificar a suíte e os tipos**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: tudo verde e limpo.

- [ ] **Step 13: Commit**

```bash
git add src/dominio/reembolso.ts src/dominio/reembolso.test.ts
git commit -m "feat(dominio): estado derivado do reembolso e ordenação por antiguidade"
```

---

## Task 2: Domínio do estorno — resumo da prévia

O spec §8.5 exige que o formulário mostre o efeito exato **antes** de confirmar:

> Estornar R$ 2.000 · TV 10x
> **3 parcelas já cobradas** (set, out, nov) viram crédito de R$ 600 em **novembro/2026**
> **7 parcelas futuras** (dez/2026 a jun/2027) são canceladas — liberam R$ 1.400 da projeção

Esses números são todos derivados do plano que `planejarEstorno` já devolve. Contar, somar e descobrir a faixa de meses é decisão de dado, não de desenho — então mora aqui, e a tela só formata.

**Files:**
- Modify: `src/dominio/reembolso.ts`
- Test: `src/dominio/reembolso.test.ts`

**Interfaces:**
- Consumes: `PlanoEstorno`, `ParcelaEstornavel`, `ModoCredito`, `planejarEstorno` — tudo já em `reembolso.ts` desde o Plano 1.
- Produces:
  - `interface GrupoDeParcelas { quantidade: number; valorCentavos: Centavos; competencias: Competencia[] }`
  - `interface ResumoDoEstorno { canceladas: GrupoDeParcelas; creditadas: GrupoDeParcelas; competenciasDeCredito: Competencia[]; totalCentavos: Centavos }`
  - `resumirPlanoEstorno(plano: PlanoEstorno, parcelas: ParcelaEstornavel[]): ResumoDoEstorno`

**Semântica exata:**
- `canceladas` descreve as parcelas que `plano.canceladas` lista (por id), lidas de `parcelas`.
- `creditadas` descreve as parcelas que geraram crédito, com `competencias` sendo a competência **da própria parcela** (o mês em que ela seria cobrada), não a do crédito.
- `competenciasDeCredito` é onde os créditos caem — **uma** competência no modo `UNICO`, uma por parcela no `POR_FATURA`. Sempre ordenada e **sem repetição**.
- `totalCentavos` é a soma dos dois grupos: o valor total que o estorno move.
- Todas as listas de competência saem ordenadas crescentemente.
- Uma parcela citada em `plano` que não exista em `parcelas` é ignorada — não quebra e não inventa valor.

- [ ] **Step 1: Escrever os testes que falham**

Adicione ao fim de `src/dominio/reembolso.test.ts`. Some `resumirPlanoEstorno` ao `import` de `./reembolso`.

```ts
describe('resumirPlanoEstorno', () => {
  // Uma TV em 10x de R$200, comprada em setembro. As três primeiras parcelas
  // já foram cobradas (fatura FECHADA/PAGA); as sete restantes ainda não.
  const parcelas: ParcelaEstornavel[] = [
    { id: 'p1', competencia: '2026-09', valorCentavos: 20000, statusFatura: 'PAGA' },
    { id: 'p2', competencia: '2026-10', valorCentavos: 20000, statusFatura: 'PAGA' },
    { id: 'p3', competencia: '2026-11', valorCentavos: 20000, statusFatura: 'FECHADA' },
    { id: 'p4', competencia: '2026-12', valorCentavos: 20000, statusFatura: 'ABERTA' },
    { id: 'p5', competencia: '2027-01', valorCentavos: 20000, statusFatura: 'ABERTA' },
    { id: 'p6', competencia: '2027-02', valorCentavos: 20000, statusFatura: 'ABERTA' },
    { id: 'p7', competencia: '2027-03', valorCentavos: 20000, statusFatura: 'ABERTA' },
    { id: 'p8', competencia: '2027-04', valorCentavos: 20000, statusFatura: 'ABERTA' },
    { id: 'p9', competencia: '2027-05', valorCentavos: 20000, statusFatura: 'ABERTA' },
    { id: 'p10', competencia: '2027-06', valorCentavos: 20000, statusFatura: 'ABERTA' },
  ];

  it('separa as cobradas das canceladas, com contagem e valor', () => {
    const plano = planejarEstorno(parcelas, 'UNICO', '2026-11');
    const r = resumirPlanoEstorno(plano, parcelas);

    expect(r.creditadas.quantidade).toBe(3);
    expect(r.creditadas.valorCentavos).toBe(60000);
    expect(r.canceladas.quantidade).toBe(7);
    expect(r.canceladas.valorCentavos).toBe(140000);
    expect(r.totalCentavos).toBe(200000);
  });

  it('lista as competências das parcelas de cada grupo, em ordem', () => {
    const plano = planejarEstorno(parcelas, 'UNICO', '2026-11');
    const r = resumirPlanoEstorno(plano, parcelas);

    expect(r.creditadas.competencias).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(r.canceladas.competencias[0]).toBe('2026-12');
    expect(r.canceladas.competencias[r.canceladas.competencias.length - 1]).toBe('2027-06');
  });

  it('no modo UNICO, todos os créditos caem numa competência só', () => {
    const plano = planejarEstorno(parcelas, 'UNICO', '2026-11');
    const r = resumirPlanoEstorno(plano, parcelas);

    expect(r.competenciasDeCredito).toEqual(['2026-11']);
  });

  it('no modo POR_FATURA, cada crédito cai na competência da sua parcela', () => {
    const plano = planejarEstorno(parcelas, 'POR_FATURA', '2026-11');
    const r = resumirPlanoEstorno(plano, parcelas);

    expect(r.competenciasDeCredito).toEqual(['2026-09', '2026-10', '2026-11']);
  });

  it('não repete competência de crédito quando duas parcelas caem no mesmo mês', () => {
    const duasNoMesmoMes: ParcelaEstornavel[] = [
      { id: 'a', competencia: '2026-09', valorCentavos: 1000, statusFatura: 'PAGA' },
      { id: 'b', competencia: '2026-09', valorCentavos: 2000, statusFatura: 'PAGA' },
    ];
    const plano = planejarEstorno(duasNoMesmoMes, 'POR_FATURA', '2026-09');
    const r = resumirPlanoEstorno(plano, duasNoMesmoMes);

    expect(r.competenciasDeCredito).toEqual(['2026-09']);
    expect(r.creditadas.quantidade).toBe(2);
  });

  it('uma compra à vista ainda não cobrada só tem cancelamento', () => {
    const avista: ParcelaEstornavel[] = [
      { id: 'unica', competencia: '2026-09', valorCentavos: 5000, statusFatura: 'ABERTA' },
    ];
    const r = resumirPlanoEstorno(planejarEstorno(avista, 'UNICO', '2026-09'), avista);

    expect(r.canceladas.quantidade).toBe(1);
    expect(r.creditadas.quantidade).toBe(0);
    expect(r.creditadas.valorCentavos).toBe(0);
    expect(r.competenciasDeCredito).toEqual([]);
    expect(r.totalCentavos).toBe(5000);
  });

  it('uma compra à vista já paga só vira crédito', () => {
    const avista: ParcelaEstornavel[] = [
      { id: 'unica', competencia: '2026-09', valorCentavos: 5000, statusFatura: 'PAGA' },
    ];
    const r = resumirPlanoEstorno(planejarEstorno(avista, 'UNICO', '2026-10'), avista);

    expect(r.canceladas.quantidade).toBe(0);
    expect(r.creditadas.quantidade).toBe(1);
    expect(r.competenciasDeCredito).toEqual(['2026-10']);
  });

  it('ignora id do plano que não existe na lista de parcelas', () => {
    const r = resumirPlanoEstorno(
      { canceladas: ['fantasma'], creditos: [] },
      [{ id: 'real', competencia: '2026-09', valorCentavos: 1000, statusFatura: 'ABERTA' }],
    );

    expect(r.canceladas.quantidade).toBe(0);
    expect(r.totalCentavos).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/dominio/reembolso.test.ts`
Expected: FAIL — `resumirPlanoEstorno is not a function`.

- [ ] **Step 3: Implementar**

Acrescente ao fim de `src/dominio/reembolso.ts`:

```ts
export interface GrupoDeParcelas {
  quantidade: number;
  valorCentavos: Centavos;
  /** Competências das próprias parcelas, ordenadas. */
  competencias: Competencia[];
}

export interface ResumoDoEstorno {
  /** Parcelas que ainda não foram cobradas e por isso somem. */
  canceladas: GrupoDeParcelas;
  /** Parcelas já cobradas, que permanecem e viram crédito. */
  creditadas: GrupoDeParcelas;
  /**
   * Onde os créditos aparecem: uma competência só no modo UNICO, uma por
   * parcela no POR_FATURA. Ordenada e sem repetição.
   */
  competenciasDeCredito: Competencia[];
  /** Quanto o estorno move ao todo. */
  totalCentavos: Centavos;
}

function agrupar(parcelas: ParcelaEstornavel[]): GrupoDeParcelas {
  return {
    quantidade: parcelas.length,
    valorCentavos: parcelas.reduce((total, p) => total + p.valorCentavos, 0),
    competencias: parcelas.map((p) => p.competencia).sort(),
  };
}

/**
 * Traduz o plano do estorno nos números que a prévia mostra (spec, seção 8.5).
 * Contar, somar e achar a faixa de meses é decisão de dado — a tela só formata
 * o que sai daqui.
 */
export function resumirPlanoEstorno(
  plano: PlanoEstorno,
  parcelas: ParcelaEstornavel[],
): ResumoDoEstorno {
  const porId = new Map(parcelas.map((p) => [p.id, p]));

  // Um id que não está na lista é ignorado: nunca inventa valor.
  const achar = (ids: string[]): ParcelaEstornavel[] =>
    ids.map((id) => porId.get(id)).filter((p): p is ParcelaEstornavel => p !== undefined);

  const canceladas = agrupar(achar(plano.canceladas));
  const creditadas = agrupar(achar(plano.creditos.map((c) => c.transactionId)));

  const competenciasDeCredito = [
    ...new Set(plano.creditos.map((c) => c.competenciaCredito)),
  ].sort();

  return {
    canceladas,
    creditadas,
    competenciasDeCredito,
    totalCentavos: canceladas.valorCentavos + creditadas.valorCentavos,
  };
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run src/dominio/reembolso.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar a suíte e os tipos**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: tudo verde e limpo.

- [ ] **Step 6: Commit**

```bash
git add src/dominio/reembolso.ts src/dominio/reembolso.test.ts
git commit -m "feat(dominio): resumo da prévia do estorno"
```

---

## Task 3: Dados dos reembolsos

Lista os lançamentos reembolsáveis com pendente e estado calculados pelo domínio, e grava um recebimento.

**Files:**
- Create: `src/dados/reembolsos.ts`
- Test: `src/dados/reembolsos.test.ts`

**Interfaces:**
- Consumes: `estadoDoReembolso`, `ordenarPorAntiguidade`, `pendente`, `recebido`, `EstadoReembolso`, `validarRecebimento` de `@/dominio/reembolso`; `diasEntre`, `dataCivilEm`, `lerDataCivil`, `Competencia` de `@/dominio/data`; `prisma`, `ClientePrisma`.
- Produces:
  - `interface RecebimentoListado { valorCentavos: number; recebidoEm: string; competenciaCredito: Competencia }`
  - `interface ReembolsoListado { transactionId, descricao, data, competencia, valorCentavos, alvoCentavos, recebidoCentavos, pendenteCentavos, estado, diasParado, categoriaNome, subcategoriaNome, parcelaNum, parcelaTotal, recebimentos }`
  - `listarReembolsos(cliente?): Promise<{ pendentes: ReembolsoListado[]; quitados: ReembolsoListado[] }>`
  - `registrarRecebimento(dados: { transactionId: string; valorCentavos: number; recebidoEm: string }, cliente?): Promise<{ id: string }>`

**Regras que este arquivo fixa (todas testadas):**

1. **Só créditos de `origem: 'REEMBOLSO'` contam.** Um `Credito` de origem `ESTORNO` na mesma transação **não** abate o pendente do reembolso — são dinheiros diferentes (spec §6). Esse bug já apareceu duas vezes neste projeto; a consulta filtra `origem` explicitamente e há um teste dedicado.
2. **`competenciaCredito` do recebimento é a competência da própria despesa**, não o mês de `recebidoEm` (spec §6.1: "O crédito de reembolso vale na competência original da despesa, qualquer que seja a data do recebimento"). É por isso que reembolsar em outubro uma despesa de setembro corrige o número de setembro.
3. Só entram lançamentos com `reembolsoAlvoCentavos > 0`, `tipo: 'DESPESA'` e `status: 'ATIVA'` — uma parcela cancelada por estorno não é mais uma dívida de ninguém.
4. `pendentes` sai ordenada por `ordenarPorAntiguidade`; `quitados` sai do mais recente para o mais antigo (pela data da despesa, decrescente), porque ali a pergunta é "o que já resolvi", não "o que devo cobrar".
5. `diasParado` é `diasEntre(data da despesa, hoje)` — não da data do último recebimento. A pergunta é há quanto tempo aquele dinheiro está fora do bolso.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/dados/reembolsos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { dataCivilEm, diasEntre, lerDataCivil } from '@/dominio/data';

import { criarCategoria, criarSubcategoria } from './categorias';
import { criarLancamento } from './lancamentos';
import { listarReembolsos, registrarRecebimento } from './reembolsos';
import { comRollback } from './rollback';
import type { ClientePrisma } from './tipos';

const DATA = '2099-09-10';
const MES = '2099-09';

async function despesaReembolsavel(
  tx: ClientePrisma,
  valorCentavos: number,
  alvoCentavos: number,
) {
  const categoria = await criarCategoria({ nome: 'Reembolsáveis', corSlot: 1 }, tx);
  const sub = await criarSubcategoria(
    { budgetCategoryId: categoria.id, nome: 'Hotel do time' },
    tx,
  );

  const { ids } = await criarLancamento(
    {
      descricao: 'Hotel do time',
      valorCentavos,
      data: DATA,
      metodo: 'PIX',
      cardId: null,
      budgetCategoryId: categoria.id,
      subcategoryId: sub.id,
      parcelas: 1,
      reembolsoAlvoCentavos: alvoCentavos,
    },
    tx,
  );

  return { id: ids[0], categoria, sub };
}

describe('listarReembolsos', () => {
  it('traz o alvo, o recebido, o pendente e o estado PENDENTE', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 60000);

      const { pendentes } = await listarReembolsos(tx);
      const r = pendentes.find((x) => x.transactionId === id)!;

      expect(r.valorCentavos).toBe(90000);
      expect(r.alvoCentavos).toBe(60000);
      expect(r.recebidoCentavos).toBe(0);
      expect(r.pendenteCentavos).toBe(60000);
      expect(r.estado).toBe('PENDENTE');
      expect(r.descricao).toBe('Hotel do time');
      expect(r.categoriaNome).toBe('Reembolsáveis');
      expect(r.subcategoriaNome).toBe('Hotel do time');
    });
  });

  it('não lista lançamento sem alvo de reembolso', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 0);

      const { pendentes, quitados } = await listarReembolsos(tx);

      expect(pendentes.find((x) => x.transactionId === id)).toBeUndefined();
      expect(quitados.find((x) => x.transactionId === id)).toBeUndefined();
    });
  });

  it('conta os dias parados a partir da data da despesa', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 60000);

      const { pendentes } = await listarReembolsos(tx);
      const r = pendentes.find((x) => x.transactionId === id)!;

      // Comparação contra a função de domínio aplicada aos mesmos dados:
      // prova que a camada de dados ligou a data certa na conta certa, sem
      // depender de quando o teste roda.
      expect(r.diasParado).toBe(diasEntre(lerDataCivil(DATA), dataCivilEm(new Date())));
    });
  });

  it('um crédito de ESTORNO não abate o pendente do reembolso', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 60000);

      await tx.credito.create({
        data: {
          transactionId: id,
          valorCentavos: 60000,
          recebidoEm: DATA,
          competenciaCredito: MES,
          origem: 'ESTORNO',
        },
      });

      const { pendentes } = await listarReembolsos(tx);
      const r = pendentes.find((x) => x.transactionId === id)!;

      expect(r.recebidoCentavos).toBe(0);
      expect(r.pendenteCentavos).toBe(60000);
      expect(r.estado).toBe('PENDENTE');
    });
  });

  it('separa quitados de pendentes', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 60000);
      await registrarRecebimento(
        { transactionId: id, valorCentavos: 60000, recebidoEm: '2099-10-05' },
        tx,
      );

      const { pendentes, quitados } = await listarReembolsos(tx);

      expect(pendentes.find((x) => x.transactionId === id)).toBeUndefined();
      const r = quitados.find((x) => x.transactionId === id)!;
      expect(r.estado).toBe('QUITADO');
      expect(r.pendenteCentavos).toBe(0);
    });
  });

  it('lista os recebimentos com data e competência corrigida', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 60000);
      await registrarRecebimento(
        { transactionId: id, valorCentavos: 25000, recebidoEm: '2099-10-05' },
        tx,
      );

      const { pendentes } = await listarReembolsos(tx);
      const r = pendentes.find((x) => x.transactionId === id)!;

      expect(r.recebimentos).toEqual([
        { valorCentavos: 25000, recebidoEm: '2099-10-05', competenciaCredito: MES },
      ]);
    });
  });

  it('não lista uma parcela cancelada por estorno', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 60000);
      await tx.transaction.update({ where: { id }, data: { status: 'CANCELADA' } });

      const { pendentes, quitados } = await listarReembolsos(tx);

      expect(pendentes.find((x) => x.transactionId === id)).toBeUndefined();
      expect(quitados.find((x) => x.transactionId === id)).toBeUndefined();
    });
  });
});

describe('registrarRecebimento', () => {
  it('grava o crédito na competência ORIGINAL da despesa, não na do recebimento', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 60000);

      // Recebido em dezembro, mas a despesa é de setembro.
      const { id: creditoId } = await registrarRecebimento(
        { transactionId: id, valorCentavos: 60000, recebidoEm: '2099-12-20' },
        tx,
      );

      const credito = await tx.credito.findUnique({
        where: { id: creditoId },
        select: { competenciaCredito: true, recebidoEm: true, origem: true },
      });

      expect(credito).toEqual({
        competenciaCredito: MES,
        recebidoEm: '2099-12-20',
        origem: 'REEMBOLSO',
      });
    });
  });

  it('recebimento parcial deixa o reembolso aberto pelo restante', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 60000);
      await registrarRecebimento(
        { transactionId: id, valorCentavos: 20000, recebidoEm: '2099-10-05' },
        tx,
      );

      const { pendentes } = await listarReembolsos(tx);
      const r = pendentes.find((x) => x.transactionId === id)!;

      expect(r.recebidoCentavos).toBe(20000);
      expect(r.pendenteCentavos).toBe(40000);
      expect(r.estado).toBe('PARCIAL');
    });
  });

  it('recebimentos sucessivos somam até quitar', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 60000);
      await registrarRecebimento(
        { transactionId: id, valorCentavos: 20000, recebidoEm: '2099-10-05' },
        tx,
      );
      await registrarRecebimento(
        { transactionId: id, valorCentavos: 40000, recebidoEm: '2099-11-05' },
        tx,
      );

      const { quitados } = await listarReembolsos(tx);
      const r = quitados.find((x) => x.transactionId === id)!;

      expect(r.recebidoCentavos).toBe(60000);
      expect(r.pendenteCentavos).toBe(0);
      expect(r.estado).toBe('QUITADO');
      expect(r.recebimentos).toHaveLength(2);
    });
  });

  it('rejeita recebimento acima do pendente', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 60000);

      await expect(
        registrarRecebimento(
          { transactionId: id, valorCentavos: 60001, recebidoEm: '2099-10-05' },
          tx,
        ),
      ).rejects.toThrow('excede o pendente');
    });
  });

  it('rejeita recebimento que ultrapassa o pendente depois de um parcial', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 60000);
      await registrarRecebimento(
        { transactionId: id, valorCentavos: 50000, recebidoEm: '2099-10-05' },
        tx,
      );

      await expect(
        registrarRecebimento(
          { transactionId: id, valorCentavos: 10001, recebidoEm: '2099-11-05' },
          tx,
        ),
      ).rejects.toThrow('excede o pendente');
    });
  });

  it('rejeita valor zero ou negativo', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 60000);

      await expect(
        registrarRecebimento(
          { transactionId: id, valorCentavos: 0, recebidoEm: '2099-10-05' },
          tx,
        ),
      ).rejects.toThrow('inteiro positivo');
    });
  });

  it('rejeita data de recebimento em formato inválido', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 60000);

      await expect(
        registrarRecebimento(
          { transactionId: id, valorCentavos: 1000, recebidoEm: '05/10/2099' },
          tx,
        ),
      ).rejects.toThrow('Data civil inválida');
    });
  });

  it('rejeita lançamento inexistente', async () => {
    await comRollback(async (tx) => {
      await expect(
        registrarRecebimento(
          { transactionId: 'nao-existe', valorCentavos: 1000, recebidoEm: '2099-10-05' },
          tx,
        ),
      ).rejects.toThrow('não encontrado');
    });
  });

  it('rejeita recebimento num lançamento sem alvo de reembolso', async () => {
    await comRollback(async (tx) => {
      const { id } = await despesaReembolsavel(tx, 90000, 0);

      await expect(
        registrarRecebimento(
          { transactionId: id, valorCentavos: 1000, recebidoEm: '2099-10-05' },
          tx,
        ),
      ).rejects.toThrow('excede o pendente');
    });
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/dados/reembolsos.test.ts`
Expected: FAIL — `Cannot find module './reembolsos'`.

- [ ] **Step 3: Implementar**

Crie `src/dados/reembolsos.ts`:

```ts
import {
  type Competencia,
  dataCivilEm,
  diasEntre,
  lerDataCivil,
} from '@/dominio/data';
import {
  type EstadoReembolso,
  estadoDoReembolso,
  ordenarPorAntiguidade,
  pendente,
  recebido,
  validarRecebimento,
} from '@/dominio/reembolso';

import { prisma } from './prisma';
import type { ClientePrisma } from './tipos';

export interface RecebimentoListado {
  valorCentavos: number;
  /** "YYYY-MM-DD" — quando o dinheiro entrou. */
  recebidoEm: string;
  /** O mês corrigido: sempre a competência da despesa (spec, seção 6.1). */
  competenciaCredito: Competencia;
}

export interface ReembolsoListado {
  transactionId: string;
  descricao: string;
  /** "YYYY-MM-DD" da despesa. */
  data: string;
  competencia: Competencia;
  valorCentavos: number;
  alvoCentavos: number;
  recebidoCentavos: number;
  pendenteCentavos: number;
  estado: EstadoReembolso;
  /** Dias desde a despesa — há quanto tempo esse dinheiro está fora. */
  diasParado: number;
  categoriaNome: string;
  subcategoriaNome: string;
  parcelaNum: number;
  parcelaTotal: number;
  recebimentos: RecebimentoListado[];
}

/**
 * Só o crédito de REEMBOLSO abate a pendência. Um ESTORNO na mesma transação
 * é outro dinheiro — a compra foi desfeita, ninguém te devia nada (spec,
 * seção 6). Este filtro é a razão de o `where` existir, não uma otimização.
 */
const CREDITOS_DE_REEMBOLSO = {
  where: { origem: 'REEMBOLSO' },
  orderBy: { recebidoEm: 'asc' },
  select: { valorCentavos: true, recebidoEm: true, competenciaCredito: true },
} as const;

/**
 * Todos os lançamentos reembolsáveis, separados entre o que ainda deve entrar
 * e o que já entrou. Quem decide o estado e a ordem é o domínio.
 */
export async function listarReembolsos(
  cliente: ClientePrisma = prisma,
): Promise<{ pendentes: ReembolsoListado[]; quitados: ReembolsoListado[] }> {
  const linhas = await cliente.transaction.findMany({
    where: {
      tipo: 'DESPESA',
      status: 'ATIVA',
      reembolsoAlvoCentavos: { gt: 0 },
    },
    orderBy: { data: 'desc' },
    select: {
      id: true,
      descricao: true,
      data: true,
      competencia: true,
      valorCentavos: true,
      reembolsoAlvoCentavos: true,
      parcelaNum: true,
      parcelaTotal: true,
      budgetCategory: { select: { nome: true } },
      subcategory: { select: { nome: true } },
      creditos: CREDITOS_DE_REEMBOLSO,
    },
  });

  const hoje = dataCivilEm(new Date());

  const todos: ReembolsoListado[] = linhas.map((l) => ({
    transactionId: l.id,
    descricao: l.descricao,
    data: l.data,
    competencia: l.competencia,
    valorCentavos: l.valorCentavos,
    alvoCentavos: l.reembolsoAlvoCentavos,
    recebidoCentavos: recebido(l.creditos),
    pendenteCentavos: pendente(l.reembolsoAlvoCentavos, l.creditos),
    estado: estadoDoReembolso(l.reembolsoAlvoCentavos, l.creditos),
    diasParado: diasEntre(lerDataCivil(l.data), hoje),
    categoriaNome: l.budgetCategory?.nome ?? '',
    subcategoriaNome: l.subcategory?.nome ?? '',
    parcelaNum: l.parcelaNum,
    parcelaTotal: l.parcelaTotal,
    recebimentos: l.creditos.map((c) => ({
      valorCentavos: c.valorCentavos,
      recebidoEm: c.recebidoEm,
      competenciaCredito: c.competenciaCredito,
    })),
  }));

  return {
    // A cobrar: mais parado primeiro, que é a ordem de quem precisa ser cobrado.
    pendentes: ordenarPorAntiguidade(todos.filter((r) => r.estado !== 'QUITADO')),
    // Já resolvido: a consulta já veio por data decrescente, e ali a pergunta
    // é "o que eu já resolvi", não "o que devo cobrar".
    quitados: todos.filter((r) => r.estado === 'QUITADO'),
  };
}

/**
 * Grava um recebimento. Dois pontos que o spec (seção 6.1) fixa e que são
 * fáceis de errar:
 *
 *  - a competência do crédito é a da DESPESA, não a do mês em que o dinheiro
 *    entrou — é isso que faz um reembolso de outubro corrigir setembro;
 *  - só os créditos de REEMBOLSO entram na conta do que já foi recebido.
 */
export async function registrarRecebimento(
  dados: { transactionId: string; valorCentavos: number; recebidoEm: string },
  cliente: ClientePrisma = prisma,
): Promise<{ id: string }> {
  // Lança se o formato estiver errado — é a validação da data civil.
  lerDataCivil(dados.recebidoEm);

  const transacao = await cliente.transaction.findUnique({
    where: { id: dados.transactionId },
    select: {
      competencia: true,
      reembolsoAlvoCentavos: true,
      creditos: CREDITOS_DE_REEMBOLSO,
    },
  });

  if (!transacao) {
    throw new Error(`Lançamento não encontrado: ${dados.transactionId}`);
  }

  validarRecebimento(
    dados.valorCentavos,
    transacao.reembolsoAlvoCentavos,
    transacao.creditos,
  );

  return cliente.credito.create({
    data: {
      transactionId: dados.transactionId,
      valorCentavos: dados.valorCentavos,
      recebidoEm: dados.recebidoEm,
      competenciaCredito: transacao.competencia,
      origem: 'REEMBOLSO',
    },
    select: { id: true },
  });
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run src/dados/reembolsos.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar a suíte e os tipos**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: tudo verde e limpo.

- [ ] **Step 6: Commit**

```bash
git add src/dados/reembolsos.ts src/dados/reembolsos.test.ts
git commit -m "feat(dados): lista de reembolsos e registro de recebimento"
```

---

## Task 4: Dados do estorno

Monta o alvo (quais parcelas, e o status da fatura de cada uma) e aplica o plano do domínio — cancelamentos e créditos numa transação só.

**Files:**
- Create: `src/dados/estorno.ts`
- Test: `src/dados/estorno.test.ts`

**Interfaces:**
- Consumes: `ParcelaEstornavel`, `ModoCredito`, `planejarEstorno`, `planejarEstornoParcial` de `@/dominio/reembolso`; `Competencia`, `lerDataCivil` de `@/dominio/data`.
- Produces:
  - `interface AlvoDoEstorno { transactionId: string; descricao: string; grupoParcelamentoId: string | null; valorTotalCentavos: number; parcelas: ParcelaEstornavel[] }`
  - `alvoDoEstorno(transactionId: string, cliente?): Promise<AlvoDoEstorno>`
  - `aplicarEstorno(dados: { transactionId: string; modo: ModoCredito; competenciaCredito: Competencia; recebidoEm: string }, cliente?): Promise<void>`
  - `aplicarEstornoParcial(dados: { transactionId: string; valorCentavos: number; competenciaCredito: Competencia; recebidoEm: string }, cliente?): Promise<void>`

**Regras que este arquivo fixa (todas testadas):**

1. **O alvo é o grupo inteiro quando há parcelamento.** Estornar a parcela 3 de 10 estorna a compra toda — o spec §6.2 diz que a ação existe "no lançamento à vista e no grupo de parcelamento inteiro". Sem `grupoParcelamentoId`, o alvo é só aquela linha.
2. **Parcela sem fatura conta como `ABERTA`.** O spec §6.2 diz "`ABERTA` ou ainda não criada" na mesma linha da tabela. Um lançamento no PIX não tem fatura nenhuma e por isso é cancelado, não creditado.
3. **Cancelamento e crédito vão juntos ou não vão.** Um estorno que cancelasse 7 parcelas e falhasse ao criar os 3 créditos deixaria a compra sumida da projeção sem o dinheiro de volta. Use `$transaction` quando o cliente for o de topo, e reaproveite a transação quando já estiver dentro de uma — o mesmo padrão que `criarLancamento` já usa em `src/dados/lancamentos.ts`.
4. **Transação cancelada nunca é apagada** (spec §13): `status: 'CANCELADA'`, nunca `delete`.
5. **O estorno parcial não cancela nada** (spec §6.2) e é validado contra o valor da **compra inteira** (soma do grupo), não da parcela clicada — quem devolve um item de uma compra parcelada devolve um valor que pode passar de uma parcela.
6. Os créditos do estorno nascem com `origem: 'ESTORNO'` — é isso que faz eles abaterem a fatura (spec §6.2) e **não** abaterem reembolso pendente.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/dados/estorno.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { criarCartao } from './cartoes';
import { criarCategoria, criarSubcategoria } from './categorias';
import { alvoDoEstorno, aplicarEstorno, aplicarEstornoParcial } from './estorno';
import { fecharFatura, totalDaFatura } from './faturas';
import { criarLancamento } from './lancamentos';
import { comRollback } from './rollback';
import type { ClientePrisma } from './tipos';

async function compraParcelada(tx: ClientePrisma, parcelas: number, valorCentavos: number) {
  const categoria = await criarCategoria({ nome: 'Estornáveis', corSlot: 1 }, tx);
  const sub = await criarSubcategoria(
    { budgetCategoryId: categoria.id, nome: 'TV grande' },
    tx,
  );
  const cartao = await criarCartao(
    { nome: 'Cartão do estorno', diaFechamento: 25, diaVencimento: 5 },
    tx,
  );

  const { ids } = await criarLancamento(
    {
      descricao: 'TV',
      valorCentavos,
      data: '2099-09-10',
      metodo: 'CREDITO',
      cardId: cartao.id,
      budgetCategoryId: categoria.id,
      subcategoryId: sub.id,
      parcelas,
      reembolsoAlvoCentavos: 0,
    },
    tx,
  );

  return { ids, cartao, categoria, sub };
}

describe('alvoDoEstorno', () => {
  it('traz o grupo inteiro quando a compra é parcelada', async () => {
    await comRollback(async (tx) => {
      const { ids } = await compraParcelada(tx, 10, 200000);

      // Pede pela parcela 3: o alvo tem de ser a compra toda.
      const alvo = await alvoDoEstorno(ids[2], tx);

      expect(alvo.parcelas).toHaveLength(10);
      expect(alvo.valorTotalCentavos).toBe(200000);
      expect(alvo.descricao).toBe('TV');
      expect(alvo.grupoParcelamentoId).not.toBeNull();
    });
  });

  it('as parcelas saem em ordem de competência', async () => {
    await comRollback(async (tx) => {
      const { ids } = await compraParcelada(tx, 4, 40000);

      const alvo = await alvoDoEstorno(ids[0], tx);
      const competencias = alvo.parcelas.map((p) => p.competencia);

      expect(competencias).toEqual([...competencias].sort());
    });
  });

  it('uma compra à vista tem uma parcela só e nenhum grupo', async () => {
    await comRollback(async (tx) => {
      const { ids } = await compraParcelada(tx, 1, 50000);

      const alvo = await alvoDoEstorno(ids[0], tx);

      expect(alvo.parcelas).toHaveLength(1);
      expect(alvo.grupoParcelamentoId).toBeNull();
      expect(alvo.valorTotalCentavos).toBe(50000);
    });
  });

  it('parcela sem fatura conta como ABERTA', async () => {
    await comRollback(async (tx) => {
      const categoria = await criarCategoria({ nome: 'Casa do estorno', corSlot: 2 }, tx);
      const sub = await criarSubcategoria(
        { budgetCategoryId: categoria.id, nome: 'Reforma' },
        tx,
      );
      const { ids } = await criarLancamento(
        {
          descricao: 'Pintura',
          valorCentavos: 30000,
          data: '2099-09-10',
          metodo: 'PIX',
          cardId: null,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          parcelas: 1,
          reembolsoAlvoCentavos: 0,
        },
        tx,
      );

      const alvo = await alvoDoEstorno(ids[0], tx);

      expect(alvo.parcelas[0].statusFatura).toBe('ABERTA');
    });
  });

  it('reflete o status real da fatura de cada parcela', async () => {
    await comRollback(async (tx) => {
      const { ids } = await compraParcelada(tx, 3, 30000);

      const primeira = await tx.transaction.findUniqueOrThrow({
        where: { id: ids[0] },
        select: { invoiceId: true },
      });
      await fecharFatura(primeira.invoiceId!, tx);

      const alvo = await alvoDoEstorno(ids[0], tx);
      const p1 = alvo.parcelas.find((p) => p.id === ids[0])!;
      const p2 = alvo.parcelas.find((p) => p.id === ids[1])!;

      expect(p1.statusFatura).toBe('FECHADA');
      expect(p2.statusFatura).toBe('ABERTA');
    });
  });

  it('rejeita lançamento inexistente', async () => {
    await expect(alvoDoEstorno('nao-existe')).rejects.toThrow('não encontrado');
  });
});

describe('aplicarEstorno', () => {
  it('cancela as parcelas ainda não cobradas, sem apagar nenhuma linha', async () => {
    await comRollback(async (tx) => {
      const { ids } = await compraParcelada(tx, 3, 30000);

      await aplicarEstorno(
        {
          transactionId: ids[0],
          modo: 'UNICO',
          competenciaCredito: '2099-10',
          recebidoEm: '2099-10-15',
        },
        tx,
      );

      const linhas = await tx.transaction.findMany({
        where: { id: { in: ids } },
        select: { id: true, status: true },
      });

      // Nenhuma sumiu do banco.
      expect(linhas).toHaveLength(3);
      expect(linhas.every((l) => l.status === 'CANCELADA')).toBe(true);
    });
  });

  it('parcela já cobrada permanece ATIVA e vira crédito de ESTORNO', async () => {
    await comRollback(async (tx) => {
      const { ids } = await compraParcelada(tx, 3, 30000);

      const primeira = await tx.transaction.findUniqueOrThrow({
        where: { id: ids[0] },
        select: { invoiceId: true },
      });
      await fecharFatura(primeira.invoiceId!, tx);

      await aplicarEstorno(
        {
          transactionId: ids[0],
          modo: 'UNICO',
          competenciaCredito: '2099-11',
          recebidoEm: '2099-11-15',
        },
        tx,
      );

      const cobrada = await tx.transaction.findUniqueOrThrow({
        where: { id: ids[0] },
        select: { status: true },
      });
      expect(cobrada.status).toBe('ATIVA');

      const creditos = await tx.credito.findMany({
        where: { transactionId: ids[0] },
        select: { valorCentavos: true, origem: true, competenciaCredito: true },
      });
      expect(creditos).toEqual([
        { valorCentavos: 10000, origem: 'ESTORNO', competenciaCredito: '2099-11' },
      ]);
    });
  });

  it('no modo POR_FATURA cada crédito herda a competência da sua parcela', async () => {
    await comRollback(async (tx) => {
      const { ids } = await compraParcelada(tx, 3, 30000);

      // Fecha as faturas das duas primeiras parcelas.
      for (const id of [ids[0], ids[1]]) {
        const t = await tx.transaction.findUniqueOrThrow({
          where: { id },
          select: { invoiceId: true },
        });
        await fecharFatura(t.invoiceId!, tx);
      }

      await aplicarEstorno(
        {
          transactionId: ids[0],
          modo: 'POR_FATURA',
          competenciaCredito: '2099-12',
          recebidoEm: '2099-12-15',
        },
        tx,
      );

      const creditos = await tx.credito.findMany({
        where: { transactionId: { in: ids } },
        orderBy: { competenciaCredito: 'asc' },
        select: { transactionId: true, competenciaCredito: true },
      });

      const parcelas = await tx.transaction.findMany({
        where: { id: { in: [ids[0], ids[1]] } },
        select: { id: true, competencia: true },
      });

      // Cada crédito caiu na competência da sua própria parcela, não na
      // competência única informada.
      for (const c of creditos) {
        const parcela = parcelas.find((p) => p.id === c.transactionId)!;
        expect(c.competenciaCredito).toBe(parcela.competencia);
      }
      expect(creditos).toHaveLength(2);
    });
  });

  it('o crédito de ESTORNO abate a fatura da sua competência', async () => {
    await comRollback(async (tx) => {
      const { ids } = await compraParcelada(tx, 1, 50000);

      const t = await tx.transaction.findUniqueOrThrow({
        where: { id: ids[0] },
        select: { invoiceId: true, competencia: true },
      });
      await fecharFatura(t.invoiceId!, tx);

      const antes = await totalDaFatura(t.invoiceId!, tx);
      expect(antes).toBe(50000);

      await aplicarEstorno(
        {
          transactionId: ids[0],
          modo: 'UNICO',
          competenciaCredito: t.competencia,
          recebidoEm: '2099-10-15',
        },
        tx,
      );

      expect(await totalDaFatura(t.invoiceId!, tx)).toBe(0);
    });
  });

  it('rejeita data de estorno em formato inválido', async () => {
    await comRollback(async (tx) => {
      const { ids } = await compraParcelada(tx, 1, 50000);

      await expect(
        aplicarEstorno(
          {
            transactionId: ids[0],
            modo: 'UNICO',
            competenciaCredito: '2099-10',
            recebidoEm: '15/10/2099',
          },
          tx,
        ),
      ).rejects.toThrow('Data civil inválida');
    });
  });

  it('rejeita competência de crédito em formato inválido', async () => {
    await comRollback(async (tx) => {
      const { ids } = await compraParcelada(tx, 1, 50000);

      await expect(
        aplicarEstorno(
          {
            transactionId: ids[0],
            modo: 'UNICO',
            competenciaCredito: '2099/10',
            recebidoEm: '2099-10-15',
          },
          tx,
        ),
      ).rejects.toThrow('Competência inválida');
    });
  });
});

describe('aplicarEstornoParcial', () => {
  it('cria o crédito e não cancela parcela nenhuma', async () => {
    await comRollback(async (tx) => {
      const { ids } = await compraParcelada(tx, 3, 30000);

      await aplicarEstornoParcial(
        {
          transactionId: ids[0],
          valorCentavos: 5000,
          competenciaCredito: '2099-10',
          recebidoEm: '2099-10-15',
        },
        tx,
      );

      const linhas = await tx.transaction.findMany({
        where: { id: { in: ids } },
        select: { status: true },
      });
      expect(linhas.every((l) => l.status === 'ATIVA')).toBe(true);

      const creditos = await tx.credito.findMany({
        where: { transactionId: ids[0] },
        select: { valorCentavos: true, origem: true },
      });
      expect(creditos).toEqual([{ valorCentavos: 5000, origem: 'ESTORNO' }]);
    });
  });

  it('aceita um valor maior que uma parcela, desde que caiba na compra inteira', async () => {
    await comRollback(async (tx) => {
      // 3 parcelas de R$100; devolveram um item de R$250.
      const { ids } = await compraParcelada(tx, 3, 30000);

      await aplicarEstornoParcial(
        {
          transactionId: ids[0],
          valorCentavos: 25000,
          competenciaCredito: '2099-10',
          recebidoEm: '2099-10-15',
        },
        tx,
      );

      const creditos = await tx.credito.findMany({
        where: { transactionId: ids[0] },
        select: { valorCentavos: true },
      });
      expect(creditos).toEqual([{ valorCentavos: 25000 }]);
    });
  });

  it('rejeita valor acima do total da compra', async () => {
    await comRollback(async (tx) => {
      const { ids } = await compraParcelada(tx, 3, 30000);

      await expect(
        aplicarEstornoParcial(
          {
            transactionId: ids[0],
            valorCentavos: 30001,
            competenciaCredito: '2099-10',
            recebidoEm: '2099-10-15',
          },
          tx,
        ),
      ).rejects.toThrow('excede o valor da compra');
    });
  });

  it('rejeita valor zero ou negativo', async () => {
    await comRollback(async (tx) => {
      const { ids } = await compraParcelada(tx, 1, 50000);

      await expect(
        aplicarEstornoParcial(
          {
            transactionId: ids[0],
            valorCentavos: 0,
            competenciaCredito: '2099-10',
            recebidoEm: '2099-10-15',
          },
          tx,
        ),
      ).rejects.toThrow('inteiro positivo');
    });
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/dados/estorno.test.ts`
Expected: FAIL — `Cannot find module './estorno'`.

- [ ] **Step 3: Implementar**

Crie `src/dados/estorno.ts`:

```ts
import { type Competencia, lerDataCivil } from '@/dominio/data';
import {
  type ModoCredito,
  type ParcelaEstornavel,
  planejarEstorno,
  planejarEstornoParcial,
} from '@/dominio/reembolso';

import { prisma } from './prisma';
import type { ClientePrisma } from './tipos';

export interface AlvoDoEstorno {
  /** A linha que o usuário clicou. */
  transactionId: string;
  descricao: string;
  grupoParcelamentoId: string | null;
  /** Valor da compra inteira — a soma das parcelas. */
  valorTotalCentavos: number;
  /** Em ordem de competência. */
  parcelas: ParcelaEstornavel[];
}

function validarCompetencia(c: Competencia): void {
  if (!/^\d{4}-\d{2}$/.test(c)) {
    throw new Error(`Competência inválida, esperado "YYYY-MM": ${c}`);
  }
}

/**
 * Quais linhas o estorno atinge. Se a compra é parcelada, é o grupo inteiro —
 * o spec (seção 6.2) diz que a ação existe "no lançamento à vista e no grupo
 * de parcelamento inteiro", nunca numa parcela solta.
 *
 * Parcela sem fatura conta como ABERTA: o spec põe "ABERTA ou ainda não
 * criada" na mesma linha da tabela, e um lançamento no PIX nunca tem fatura.
 */
export async function alvoDoEstorno(
  transactionId: string,
  cliente: ClientePrisma = prisma,
): Promise<AlvoDoEstorno> {
  const clicada = await cliente.transaction.findUnique({
    where: { id: transactionId },
    select: { descricao: true, grupoParcelamentoId: true },
  });

  if (!clicada) {
    throw new Error(`Lançamento não encontrado: ${transactionId}`);
  }

  const linhas = await cliente.transaction.findMany({
    where: clicada.grupoParcelamentoId
      ? { grupoParcelamentoId: clicada.grupoParcelamentoId }
      : { id: transactionId },
    orderBy: { competencia: 'asc' },
    select: {
      id: true,
      competencia: true,
      valorCentavos: true,
      invoice: { select: { status: true } },
    },
  });

  const parcelas: ParcelaEstornavel[] = linhas.map((l) => ({
    id: l.id,
    competencia: l.competencia,
    valorCentavos: l.valorCentavos,
    statusFatura: l.invoice?.status ?? 'ABERTA',
  }));

  return {
    transactionId,
    descricao: clicada.descricao,
    grupoParcelamentoId: clicada.grupoParcelamentoId,
    valorTotalCentavos: parcelas.reduce((total, p) => total + p.valorCentavos, 0),
    parcelas,
  };
}

/**
 * Aplica o plano que o domínio montou. Cancelamentos e créditos entram na
 * mesma transação de banco: um estorno que cancelasse as parcelas futuras e
 * falhasse ao criar os créditos tiraria a compra da projeção sem devolver o
 * dinheiro (spec, seção 13).
 */
export async function aplicarEstorno(
  dados: {
    transactionId: string;
    modo: ModoCredito;
    competenciaCredito: Competencia;
    recebidoEm: string;
  },
  cliente: ClientePrisma = prisma,
): Promise<void> {
  lerDataCivil(dados.recebidoEm);
  validarCompetencia(dados.competenciaCredito);

  const alvo = await alvoDoEstorno(dados.transactionId, cliente);
  const plano = planejarEstorno(alvo.parcelas, dados.modo, dados.competenciaCredito);

  const gravar = async (tx: ClientePrisma): Promise<void> => {
    if (plano.canceladas.length > 0) {
      // Cancelada, nunca apagada: o histórico continua explicando por que a
      // compra sumiu da projeção (spec, seção 13).
      await tx.transaction.updateMany({
        where: { id: { in: plano.canceladas } },
        data: { status: 'CANCELADA' },
      });
    }

    for (const credito of plano.creditos) {
      await tx.credito.create({
        data: {
          transactionId: credito.transactionId,
          valorCentavos: credito.valorCentavos,
          recebidoEm: dados.recebidoEm,
          competenciaCredito: credito.competenciaCredito,
          origem: 'ESTORNO',
        },
      });
    }
  };

  // Mesmo padrão de `criarLancamento`: reaproveita a transação quando já
  // estamos dentro de uma. O `$transaction` só existe no cliente de topo.
  if ('$transaction' in cliente) {
    await cliente.$transaction((tx) => gravar(tx));
  } else {
    await gravar(cliente);
  }
}

/**
 * Estorno parcial em valor (spec, seção 6.2): devolveram um item de uma compra
 * maior. Nenhuma parcela é cancelada — elas seguem sendo cobradas — e o valor
 * vira crédito na competência informada.
 *
 * O teto é o valor da COMPRA inteira, não o da parcela clicada: um item
 * devolvido pode custar mais que uma parcela.
 */
export async function aplicarEstornoParcial(
  dados: {
    transactionId: string;
    valorCentavos: number;
    competenciaCredito: Competencia;
    recebidoEm: string;
  },
  cliente: ClientePrisma = prisma,
): Promise<void> {
  lerDataCivil(dados.recebidoEm);
  validarCompetencia(dados.competenciaCredito);

  const alvo = await alvoDoEstorno(dados.transactionId, cliente);

  // Valida sinal e integralidade; lança se o valor não for positivo.
  const credito = planejarEstornoParcial(
    dados.transactionId,
    dados.valorCentavos,
    dados.competenciaCredito,
  );

  if (credito.valorCentavos > alvo.valorTotalCentavos) {
    throw new Error(
      `Estorno de ${credito.valorCentavos} excede o valor da compra, de ${alvo.valorTotalCentavos}`,
    );
  }

  await cliente.credito.create({
    data: {
      transactionId: credito.transactionId,
      valorCentavos: credito.valorCentavos,
      recebidoEm: dados.recebidoEm,
      competenciaCredito: credito.competenciaCredito,
      origem: 'ESTORNO',
    },
  });
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run src/dados/estorno.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar a suíte e os tipos**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: tudo verde e limpo.

- [ ] **Step 6: Commit**

```bash
git add src/dados/estorno.ts src/dados/estorno.test.ts
git commit -m "feat(dados): alvo do estorno e aplicação atômica do plano"
```

---

## Task 5: Tela de Reembolsos

"Quem me deve?" — a lista do que está pendente, com a caixa de confirmação de valor já preenchida com o pendente, e o histórico do que já foi recebido.

**Files:**
- Create: `src/app/(app)/reembolsos/page.tsx`
- Create: `src/app/(app)/reembolsos/acoes.ts`
- Create: `src/app/(app)/reembolsos/reembolsos.module.css`
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/dominio/avisos.ts`

**Interfaces:**
- Consumes: `listarReembolsos`, `registrarRecebimento`, `ReembolsoListado` de `@/dados/reembolsos`; `dataCivilEm`, `formatarDataCivil` de `@/dominio/data`; `formatarBRL` de `@/dominio/dinheiro`.

**Detalhes que o spec §6.1 fixa:**
- A caixa de recebimento vem **preenchida com o valor pendente**. Confirmar o valor cheio quita; informar menos registra o parcial e o reembolso continua aberto pelo restante.
- Cada recebimento aparece com **sua data e o mês corrigido** — é isso que torna visível que um reembolso de outubro mexeu em setembro.

- [ ] **Step 1: Escrever a Server Action**

Crie `src/app/(app)/reembolsos/acoes.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';

import { registrarRecebimento } from '@/dados/reembolsos';

export async function acaoRegistrarRecebimento(dadosForm: FormData): Promise<void> {
  const transactionId = String(dadosForm.get('transactionId') ?? '');
  const recebidoEm = String(dadosForm.get('recebidoEm') ?? '');
  // O campo chega em reais ("120.00"); centavos é a unidade de dentro.
  const valorCentavos = Math.round(Number(dadosForm.get('valor') ?? 0) * 100);

  await registrarRecebimento({ transactionId, valorCentavos, recebidoEm });

  revalidatePath('/reembolsos');
  // O crédito muda a despesa líquida do mês da despesa, então o Painel e as
  // Áreas daquele mês também mudam.
  revalidatePath('/');
  revalidatePath('/areas');
  revalidatePath('/fluxo');
}
```

- [ ] **Step 2: Escrever os estilos**

Crie `src/app/(app)/reembolsos/reembolsos.module.css`:

```css
.cabecalho {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}

.total {
  font-size: 22px;
  font-weight: 680;
  letter-spacing: -0.6px;
  font-variant-numeric: tabular-nums;
  color: #2a78d6;
}

.totalRotulo {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: #9ca3af;
}

.nota {
  font-size: 12px;
  color: #6b7280;
  margin: 0 0 18px;
}

.titulo {
  font-size: 13px;
  font-weight: 650;
  margin: 24px 0 10px;
}

.item {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 10px;
}

.itemQuitado {
  border-style: dashed;
  opacity: 0.75;
}

.itemTopo {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.descricao {
  font-size: 14px;
  font-weight: 600;
}

.meta {
  font-size: 11px;
  color: #9ca3af;
  margin-left: 7px;
  font-weight: 400;
}

.pendenteValor {
  font-size: 17px;
  font-weight: 680;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.pendenteRotulo {
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #9ca3af;
  margin-left: 6px;
}

.numeros {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  font-size: 12px;
  color: #6b7280;
  margin-top: 6px;
  font-variant-numeric: tabular-nums;
}

.etiqueta {
  display: inline-block;
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 7px;
  border-radius: 999px;
  font-weight: 650;
}

.pendente {
  background: #dbeafe;
  color: #1e40af;
}

.parcial {
  background: #fef3c7;
  color: #92400e;
}

.quitado {
  background: #dcfce7;
  color: #166534;
}

.parado {
  color: #b45309;
  font-weight: 600;
}

.recebimentos {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f3f4f6;
  font-size: 11.5px;
  color: #6b7280;
}

.recebimento {
  display: flex;
  gap: 8px;
  padding: 2px 0;
  font-variant-numeric: tabular-nums;
}

.corrigido {
  color: #9ca3af;
}

.formulario {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #f3f4f6;
  flex-wrap: wrap;
}

.campo {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.rotulo {
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #9ca3af;
}

.entrada {
  border: 1px solid #d1d5db;
  border-radius: 7px;
  padding: 6px 9px;
  font-size: 13px;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
}

.receber {
  background: #111827;
  color: #fff;
  border: none;
  border-radius: 7px;
  padding: 7px 14px;
  font-size: 12.5px;
  cursor: pointer;
  font-family: inherit;
}

.receber:hover {
  background: #374151;
}

.vazio {
  border: 1px dashed #d1d5db;
  border-radius: 10px;
  padding: 22px;
  text-align: center;
  color: #6b7280;
  font-size: 13px;
}
```

- [ ] **Step 3: Escrever a tela**

Crie `src/app/(app)/reembolsos/page.tsx`:

```tsx
import type { ReembolsoListado } from '@/dados/reembolsos';
import { listarReembolsos } from '@/dados/reembolsos';
import {
  competenciaDe,
  dataCivilEm,
  formatarDataCivil,
  lerDataCivil,
} from '@/dominio/data';
import { formatarBRL } from '@/dominio/dinheiro';
import type { EstadoReembolso } from '@/dominio/reembolso';

import { acaoRegistrarRecebimento } from './acoes';
import estilos from './reembolsos.module.css';

const CLASSE_DO_ESTADO: Record<EstadoReembolso, string> = {
  PENDENTE: estilos.pendente,
  PARCIAL: estilos.parcial,
  QUITADO: estilos.quitado,
  NAO_REEMBOLSAVEL: estilos.pendente,
};

const TEXTO_DO_ESTADO: Record<EstadoReembolso, string> = {
  PENDENTE: 'pendente',
  PARCIAL: 'parcial',
  QUITADO: 'quitado',
  NAO_REEMBOLSAVEL: 'não reembolsável',
};

/** O aviso azul do Painel dispara neste mesmo limiar (spec, seção 8.1). */
const DIAS_PARA_DESTACAR = 30;

function Historico({ r }: { r: ReembolsoListado }) {
  if (r.recebimentos.length === 0) return null;

  return (
    <div className={estilos.recebimentos}>
      {r.recebimentos.map((rec, i) => (
        <div key={`${rec.recebidoEm}-${i}`} className={estilos.recebimento}>
          <span>{formatarBRL(rec.valorCentavos)}</span>
          <span>recebido em {rec.recebidoEm}</span>
          {/* O mês corrigido: o crédito vale na competência da despesa, não na
              do recebimento (spec, seção 6.1). Mostrar isso é o que torna
              visível que outubro mexeu em setembro. */}
          {rec.competenciaCredito !== competenciaDe(lerDataCivil(rec.recebidoEm)) ? (
            <span className={estilos.corrigido}>
              · corrigiu {rec.competenciaCredito}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default async function Reembolsos() {
  const { pendentes, quitados } = await listarReembolsos();
  const hoje = formatarDataCivil(dataCivilEm(new Date()));
  const totalPendente = pendentes.reduce((a, r) => a + r.pendenteCentavos, 0);

  return (
    <>
      <div className={estilos.cabecalho}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Reembolsos</h1>
        <div style={{ textAlign: 'right' }}>
          <div className={estilos.totalRotulo}>Total a receber</div>
          <div className={estilos.total}>{formatarBRL(totalPendente)}</div>
        </div>
      </div>

      <p className={estilos.nota}>
        O reembolso não muda a fatura do cartão — aquele dinheiro saiu mesmo.
        Ele abate o orçamento e a sobra do mês da despesa, qualquer que seja a
        data em que você recebeu.
      </p>

      <div className={estilos.titulo}>A receber</div>

      {pendentes.length === 0 ? (
        <div className={estilos.vazio}>
          Ninguém te deve nada. Para marcar uma despesa como reembolsável,
          preencha &ldquo;a reembolsar&rdquo; ao criar o lançamento.
        </div>
      ) : (
        pendentes.map((r) => (
          <div key={r.transactionId} className={estilos.item}>
            <div className={estilos.itemTopo}>
              <div>
                <span className={estilos.descricao}>{r.descricao}</span>
                {r.parcelaTotal > 1 ? (
                  <span className={estilos.meta}>
                    parcela {r.parcelaNum}/{r.parcelaTotal}
                  </span>
                ) : null}
                <span className={estilos.meta}>
                  {r.categoriaNome} › {r.subcategoriaNome}
                </span>
              </div>
              <div>
                <span className={estilos.pendenteValor}>
                  {formatarBRL(r.pendenteCentavos)}
                </span>
                <span className={estilos.pendenteRotulo}>a receber</span>
              </div>
            </div>

            <div className={estilos.numeros}>
              <span className={`${estilos.etiqueta} ${CLASSE_DO_ESTADO[r.estado]}`}>
                {TEXTO_DO_ESTADO[r.estado]}
              </span>
              <span>gasto {formatarBRL(r.valorCentavos)}</span>
              <span>alvo {formatarBRL(r.alvoCentavos)}</span>
              <span>recebido {formatarBRL(r.recebidoCentavos)}</span>
              <span>{r.data}</span>
              <span className={r.diasParado > DIAS_PARA_DESTACAR ? estilos.parado : ''}>
                há {r.diasParado} dia{r.diasParado === 1 ? '' : 's'}
              </span>
            </div>

            <Historico r={r} />

            {/* Preenchido com o valor pendente (spec, seção 6.1): confirmar o
                valor cheio quita; um valor menor registra o parcial e o
                reembolso continua aberto pelo restante. */}
            <form action={acaoRegistrarRecebimento} className={estilos.formulario}>
              <input type="hidden" name="transactionId" value={r.transactionId} />
              <div className={estilos.campo}>
                <label className={estilos.rotulo} htmlFor={`valor-${r.transactionId}`}>
                  Valor recebido
                </label>
                <input
                  id={`valor-${r.transactionId}`}
                  className={estilos.entrada}
                  name="valor"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={(r.pendenteCentavos / 100).toFixed(2)}
                  defaultValue={(r.pendenteCentavos / 100).toFixed(2)}
                  required
                  style={{ width: 110 }}
                />
              </div>
              <div className={estilos.campo}>
                <label className={estilos.rotulo} htmlFor={`data-${r.transactionId}`}>
                  Recebido em
                </label>
                <input
                  id={`data-${r.transactionId}`}
                  className={estilos.entrada}
                  name="recebidoEm"
                  type="date"
                  defaultValue={hoje}
                  required
                />
              </div>
              <button type="submit" className={estilos.receber}>
                Registrar recebimento
              </button>
            </form>
          </div>
        ))
      )}

      {quitados.length > 0 ? (
        <>
          <div className={estilos.titulo}>Já recebidos</div>
          {quitados.map((r) => (
            <div
              key={r.transactionId}
              className={`${estilos.item} ${estilos.itemQuitado}`}
            >
              <div className={estilos.itemTopo}>
                <div>
                  <span className={estilos.descricao}>{r.descricao}</span>
                  <span className={estilos.meta}>
                    {r.categoriaNome} › {r.subcategoriaNome}
                  </span>
                </div>
                <span className={estilos.pendenteValor}>
                  {formatarBRL(r.recebidoCentavos)}
                </span>
              </div>
              <div className={estilos.numeros}>
                <span className={`${estilos.etiqueta} ${estilos.quitado}`}>quitado</span>
                <span>gasto {formatarBRL(r.valorCentavos)}</span>
                <span>{r.data}</span>
              </div>
              <Historico r={r} />
            </div>
          ))}
        </>
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: Apontar o aviso azul para a tela nova**

Em `src/dominio/avisos.ts`, o aviso de reembolso pendente ainda manda o usuário para `/lancamentos`, que existia antes desta tela. Troque:

```ts
      href: '/lancamentos',
```

por

```ts
      href: '/reembolsos',
```

**apenas** no bloco `if (entrada.reembolsoPendente !== null && ...)`. Os outros dois `href: '/lancamentos'` do arquivo (orçamento estourado e orçamento perto do limite) continuam como estão — eles apontam para os lançamentos daquela categoria, que é o destino certo.

- [ ] **Step 5: Somar o destino à navegação**

Em `src/app/(app)/layout.tsx`, insira Reembolsos depois de Fluxo:

```ts
const DESTINOS = [
  { href: '/', rotulo: 'Painel' },
  { href: '/orcamentos', rotulo: 'Orçamentos' },
  { href: '/lancamentos', rotulo: 'Lançamentos' },
  { href: '/areas', rotulo: 'Áreas' },
  { href: '/fluxo', rotulo: 'Fluxo' },
  { href: '/reembolsos', rotulo: 'Reembolsos' },
  { href: '/receitas', rotulo: 'Receitas' },
  { href: '/cartoes', rotulo: 'Cartões' },
  { href: '/ajustes', rotulo: 'Ajustes' },
];
```

- [ ] **Step 6: Verificar**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: tudo limpo, `/reembolsos` entre as rotas compiladas. Os testes de avisos continuam passando — nenhum deles asserta o href do aviso de reembolso.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/reembolsos" "src/app/(app)/layout.tsx" src/dominio/avisos.ts
git commit -m "feat(ui): tela de reembolsos com recebimento parcial e total"
```

---

## Task 6: Formulário de estorno

O spec §8.5 é explícito sobre o porquê: "Antes de confirmar, o formulário mostra o efeito exato, para que nada aconteça por surpresa". A escolha entre crédito único e por fatura "troca a linha do meio em tempo real, então dá para conferir contra a fatura do banco antes de confirmar".

Tempo real significa Client Component — e como `planejarEstorno` e `resumirPlanoEstorno` são puros, eles rodam no navegador para a prévia e no servidor na gravação, exatamente como `planejarLancamento` já faz no formulário de lançamento desde o Plano 2.

**Files:**
- Create: `src/app/(app)/lancamentos/[id]/estornar/page.tsx`
- Create: `src/app/(app)/lancamentos/[id]/estornar/estorno.tsx`
- Create: `src/app/(app)/lancamentos/[id]/estornar/acoes.ts`
- Create: `src/app/(app)/lancamentos/[id]/estornar/estorno.module.css`
- Modify: `src/app/(app)/lancamentos/page.tsx`

**Interfaces:**
- Consumes: `alvoDoEstorno`, `aplicarEstorno`, `aplicarEstornoParcial`, `AlvoDoEstorno` de `@/dados/estorno`; `planejarEstorno`, `resumirPlanoEstorno`, `ModoCredito`, `ParcelaEstornavel` de `@/dominio/reembolso`; `competenciaDe`, `dataCivilEm`, `formatarDataCivil` de `@/dominio/data`; `emCentavos`, `formatarBRL` de `@/dominio/dinheiro`.

- [ ] **Step 1: Escrever a Server Action**

Crie `src/app/(app)/lancamentos/[id]/estornar/acoes.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { aplicarEstorno, aplicarEstornoParcial } from '@/dados/estorno';
import type { ModoCredito } from '@/dominio/reembolso';

export async function acaoEstornar(dadosForm: FormData): Promise<void> {
  const transactionId = String(dadosForm.get('transactionId') ?? '');
  const competenciaCredito = String(dadosForm.get('competenciaCredito') ?? '');
  const recebidoEm = String(dadosForm.get('recebidoEm') ?? '');
  const parcial = dadosForm.get('parcial') === 'sim';

  if (parcial) {
    const valorCentavos = Math.round(Number(dadosForm.get('valor') ?? 0) * 100);
    await aplicarEstornoParcial({
      transactionId,
      valorCentavos,
      competenciaCredito,
      recebidoEm,
    });
  } else {
    const modo = String(dadosForm.get('modo') ?? 'UNICO') as ModoCredito;
    await aplicarEstorno({ transactionId, modo, competenciaCredito, recebidoEm });
  }

  // O estorno mexe na fatura, no orçamento do mês e na projeção.
  revalidatePath('/lancamentos');
  revalidatePath('/cartoes');
  revalidatePath('/');
  revalidatePath('/areas');
  revalidatePath('/fluxo');

  redirect('/lancamentos');
}
```

- [ ] **Step 2: Escrever os estilos**

Crie `src/app/(app)/lancamentos/[id]/estornar/estorno.module.css`:

```css
.voltar {
  font-size: 12.5px;
  color: #6b7280;
  text-decoration: none;
}

.voltar:hover {
  text-decoration: underline;
}

.compra {
  font-size: 19px;
  font-weight: 680;
  letter-spacing: -0.4px;
  margin: 10px 0 2px;
}

.compraMeta {
  font-size: 12.5px;
  color: #6b7280;
  margin-bottom: 20px;
}

.secao {
  margin-bottom: 18px;
}

.rotulo {
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #9ca3af;
  display: block;
  margin-bottom: 5px;
}

.chips {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
}

.chip {
  border: 1px solid #d1d5db;
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 12.5px;
  background: #fff;
  cursor: pointer;
  font-family: inherit;
}

.chipAtivo {
  background: #111827;
  border-color: #111827;
  color: #fff;
}

.entrada {
  border: 1px solid #d1d5db;
  border-radius: 7px;
  padding: 7px 10px;
  font-size: 13px;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
}

.linha {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: flex-end;
}

.campo {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

/* A prévia do spec 8.5: o efeito exato antes de confirmar. */
.previa {
  border: 1px solid #e5e7eb;
  border-left: 3px solid #2a78d6;
  border-radius: 8px;
  background: #f9fafb;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.65;
  margin-bottom: 18px;
}

.previaTitulo {
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #9ca3af;
  margin-bottom: 6px;
}

.previa b {
  font-variant-numeric: tabular-nums;
}

.creditadas {
  color: #1e40af;
}

.canceladas {
  color: #b45309;
}

.confirmar {
  background: #b91c1c;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 9px 18px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
}

.confirmar:hover {
  background: #991b1b;
}

.aviso {
  font-size: 12px;
  color: #6b7280;
  margin-top: 10px;
}
```

- [ ] **Step 3: Escrever o Client Component da prévia**

Crie `src/app/(app)/lancamentos/[id]/estornar/estorno.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';

import type { AlvoDoEstorno } from '@/dados/estorno';
import { formatarBRL } from '@/dominio/dinheiro';
import {
  type ModoCredito,
  planejarEstorno,
  resumirPlanoEstorno,
} from '@/dominio/reembolso';

import { acaoEstornar } from './acoes';
import estilos from './estorno.module.css';

function faixa(competencias: string[]): string {
  if (competencias.length === 0) return '';
  if (competencias.length === 1) return competencias[0];
  return `${competencias[0]} a ${competencias[competencias.length - 1]}`;
}

export function FormularioEstorno({
  alvo,
  competenciaPadrao,
  hoje,
}: {
  alvo: AlvoDoEstorno;
  competenciaPadrao: string;
  hoje: string;
}) {
  const [parcial, setParcial] = useState(false);
  const [modo, setModo] = useState<ModoCredito>('UNICO');
  const [competencia, setCompetencia] = useState(competenciaPadrao);
  const [valor, setValor] = useState(
    (alvo.valorTotalCentavos / 100).toFixed(2),
  );

  // A mesma função que o servidor roda na gravação — por isso a prévia nunca
  // diverge do que acontece de fato (spec, seção 8.5).
  const resumo = useMemo(
    () => resumirPlanoEstorno(planejarEstorno(alvo.parcelas, modo, competencia), alvo.parcelas),
    [alvo.parcelas, modo, competencia],
  );

  const valorParcial = Math.round(Number(valor || 0) * 100);

  return (
    <form action={acaoEstornar}>
      <input type="hidden" name="transactionId" value={alvo.transactionId} />
      <input type="hidden" name="parcial" value={parcial ? 'sim' : 'nao'} />
      <input type="hidden" name="modo" value={modo} />

      <div className={estilos.secao}>
        <span className={estilos.rotulo}>O que foi devolvido</span>
        <div className={estilos.chips}>
          <button
            type="button"
            onClick={() => setParcial(false)}
            className={`${estilos.chip} ${!parcial ? estilos.chipAtivo : ''}`}
          >
            A compra inteira
          </button>
          <button
            type="button"
            onClick={() => setParcial(true)}
            className={`${estilos.chip} ${parcial ? estilos.chipAtivo : ''}`}
          >
            Só uma parte
          </button>
        </div>
      </div>

      {parcial ? (
        <div className={estilos.secao}>
          <span className={estilos.rotulo}>Valor devolvido</span>
          <input
            className={estilos.entrada}
            name="valor"
            type="number"
            step="0.01"
            min="0.01"
            max={(alvo.valorTotalCentavos / 100).toFixed(2)}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            required
            style={{ width: 130 }}
          />
        </div>
      ) : (
        <div className={estilos.secao}>
          <span className={estilos.rotulo}>Como a operadora devolveu</span>
          <div className={estilos.chips}>
            <button
              type="button"
              onClick={() => setModo('UNICO')}
              className={`${estilos.chip} ${modo === 'UNICO' ? estilos.chipAtivo : ''}`}
            >
              Crédito único
            </button>
            <button
              type="button"
              onClick={() => setModo('POR_FATURA')}
              className={`${estilos.chip} ${modo === 'POR_FATURA' ? estilos.chipAtivo : ''}`}
            >
              Por fatura
            </button>
          </div>
        </div>
      )}

      <div className={estilos.linha} style={{ marginBottom: 18 }}>
        <div className={estilos.campo}>
          <label className={estilos.rotulo} htmlFor="competenciaCredito">
            Competência do crédito
          </label>
          <input
            id="competenciaCredito"
            className={estilos.entrada}
            name="competenciaCredito"
            type="month"
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
            required
          />
        </div>
        <div className={estilos.campo}>
          <label className={estilos.rotulo} htmlFor="recebidoEm">
            Data do estorno
          </label>
          <input
            id="recebidoEm"
            className={estilos.entrada}
            name="recebidoEm"
            type="date"
            defaultValue={hoje}
            required
          />
        </div>
      </div>

      <div className={estilos.previa}>
        <div className={estilos.previaTitulo}>O que vai acontecer</div>

        {parcial ? (
          <div>
            <b>{formatarBRL(valorParcial)}</b> viram crédito em{' '}
            <b>{competencia}</b>. Nenhuma parcela é cancelada — a compra segue
            sendo cobrada normalmente.
          </div>
        ) : (
          <>
            {resumo.creditadas.quantidade > 0 ? (
              <div className={estilos.creditadas}>
                <b>
                  {resumo.creditadas.quantidade} parcela
                  {resumo.creditadas.quantidade > 1 ? 's' : ''} já cobrada
                  {resumo.creditadas.quantidade > 1 ? 's' : ''}
                </b>{' '}
                ({faixa(resumo.creditadas.competencias)}) vira
                {resumo.creditadas.quantidade > 1 ? 'm' : ''} crédito de{' '}
                <b>{formatarBRL(resumo.creditadas.valorCentavos)}</b> em{' '}
                <b>{faixa(resumo.competenciasDeCredito)}</b>
              </div>
            ) : null}

            {resumo.canceladas.quantidade > 0 ? (
              <div className={estilos.canceladas}>
                <b>
                  {resumo.canceladas.quantidade} parcela
                  {resumo.canceladas.quantidade > 1 ? 's' : ''} ainda não cobrada
                  {resumo.canceladas.quantidade > 1 ? 's' : ''}
                </b>{' '}
                ({faixa(resumo.canceladas.competencias)}){' '}
                {resumo.canceladas.quantidade > 1 ? 'são canceladas' : 'é cancelada'} —
                libera<b> {formatarBRL(resumo.canceladas.valorCentavos)}</b> da
                projeção
              </div>
            ) : null}
          </>
        )}
      </div>

      <button type="submit" className={estilos.confirmar}>
        Confirmar estorno
      </button>

      <p className={estilos.aviso}>
        As parcelas canceladas continuam no banco, marcadas como canceladas — o
        histórico segue explicando por que a compra saiu da projeção.
      </p>
    </form>
  );
}
```

- [ ] **Step 4: Escrever a página**

Crie `src/app/(app)/lancamentos/[id]/estornar/page.tsx`:

```tsx
import Link from 'next/link';

import { alvoDoEstorno } from '@/dados/estorno';
import { competenciaDe, dataCivilEm, formatarDataCivil } from '@/dominio/data';
import { formatarBRL } from '@/dominio/dinheiro';

import { FormularioEstorno } from './estorno';
import estilos from './estorno.module.css';

export default async function Estornar({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const alvo = await alvoDoEstorno(id);

  const hojeCivil = dataCivilEm(new Date());

  return (
    <>
      <Link href="/lancamentos" className={estilos.voltar}>
        ‹ voltar aos lançamentos
      </Link>

      <div className={estilos.compra}>Estornar {alvo.descricao}</div>
      <div className={estilos.compraMeta}>
        {formatarBRL(alvo.valorTotalCentavos)}
        {alvo.parcelas.length > 1 ? ` · ${alvo.parcelas.length}x` : ' · à vista'}
      </div>

      <FormularioEstorno
        alvo={alvo}
        competenciaPadrao={competenciaDe(hojeCivil)}
        hoje={formatarDataCivil(hojeCivil)}
      />
    </>
  );
}
```

- [ ] **Step 5: Ligar a ação na lista de lançamentos**

Em `src/app/(app)/lancamentos/page.tsx`, na célula de ações de cada linha (a mesma `<td>` onde hoje fica o formulário de apagar), acrescente o link de estorno **antes** do botão de apagar:

```tsx
<Link
  href={`/lancamentos/${l.id}/estornar`}
  style={{ fontSize: 11, color: '#b45309', textDecoration: 'none', marginRight: 8 }}
>
  estornar
</Link>
```

O `Link` de `next/link` já está importado no topo desse arquivo.

- [ ] **Step 6: Verificar**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: tudo limpo, `/lancamentos/[id]/estornar` entre as rotas compiladas.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/lancamentos"
git commit -m "feat(ui): formulário de estorno com prévia do efeito exato"
```

---

## Task 7: Janela de faturas em `/cartoes`

Adiada deliberadamente na revisão do Plano 2. O problema é real: uma compra em 18x cria dezoito faturas futuras, e o histórico pago só cresce — a tela lista todas.

**Files:**
- Modify: `src/dominio/fatura.ts`
- Test: `src/dominio/fatura.test.ts`
- Modify: `src/app/(app)/cartoes/page.tsx`

**Interfaces:**
- Consumes: `Competencia`, `somarMeses` de `@/dominio/data`.
- Produces:
  - `MESES_DE_FATURA_PARA_TRAS = 3`, `MESES_DE_FATURA_PARA_FRENTE = 6`
  - `janelaDeFaturas<T extends { competencia: Competencia }>(faturas: T[], mesCorrente: Competencia): { visiveis: T[]; ocultas: number }`

**A regra:** mostra as faturas cuja competência cai entre `mesCorrente - 3` e `mesCorrente + 6`, e conta quantas ficaram de fora. Mais espaço para a frente do que para trás porque é para a frente que o parcelamento empurra faturas. A tela oferece `?todas=1` para ver o resto.

- [ ] **Step 1: Escrever os testes que falham**

Adicione ao fim de `src/dominio/fatura.test.ts`. Some `janelaDeFaturas`, `MESES_DE_FATURA_PARA_TRAS` e `MESES_DE_FATURA_PARA_FRENTE` ao `import` de `./fatura` que já existe.

```ts
describe('janelaDeFaturas', () => {
  const fatura = (competencia: string) => ({ competencia });

  it('mantém as faturas dentro da janela e conta as de fora', () => {
    const todas = [
      fatura('2025-12'), // 9 meses atrás — fora
      fatura('2026-06'), // 3 meses atrás — dentro (borda)
      fatura('2026-09'), // mês corrente — dentro
      fatura('2027-03'), // 6 meses à frente — dentro (borda)
      fatura('2027-04'), // 7 meses à frente — fora
    ];

    const { visiveis, ocultas } = janelaDeFaturas(todas, '2026-09');

    expect(visiveis.map((f) => f.competencia)).toEqual([
      '2026-06',
      '2026-09',
      '2027-03',
    ]);
    expect(ocultas).toBe(2);
  });

  it('inclui exatamente as bordas da janela', () => {
    const tras = somarMeses('2026-09', -MESES_DE_FATURA_PARA_TRAS);
    const frente = somarMeses('2026-09', MESES_DE_FATURA_PARA_FRENTE);

    const { visiveis } = janelaDeFaturas(
      [fatura(tras), fatura(frente)],
      '2026-09',
    );

    expect(visiveis).toHaveLength(2);
  });

  it('exclui o mês imediatamente fora de cada borda', () => {
    const antes = somarMeses('2026-09', -MESES_DE_FATURA_PARA_TRAS - 1);
    const depois = somarMeses('2026-09', MESES_DE_FATURA_PARA_FRENTE + 1);

    const { visiveis, ocultas } = janelaDeFaturas(
      [fatura(antes), fatura(depois)],
      '2026-09',
    );

    expect(visiveis).toEqual([]);
    expect(ocultas).toBe(2);
  });

  it('atravessa a virada de ano', () => {
    const { visiveis } = janelaDeFaturas(
      [fatura('2025-11'), fatura('2026-01'), fatura('2026-07')],
      '2026-01',
    );

    // Janela de 2025-10 a 2026-07: as três entram.
    expect(visiveis).toHaveLength(3);
  });

  it('lista vazia devolve vazio, sem ocultas', () => {
    expect(janelaDeFaturas([], '2026-09')).toEqual({ visiveis: [], ocultas: 0 });
  });

  it('preserva a ordem recebida', () => {
    const { visiveis } = janelaDeFaturas(
      [fatura('2026-10'), fatura('2026-08'), fatura('2026-09')],
      '2026-09',
    );

    expect(visiveis.map((f) => f.competencia)).toEqual([
      '2026-10',
      '2026-08',
      '2026-09',
    ]);
  });

  it('não modifica o array recebido', () => {
    const entrada = [fatura('2020-01'), fatura('2026-09')];
    janelaDeFaturas(entrada, '2026-09');

    expect(entrada).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/dominio/fatura.test.ts`
Expected: FAIL — `janelaDeFaturas is not a function`.

- [ ] **Step 3: Implementar**

Acrescente ao fim de `src/dominio/fatura.ts` (e confirme que `somarMeses` está no import de `./data` no topo do arquivo; se não estiver, some-o):

```ts
/**
 * A janela que `/cartoes` mostra por padrão. Mais espaço para a frente do que
 * para trás porque é para a frente que o parcelamento empurra faturas: uma
 * compra em 18x cria dezoito competências futuras de uma vez.
 */
export const MESES_DE_FATURA_PARA_TRAS = 3;
export const MESES_DE_FATURA_PARA_FRENTE = 6;

/**
 * Separa as faturas visíveis das que ficam de fora da janela. Preserva a
 * ordem recebida e não modifica o array de entrada.
 */
export function janelaDeFaturas<T extends { competencia: Competencia }>(
  faturas: T[],
  mesCorrente: Competencia,
): { visiveis: T[]; ocultas: number } {
  const inicio = somarMeses(mesCorrente, -MESES_DE_FATURA_PARA_TRAS);
  const fim = somarMeses(mesCorrente, MESES_DE_FATURA_PARA_FRENTE);

  // "YYYY-MM" compara lexicograficamente na mesma ordem que cronologicamente.
  const visiveis = faturas.filter(
    (f) => f.competencia >= inicio && f.competencia <= fim,
  );

  return { visiveis, ocultas: faturas.length - visiveis.length };
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run src/dominio/fatura.test.ts`
Expected: PASS.

- [ ] **Step 5: Usar a janela na tela**

Em `src/app/(app)/cartoes/page.tsx`, três mudanças.

Primeiro, os imports — some ao que já existe:

```tsx
import Link from 'next/link';

import { competenciaDe, dataCivilEm, formatarDataCivil } from '@/dominio/data';
import { janelaDeFaturas } from '@/dominio/fatura';
```

Segundo, a assinatura do componente passa a receber `searchParams`, e a montagem filtra pela janela. Troque o início da função:

```tsx
export default async function Cartoes({
  searchParams,
}: {
  searchParams: Promise<{ todas?: string }>;
}) {
  const { todas } = await searchParams;
  const mostrarTodas = todas === '1';

  const cartoes = await listarCartoes();
  const mesCorrente = competenciaDe(dataCivilEm(new Date()));

  const comFaturas = await Promise.all(
    cartoes.map(async (cartao) => {
      const todasAsFaturas = await listarFaturas(cartao.id);
      const { visiveis, ocultas } = mostrarTodas
        ? { visiveis: todasAsFaturas, ocultas: 0 }
        : janelaDeFaturas(todasAsFaturas, mesCorrente);

      const comTotais = await Promise.all(
        visiveis.map(async (f) => ({
          ...f,
          total: await totalDaFatura(f.id),
        })),
      );
      return { cartao, faturas: comTotais, ocultas };
    }),
  );
```

Note que `totalDaFatura` agora só é chamado para as faturas visíveis — antes era uma consulta por fatura existente, sem teto.

Terceiro, o `map` de renderização passa a desestruturar `ocultas`, e a tabela ganha um rodapé com o link. Troque `comFaturas.map(({ cartao, faturas }) => (` por `comFaturas.map(({ cartao, faturas, ocultas }) => (`, e logo **depois** do fechamento da `</table>` de cada cartão, acrescente:

```tsx
{ocultas > 0 ? (
  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
    {ocultas} fatura{ocultas > 1 ? 's' : ''} fora da janela em torno de{' '}
    {mesCorrente}.{' '}
    <Link href="/cartoes?todas=1" style={{ color: '#2a78d6' }}>
      ver todas
    </Link>
  </div>
) : null}
```

E, quando `mostrarTodas` for verdadeiro, ofereça a volta — logo antes do primeiro `comFaturas.map(...)`, dentro do JSX:

```tsx
{mostrarTodas ? (
  <p style={{ fontSize: 12, marginTop: 0 }}>
    Mostrando todas as faturas.{' '}
    <Link href="/cartoes" style={{ color: '#2a78d6' }}>
      voltar à janela padrão
    </Link>
  </p>
) : null}
```

- [ ] **Step 6: Verificar**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: tudo limpo.

- [ ] **Step 7: Commit**

```bash
git add src/dominio/fatura.ts src/dominio/fatura.test.ts "src/app/(app)/cartoes/page.tsx"
git commit -m "feat(ui): janela de faturas em /cartoes, com ver todas"
```

---

## Ao terminar

Este plano fecha o ciclo do dinheiro que volta: o que um terceiro te deve, e o que a operadora desfez.

Antes de começar o Plano 6, confirme no navegador com sessão real:

- [ ] `npx vitest run` passa inteiro, `npx tsc --noEmit`, `npm run lint` e `npm run build` limpos
- [ ] Criar um lançamento com "a reembolsar" preenchido faz ele aparecer em **Reembolsos**
- [ ] Registrar um recebimento **parcial** mantém a pendência aberta pelo restante, e um segundo recebimento quita
- [ ] Um reembolso recebido num mês **posterior** ao da despesa muda o número do mês da **despesa** no Painel, não o do mês do recebimento
- [ ] O reembolso **não** muda o total da fatura em `/cartoes`
- [ ] Estornar uma compra parcelada com faturas fechadas mostra a prévia com os dois grupos, e trocar entre "crédito único" e "por fatura" muda a linha na hora
- [ ] Depois de confirmar o estorno, as parcelas futuras somem da projeção e as cobradas viram crédito
- [ ] O estorno **reduz** o total da fatura da competência do crédito
- [ ] Em `/cartoes`, um cartão com muitas faturas mostra só a janela, e "ver todas" abre o resto

**Fica para o plano seguinte:** despesas recorrentes e PWA (Plano 6).
