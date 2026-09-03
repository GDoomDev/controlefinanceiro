# Completude de CRUD em Ajustes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a Subcategoria, Cartão e Despesa Fixa a capacidade de editar (e, para as
duas primeiras, arquivar) que hoje não existe nem no backend nem na tela.

**Architecture:** Cada entidade ganha uma função `editar*` em `src/dados/` que reaplica
exatamente a mesma validação da função `criar*` irmã, mais (Subcategoria/Cartão) uma
`arquivar*` que grava nos campos `arquivada`/`ativo` já existentes no schema. Na tela,
um botão "editar" por item abre um `<dialog>` nativo pré-preenchido — mesmo padrão já
usado pelo botão "excluir" de Orçamento (`BotaoExcluirCategoria`).

**Tech Stack:** Prisma 6.19.3 contra o schema já existente (nenhuma migração
necessária — `Subcategory.arquivada` e `Card.ativo` já existem e já são filtrados nas
listagens). Server Actions + `<dialog>` nativo, mesmo padrão do resto do app.

## Global Constraints

- Nenhuma migração de banco: `Subcategory.arquivada` e `Card.ativo` já existem no
  schema (`prisma/schema.prisma`) e já são filtrados por `listarCategorias`
  (`subcategorias: { where: { arquivada: false } }`) e `listarCartoes`
  (`where: { ativo: true }`) — as novas funções só escrevem nesses campos.
- Cada função `editar*` reaplica **exatamente** a mesma validação (mesmas mensagens de
  erro) que a função `criar*` irmã já usa — nenhuma regra nova é inventada.
- Escrita otimista (`useOptimistic`) **não** se aplica às novas ações de editar/arquivar
  — só as 3 listas de criação já têm esse tratamento, de um sub-projeto anterior.
  Editar/arquivar usam Server Action direta + revalidação normal da página, como o
  botão "excluir" de Orçamento já faz.
- Fora de escopo (não tocar): editar Lançamento; renomear/recolorir Orçamento; editar
  o campo "início" de uma Despesa Fixa; qualquer exclusão "de fato" (não-arquivada)
  de Despesa Fixa (`encerrarRecorrencia` já cobre essa necessidade).
- Toda função nova em `src/dados/` ganha teste com `comRollback`, seguindo a
  convenção do arquivo onde entra (mesmos imports, mesmo estilo dos testes vizinhos).
  Nenhum teste usa uma competência fora de "2099-01" ou posterior (convenção do
  projeto — mantém os testes fora de qualquer dado real).
- Interface (Server Components + `<dialog>`) não ganha teste automatizado, por
  convenção já estabelecida — verificação manual no fim do plano inteiro.

---

## Task 1: Subcategoria — editar e arquivar

**Files:**
- Modify: `src/dados/categorias.ts`
- Modify: `src/dados/categorias.test.ts`
- Modify: `src/app/(app)/ajustes/acoes.ts`
- Modify: `src/app/(app)/ajustes/ajustes.module.css`
- Modify: `src/app/(app)/ajustes/lista-categorias.tsx`
- Modify: `src/app/(app)/ajustes/page.tsx`
- Create: `src/app/(app)/ajustes/botao-editar-subcategoria.tsx`
- Create: `src/app/(app)/ajustes/botao-excluir-subcategoria.tsx`

**Interfaces:**
- Produces: `editarSubcategoria(id: string, dados: { nome: string }, cliente?: ClientePrisma): Promise<void>`;
  `arquivarSubcategoria(id: string, cliente?: ClientePrisma): Promise<void>` — ambas em
  `src/dados/categorias.ts`, exportadas ao lado de `criarSubcategoria`.
- Produces: as classes CSS novas `.subLista`, `.subItem`, `.dialogoCampos` em
  `ajustes.module.css` — Tasks 2 e 3 reaproveitam `.dialogoCampos` (as duas primeiras
  são específicas de Subcategoria).

- [ ] **Step 1: Adicionar `editarSubcategoria` e `arquivarSubcategoria` em `src/dados/categorias.ts`**

Logo depois de `criarSubcategoria` (antes de `buscarSubcategoria`), adicione:

```ts
export async function editarSubcategoria(
  id: string,
  dados: { nome: string },
  cliente: ClientePrisma = prisma,
): Promise<void> {
  const nome = nomeLimpo(dados.nome);
  await cliente.subcategory.update({
    where: { id },
    data: { nome },
  });
}
```

E, depois de `arquivarCategoria` (no fim do arquivo), adicione:

```ts
export async function arquivarSubcategoria(
  id: string,
  cliente: ClientePrisma = prisma,
): Promise<void> {
  await cliente.subcategory.update({
    where: { id },
    data: { arquivada: true },
  });
}
```

- [ ] **Step 2: Escrever os testes em `src/dados/categorias.test.ts`**

Adicione ao topo do arquivo, no `import { ... } from './categorias'`, os dois nomes
novos (`editarSubcategoria`, `arquivarSubcategoria`) na lista já existente. Depois,
logo após o bloco `describe('criarSubcategoria', ...)`, adicione:

```ts
describe('editarSubcategoria', () => {
  it('atualiza o nome e reflete na listagem', async () => {
    await comRollback(async (tx) => {
      const cat = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
      const sub = await criarSubcategoria(
        { budgetCategoryId: cat.id, nome: 'Delivery' },
        tx,
      );
      await editarSubcategoria(sub.id, { nome: 'Delivery e Apps' }, tx);
      const lista = await listarCategorias(tx);
      const nomes = lista.find((c) => c.id === cat.id)!.subcategorias.map((s) => s.nome);
      expect(nomes).toEqual(['Delivery e Apps']);
    });
  });

  it('rejeita nome vazio', async () => {
    await comRollback(async (tx) => {
      const cat = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
      const sub = await criarSubcategoria(
        { budgetCategoryId: cat.id, nome: 'Delivery' },
        tx,
      );
      await expect(editarSubcategoria(sub.id, { nome: '  ' }, tx)).rejects.toThrow();
    });
  });

  it('rejeita colisão com outra subcategoria do mesmo orçamento', async () => {
    await comRollback(async (tx) => {
      const cat = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
      await criarSubcategoria({ budgetCategoryId: cat.id, nome: 'Delivery' }, tx);
      const mercado = await criarSubcategoria(
        { budgetCategoryId: cat.id, nome: 'Mercado' },
        tx,
      );
      await expect(
        editarSubcategoria(mercado.id, { nome: 'Delivery' }, tx),
      ).rejects.toThrow();
    });
  });
});
```

E, logo após o bloco `describe('arquivarCategoria', ...)`, adicione:

```ts
describe('arquivarSubcategoria', () => {
  it('some da listagem depois de arquivada, mas o orçamento continua ativo', async () => {
    await comRollback(async (tx) => {
      const cat = await criarCategoria({ nome: 'Alimentação', corSlot: 2 }, tx);
      const sub = await criarSubcategoria(
        { budgetCategoryId: cat.id, nome: 'Delivery' },
        tx,
      );
      await arquivarSubcategoria(sub.id, tx);
      const lista = await listarCategorias(tx);
      const categoria = lista.find((c) => c.id === cat.id);
      expect(categoria).toBeDefined();
      expect(categoria!.subcategorias).toEqual([]);
    });
  });
});
```

- [ ] **Step 3: Rodar os testes novos**

Run: `npx vitest run src/dados/categorias.test.ts`
Expected: todos passam, incluindo os 4 novos.

- [ ] **Step 4: Adicionar as Server Actions em `src/app/(app)/ajustes/acoes.ts`**

No `import { ... } from '@/dados/categorias'` do topo, adicione `editarSubcategoria` e
`arquivarSubcategoria` à lista. Depois, logo após `acaoCriarSubcategoria`, adicione:

```ts
export async function acaoEditarSubcategoria(dadosForm: FormData): Promise<void> {
  await editarSubcategoria(String(dadosForm.get('id') ?? ''), {
    nome: String(dadosForm.get('nome') ?? ''),
  });
  revalidatePath('/ajustes');
}

export async function acaoArquivarSubcategoria(dadosForm: FormData): Promise<void> {
  await arquivarSubcategoria(String(dadosForm.get('id') ?? ''));
  revalidatePath('/ajustes');
  // A subcategoria some do seletor de Despesa Fixa (mesma tela) e do seletor de
  // subcategoria em Lançamentos — ambos revalidados aqui.
  revalidatePath('/lancamentos/novo');
}
```

- [ ] **Step 5: Adicionar as classes CSS novas em `ajustes.module.css`**

No fim do arquivo, adicione:

```css
.subLista {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.subItem {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.dialogoCampos {
  display: flex;
  flex-direction: column;
  gap: var(--espaco-3);
  margin: var(--espaco-3) 0 0;
}
```

- [ ] **Step 6: Criar `src/app/(app)/ajustes/botao-editar-subcategoria.tsx`**

```tsx
'use client';

import { useRef } from 'react';

import estilos from './ajustes.module.css';

/**
 * Botão + popup de edição, mesmo padrão do `<dialog>` nativo já usado por
 * `BotaoExcluirCategoria` — só que aqui o formulário tem um campo editável em
 * vez de só confirmar.
 */
export function BotaoEditarSubcategoria({
  subcategoriaId,
  nomeAtual,
  acao,
}: {
  subcategoriaId: string;
  nomeAtual: string;
  acao: (dadosForm: FormData) => Promise<void>;
}) {
  const dialogoRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className={estilos.botaoTexto}
        onClick={() => dialogoRef.current?.showModal()}
      >
        editar
      </button>
      <dialog ref={dialogoRef} className={estilos.dialogo}>
        <p>Editar subcategoria</p>
        <form action={acao} className={estilos.dialogoCampos}>
          <input type="hidden" name="id" value={subcategoriaId} />
          <div className={estilos.campo}>
            <label
              className={estilos.rotulo}
              htmlFor={`sub-editar-nome-${subcategoriaId}`}
            >
              Nome
            </label>
            <input
              id={`sub-editar-nome-${subcategoriaId}`}
              name="nome"
              required
              defaultValue={nomeAtual}
              className={estilos.entrada}
            />
          </div>
          <div className={estilos.dialogoBotoes}>
            <button
              type="button"
              className={estilos.botaoCancelar}
              onClick={() => dialogoRef.current?.close()}
            >
              Cancelar
            </button>
            <button type="submit" className={estilos.botao}>
              Salvar
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
```

- [ ] **Step 7: Criar `src/app/(app)/ajustes/botao-excluir-subcategoria.tsx`**

```tsx
'use client';

import { useRef } from 'react';

import estilos from './ajustes.module.css';

export function BotaoExcluirSubcategoria({
  subcategoriaId,
  subcategoriaNome,
  acao,
}: {
  subcategoriaId: string;
  subcategoriaNome: string;
  acao: (dadosForm: FormData) => Promise<void>;
}) {
  const dialogoRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className={estilos.botaoTexto}
        onClick={() => dialogoRef.current?.showModal()}
      >
        excluir
      </button>
      <dialog ref={dialogoRef} className={estilos.dialogo}>
        <p>
          Excluir <strong>{subcategoriaNome}</strong>?
        </p>
        <p className={estilos.dialogoAviso}>
          Isso arquiva a subcategoria: ela some de novas escolhas (novos
          lançamentos, novas despesas fixas), mas nenhum lançamento ou
          histórico já existente é apagado ou muda de valor.
        </p>
        <form action={acao} className={estilos.dialogoBotoes}>
          <input type="hidden" name="id" value={subcategoriaId} />
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

- [ ] **Step 8: Atualizar `lista-categorias.tsx` para renderizar cada subcategoria com editar+excluir**

Troque o import:

```tsx
import { BotaoExcluirCategoria } from './botao-excluir-categoria';
import { BotaoEditarSubcategoria } from './botao-editar-subcategoria';
import { BotaoExcluirSubcategoria } from './botao-excluir-subcategoria';
import { SeletorDeCor, type SlotOcupadoProp } from './seletor-de-cor';
```

Troque a assinatura da função para receber as duas novas ações:

```tsx
export function ListaCategorias({
  categoriasIniciais,
  ocupados,
  acaoCriar,
  acaoExcluir,
  acaoEditarSubcategoria,
  acaoArquivarSubcategoria,
}: {
  categoriasIniciais: CategoriaComSubs[];
  ocupados: SlotOcupadoProp[];
  acaoCriar: (dadosForm: FormData) => Promise<void>;
  acaoExcluir: (dadosForm: FormData) => Promise<void>;
  acaoEditarSubcategoria: (dadosForm: FormData) => Promise<void>;
  acaoArquivarSubcategoria: (dadosForm: FormData) => Promise<void>;
}) {
```

Troque o trecho que hoje mostra `{c.subcategorias.length === 0 ? 'sem subcategorias' :
c.subcategorias.map((s) => s.nome).join(' · ')}` por:

```tsx
<span className={estilos.subs}>
  {c.subcategorias.length === 0 ? (
    'sem subcategorias'
  ) : (
    <span className={estilos.subLista}>
      {c.subcategorias.map((s) => (
        <span key={s.id} className={estilos.subItem}>
          {s.nome}
          <BotaoEditarSubcategoria
            subcategoriaId={s.id}
            nomeAtual={s.nome}
            acao={acaoEditarSubcategoria}
          />
          <BotaoExcluirSubcategoria
            subcategoriaId={s.id}
            subcategoriaNome={s.nome}
            acao={acaoArquivarSubcategoria}
          />
        </span>
      ))}
    </span>
  )}
</span>
```

(Note que a tag `<span className={estilos.subs}>` que já envolvia esse trecho
continua — só o conteúdo de dentro muda.)

- [ ] **Step 9: Passar as novas ações em `src/app/(app)/ajustes/page.tsx`**

No `import { ... } from './acoes'`, adicione `acaoEditarSubcategoria` e
`acaoArquivarSubcategoria`. No JSX de `<ListaCategorias>`, adicione as duas props:

```tsx
<ListaCategorias
  categoriasIniciais={categorias}
  ocupados={ocupados}
  acaoCriar={acaoCriarCategoria}
  acaoExcluir={acaoExcluirCategoria}
  acaoEditarSubcategoria={acaoEditarSubcategoria}
  acaoArquivarSubcategoria={acaoArquivarSubcategoria}
/>
```

- [ ] **Step 10: Rodar a suíte completa**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`
Expected: os quatro comandos limpos. Nenhuma mudança de lógica em outras telas —
qualquer falha fora de `categorias.ts`/`categorias.test.ts`/`ajustes/` é regressão
real.

- [ ] **Step 11: Commit**

```bash
git add src/dados/categorias.ts src/dados/categorias.test.ts \
  "src/app/(app)/ajustes/acoes.ts" "src/app/(app)/ajustes/ajustes.module.css" \
  "src/app/(app)/ajustes/lista-categorias.tsx" "src/app/(app)/ajustes/page.tsx" \
  "src/app/(app)/ajustes/botao-editar-subcategoria.tsx" \
  "src/app/(app)/ajustes/botao-excluir-subcategoria.tsx"
git commit -m "feat(subcategoria): adiciona editar e arquivar"
```

---

## Task 2: Cartão — editar e arquivar

**Files:**
- Modify: `src/dados/cartoes.ts`
- Modify: `src/dados/cartoes.test.ts`
- Modify: `src/app/(app)/ajustes/acoes.ts`
- Modify: `src/app/(app)/ajustes/lista-cartoes.tsx`
- Modify: `src/app/(app)/ajustes/page.tsx`
- Create: `src/app/(app)/ajustes/botao-editar-cartao.tsx`
- Create: `src/app/(app)/ajustes/botao-excluir-cartao.tsx`

**Interfaces:**
- Consumes: `.dialogoCampos`, `.botaoTexto`, `.dialogo`, `.dialogoAviso`,
  `.dialogoBotoes`, `.botaoCancelar`, `.botaoConfirmarExclusao`, `.botao`, `.campo`,
  `.rotulo`, `.entrada` — todas já existentes em `ajustes.module.css` desde antes ou
  desde a Task 1. Nenhuma classe nova nesta tarefa.
- Produces: `editarCartao(id: string, dados: { nome: string; diaFechamento: number; diaVencimento: number }, cliente?: ClientePrisma): Promise<void>`;
  `arquivarCartao(id: string, cliente?: ClientePrisma): Promise<void>` — ambas em
  `src/dados/cartoes.ts`.

- [ ] **Step 1: Adicionar `editarCartao` e `arquivarCartao` em `src/dados/cartoes.ts`**

Logo depois de `criarCartao` (antes de `regraDoCartao`), adicione:

```ts
export async function editarCartao(
  id: string,
  dados: { nome: string; diaFechamento: number; diaVencimento: number },
  cliente: ClientePrisma = prisma,
): Promise<void> {
  const nome = dados.nome.trim();
  if (nome.length === 0) {
    throw new Error('Nome do cartão não pode ser vazio');
  }
  validarDia('Dia de fechamento', dados.diaFechamento);
  validarDia('Dia de vencimento', dados.diaVencimento);

  await cliente.card.update({
    where: { id },
    data: {
      nome,
      diaFechamento: dados.diaFechamento,
      diaVencimento: dados.diaVencimento,
    },
  });
}

export async function arquivarCartao(
  id: string,
  cliente: ClientePrisma = prisma,
): Promise<void> {
  await cliente.card.update({
    where: { id },
    data: { ativo: false },
  });
}
```

- [ ] **Step 2: Escrever os testes em `src/dados/cartoes.test.ts`**

No `import { ... } from './cartoes'` do topo, adicione `editarCartao` e
`arquivarCartao`. Depois, logo após o bloco `describe('criarCartao', ...)`,
adicione:

```ts
describe('editarCartao', () => {
  it('atualiza nome e dias, refletidos na busca', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarCartao(
        { nome: 'Nubank', diaFechamento: 25, diaVencimento: 5 },
        tx,
      );
      await editarCartao(
        id,
        { nome: 'Nubank Ultravioleta', diaFechamento: 20, diaVencimento: 27 },
        tx,
      );
      const cartao = await buscarCartao(id, tx);
      expect(cartao).toEqual({
        id,
        nome: 'Nubank Ultravioleta',
        diaFechamento: 20,
        diaVencimento: 27,
        ativo: true,
      });
    });
  });

  it('rejeita dias fora de 1..31', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarCartao(
        { nome: 'Nubank', diaFechamento: 25, diaVencimento: 5 },
        tx,
      );
      await expect(
        editarCartao(id, { nome: 'Nubank', diaFechamento: 0, diaVencimento: 5 }, tx),
      ).rejects.toThrow();
    });
  });

  it('rejeita nome vazio', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarCartao(
        { nome: 'Nubank', diaFechamento: 25, diaVencimento: 5 },
        tx,
      );
      await expect(
        editarCartao(id, { nome: '  ', diaFechamento: 25, diaVencimento: 5 }, tx),
      ).rejects.toThrow();
    });
  });
});

describe('arquivarCartao', () => {
  it('some da listagem depois de arquivado', async () => {
    await comRollback(async (tx) => {
      const { id } = await criarCartao(
        { nome: 'Cartão Temporário', diaFechamento: 10, diaVencimento: 20 },
        tx,
      );
      await arquivarCartao(id, tx);
      const lista = await listarCartoes(tx);
      expect(lista.find((c) => c.id === id)).toBeUndefined();
    });
  });
});
```

- [ ] **Step 3: Rodar os testes novos**

Run: `npx vitest run src/dados/cartoes.test.ts`
Expected: todos passam, incluindo os 4 novos.

- [ ] **Step 4: Adicionar as Server Actions em `src/app/(app)/ajustes/acoes.ts`**

No `import { ... } from '@/dados/cartoes'` do topo, adicione `editarCartao` e
`arquivarCartao`. Depois, logo após `acaoCriarCartao`, adicione:

```ts
export async function acaoEditarCartao(dadosForm: FormData): Promise<void> {
  await editarCartao(String(dadosForm.get('id') ?? ''), {
    nome: String(dadosForm.get('nome') ?? ''),
    diaFechamento: Number(dadosForm.get('diaFechamento')),
    diaVencimento: Number(dadosForm.get('diaVencimento')),
  });
  revalidatePath('/ajustes');
}

export async function acaoArquivarCartao(dadosForm: FormData): Promise<void> {
  await arquivarCartao(String(dadosForm.get('id') ?? ''));
  revalidatePath('/ajustes');
  // O cartão some do seletor de cartão em Despesa Fixa (mesma tela) e do
  // seletor de método de pagamento em Lançamentos.
  revalidatePath('/lancamentos/novo');
}
```

- [ ] **Step 5: Criar `src/app/(app)/ajustes/botao-editar-cartao.tsx`**

```tsx
'use client';

import { useRef } from 'react';

import type { Cartao } from '@/dados/cartoes';

import estilos from './ajustes.module.css';

export function BotaoEditarCartao({
  cartao,
  acao,
}: {
  cartao: Cartao;
  acao: (dadosForm: FormData) => Promise<void>;
}) {
  const dialogoRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className={estilos.botaoTexto}
        onClick={() => dialogoRef.current?.showModal()}
      >
        editar
      </button>
      <dialog ref={dialogoRef} className={estilos.dialogo}>
        <p>Editar cartão</p>
        <form action={acao} className={estilos.dialogoCampos}>
          <input type="hidden" name="id" value={cartao.id} />
          <div className={estilos.campo}>
            <label className={estilos.rotulo} htmlFor={`cartao-editar-nome-${cartao.id}`}>
              Nome
            </label>
            <input
              id={`cartao-editar-nome-${cartao.id}`}
              name="nome"
              required
              defaultValue={cartao.nome}
              className={estilos.entrada}
            />
          </div>
          <div className={estilos.campo}>
            <label
              className={estilos.rotulo}
              htmlFor={`cartao-editar-fecha-${cartao.id}`}
            >
              Fecha dia
            </label>
            <input
              id={`cartao-editar-fecha-${cartao.id}`}
              name="diaFechamento"
              type="number"
              min={1}
              max={31}
              required
              defaultValue={cartao.diaFechamento}
              className={estilos.entrada}
            />
          </div>
          <div className={estilos.campo}>
            <label
              className={estilos.rotulo}
              htmlFor={`cartao-editar-vence-${cartao.id}`}
            >
              Vence dia
            </label>
            <input
              id={`cartao-editar-vence-${cartao.id}`}
              name="diaVencimento"
              type="number"
              min={1}
              max={31}
              required
              defaultValue={cartao.diaVencimento}
              className={estilos.entrada}
            />
          </div>
          <div className={estilos.dialogoBotoes}>
            <button
              type="button"
              className={estilos.botaoCancelar}
              onClick={() => dialogoRef.current?.close()}
            >
              Cancelar
            </button>
            <button type="submit" className={estilos.botao}>
              Salvar
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
```

- [ ] **Step 6: Criar `src/app/(app)/ajustes/botao-excluir-cartao.tsx`**

```tsx
'use client';

import { useRef } from 'react';

import estilos from './ajustes.module.css';

export function BotaoExcluirCartao({
  cartaoId,
  cartaoNome,
  acao,
}: {
  cartaoId: string;
  cartaoNome: string;
  acao: (dadosForm: FormData) => Promise<void>;
}) {
  const dialogoRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className={estilos.botaoTexto}
        onClick={() => dialogoRef.current?.showModal()}
      >
        excluir
      </button>
      <dialog ref={dialogoRef} className={estilos.dialogo}>
        <p>
          Excluir <strong>{cartaoNome}</strong>?
        </p>
        <p className={estilos.dialogoAviso}>
          Isso arquiva o cartão: ele some de novas escolhas (novos lançamentos,
          novas despesas fixas), mas nenhuma fatura, lançamento ou histórico já
          existente é apagado ou muda de valor.
        </p>
        <form action={acao} className={estilos.dialogoBotoes}>
          <input type="hidden" name="id" value={cartaoId} />
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

- [ ] **Step 7: Atualizar `lista-cartoes.tsx` para receber e usar as novas ações**

Troque o import:

```tsx
import { BotaoEditarCartao } from './botao-editar-cartao';
import { BotaoExcluirCartao } from './botao-excluir-cartao';
```

Troque a assinatura:

```tsx
export function ListaCartoes({
  cartoesIniciais,
  acao,
  acaoEditar,
  acaoExcluir,
}: {
  cartoesIniciais: Cartao[];
  acao: (dadosForm: FormData) => Promise<void>;
  acaoEditar: (dadosForm: FormData) => Promise<void>;
  acaoExcluir: (dadosForm: FormData) => Promise<void>;
}) {
```

Troque o `.item` da lista de:

```tsx
<div key={c.id} className={estilos.item}>
  <strong>{c.nome}</strong>
  <span className={estilos.subs}>
    fecha dia {c.diaFechamento} · vence dia {c.diaVencimento}
  </span>
</div>
```

para:

```tsx
<div key={c.id} className={estilos.item}>
  <strong>{c.nome}</strong>
  <span className={estilos.subs}>
    fecha dia {c.diaFechamento} · vence dia {c.diaVencimento}
  </span>
  <BotaoEditarCartao cartao={c} acao={acaoEditar} />
  <BotaoExcluirCartao cartaoId={c.id} cartaoNome={c.nome} acao={acaoExcluir} />
</div>
```

- [ ] **Step 8: Passar as novas ações em `src/app/(app)/ajustes/page.tsx`**

No `import { ... } from './acoes'`, adicione `acaoEditarCartao` e
`acaoArquivarCartao`. No JSX:

```tsx
<ListaCartoes
  cartoesIniciais={cartoes}
  acao={acaoCriarCartao}
  acaoEditar={acaoEditarCartao}
  acaoExcluir={acaoArquivarCartao}
/>
```

- [ ] **Step 9: Rodar a suíte completa**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`
Expected: os quatro comandos limpos.

- [ ] **Step 10: Commit**

```bash
git add src/dados/cartoes.ts src/dados/cartoes.test.ts \
  "src/app/(app)/ajustes/acoes.ts" "src/app/(app)/ajustes/lista-cartoes.tsx" \
  "src/app/(app)/ajustes/page.tsx" "src/app/(app)/ajustes/botao-editar-cartao.tsx" \
  "src/app/(app)/ajustes/botao-excluir-cartao.tsx"
git commit -m "feat(cartao): adiciona editar e arquivar"
```

---

## Task 3: Despesa Fixa — editar

**Files:**
- Modify: `src/dados/recorrentes.ts`
- Modify: `src/dados/recorrentes.test.ts`
- Modify: `src/app/(app)/ajustes/acoes.ts`
- Modify: `src/app/(app)/ajustes/lista-recorrentes.tsx`
- Modify: `src/app/(app)/ajustes/page.tsx`
- Create: `src/app/(app)/ajustes/botao-editar-recorrencia.tsx`

**Interfaces:**
- Consumes: `.dialogoCampos`, `.botaoTexto`, `.dialogo`, `.dialogoBotoes`,
  `.botaoCancelar`, `.botao`, `.campo`, `.rotulo`, `.entrada` (todas já existentes
  desde antes ou desde a Task 1). Nenhuma classe CSS nova nesta tarefa.
- Consumes: `buscarSubcategoria` de `@/dados/categorias` (já existe, usada por
  `acaoCriarRecorrencia`).
- Produces: `RecorrenciaListada` ganha um campo novo, `subcategoryId: string`
  (obrigatório, não opcional — toda linha do banco já tem essa FK preenchida, não
  há dado legado sem ela). `editarRecorrencia(id: string, dados: EdicaoRecorrencia, cliente?: ClientePrisma): Promise<void>`,
  onde `EdicaoRecorrencia` é `{ descricao: string; valorCentavos: number; diaDoMes: number; budgetCategoryId: string; subcategoryId: string; metodo: MetodoPagamento; cardId: string | null }`
  — ambos em `src/dados/recorrentes.ts`.

- [ ] **Step 1: Adicionar `subcategoryId` a `RecorrenciaListada` e à consulta de `listarRecorrentes`**

Troque a interface:

```ts
export interface RecorrenciaListada {
  id: string;
  descricao: string;
  valorCentavos: number;
  diaDoMes: number;
  budgetCategoryId: string;
  subcategoryId: string;
  metodo: MetodoPagamento;
  cardId: string | null;
  cartaoNome: string | null;
  categoriaNome: string;
  subcategoriaNome: string;
  inicio: Competencia;
  fim: Competencia | null;
  ativa: boolean;
}
```

(`budgetCategoryId` também entra, pelo mesmo motivo — o diálogo de edição precisa
enviá-lo de volta junto com `subcategoryId`, exatamente como o formulário de criação
já deriva os dois a partir da escolha de subcategoria.)

No `select` de `listarRecorrentes`, adicione `budgetCategoryId: true` e
`subcategoryId: true` (ambos escalares diretos, sem precisar de include extra):

```ts
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
      budgetCategory: { select: { nome: true } },
      subcategory: { select: { nome: true } },
      card: { select: { nome: true } },
    },
```

E no `.map(...)` que monta o retorno, adicione os dois campos:

```ts
  return linhas.map((r) => ({
    id: r.id,
    descricao: r.descricao,
    valorCentavos: r.valorCentavos,
    diaDoMes: r.diaDoMes,
    budgetCategoryId: r.budgetCategoryId,
    subcategoryId: r.subcategoryId,
    metodo: r.metodo,
    cardId: r.cardId,
    cartaoNome: r.card?.nome ?? null,
    categoriaNome: r.budgetCategory.nome,
    subcategoriaNome: r.subcategory.nome,
    inicio: r.inicio,
    fim: r.fim,
    ativa: r.ativa,
  }));
```

- [ ] **Step 2: Adicionar `editarRecorrencia` em `src/dados/recorrentes.ts`**

Logo depois de `criarRecorrencia` (antes de `listarRecorrentes`), adicione:

```ts
export interface EdicaoRecorrencia {
  descricao: string;
  valorCentavos: number;
  diaDoMes: number;
  budgetCategoryId: string;
  subcategoryId: string;
  metodo: MetodoPagamento;
  cardId: string | null;
}

export async function editarRecorrencia(
  id: string,
  dados: EdicaoRecorrencia,
  cliente: ClientePrisma = prisma,
): Promise<void> {
  const descricao = dados.descricao.trim();
  if (descricao.length === 0) {
    throw new Error('Descrição não pode ser vazia');
  }
  if (!Number.isInteger(dados.valorCentavos) || dados.valorCentavos <= 0) {
    throw new Error(
      `Valor deve ser inteiro positivo em centavos: ${dados.valorCentavos}`,
    );
  }
  if (!Number.isInteger(dados.diaDoMes) || dados.diaDoMes < 1 || dados.diaDoMes > 31) {
    throw new Error(`Dia do mês deve ser inteiro entre 1 e 31: ${dados.diaDoMes}`);
  }

  const subcategoria = await cliente.subcategory.findUnique({
    where: { id: dados.subcategoryId },
    select: { budgetCategoryId: true },
  });
  if (!subcategoria) {
    throw new Error(`Subcategoria não encontrada: ${dados.subcategoryId}`);
  }
  if (subcategoria.budgetCategoryId !== dados.budgetCategoryId) {
    throw new Error(
      'A subcategoria informada pertence a outro orçamento — a hierarquia é estrita',
    );
  }

  if (dados.metodo === 'CREDITO') {
    if (!dados.cardId) {
      throw new Error('Despesa fixa no crédito exige um cartão');
    }
    const cartao = await buscarCartao(dados.cardId, cliente);
    if (!cartao) {
      throw new Error(`Cartão não encontrado: ${dados.cardId}`);
    }
  }

  await cliente.recurringExpense.update({
    where: { id },
    data: {
      descricao,
      valorCentavos: dados.valorCentavos,
      diaDoMes: dados.diaDoMes,
      budgetCategoryId: dados.budgetCategoryId,
      subcategoryId: dados.subcategoryId,
      metodo: dados.metodo,
      cardId: dados.metodo === 'CREDITO' ? dados.cardId : null,
    },
  });
}
```

- [ ] **Step 3: Escrever os testes em `src/dados/recorrentes.test.ts`**

No `import { ... } from './recorrentes'` do topo, adicione `editarRecorrencia`.
Depois, logo após o bloco `describe('criarRecorrencia', ...)`, adicione:

```ts
describe('editarRecorrencia', () => {
  it('atualiza os campos e reflete na listagem', async () => {
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

      await editarRecorrencia(
        id,
        {
          descricao: 'Streaming Y',
          valorCentavos: 3990,
          diaDoMes: 15,
          budgetCategoryId: categoria.id,
          subcategoryId: sub.id,
          metodo: 'PIX',
          cardId: null,
        },
        tx,
      );

      const lista = await listarRecorrentes(tx);
      const r = lista.find((x) => x.id === id)!;
      expect(r.descricao).toBe('Streaming Y');
      expect(r.valorCentavos).toBe(3990);
      expect(r.diaDoMes).toBe(15);
    });
  });

  it('rejeita descrição vazia', async () => {
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
      await expect(
        editarRecorrencia(
          id,
          {
            descricao: '  ',
            valorCentavos: 2990,
            diaDoMes: 10,
            budgetCategoryId: categoria.id,
            subcategoryId: sub.id,
            metodo: 'PIX',
            cardId: null,
          },
          tx,
        ),
      ).rejects.toThrow();
    });
  });

  it('rejeita subcategoria de outro orçamento', async () => {
    await comRollback(async (tx) => {
      const { categoria, sub } = await cenario(tx);
      const outraCategoria = await criarCategoria({ nome: 'Lazer', corSlot: 5 }, tx);
      const outraSub = await criarSubcategoria(
        { budgetCategoryId: outraCategoria.id, nome: 'Cinema' },
        tx,
      );
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
      await expect(
        editarRecorrencia(
          id,
          {
            descricao: 'Streaming X',
            valorCentavos: 2990,
            diaDoMes: 10,
            budgetCategoryId: categoria.id,
            subcategoryId: outraSub.id,
            metodo: 'PIX',
            cardId: null,
          },
          tx,
        ),
      ).rejects.toThrow();
    });
  });

  it('exige cartão quando o método é crédito', async () => {
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
      await expect(
        editarRecorrencia(
          id,
          {
            descricao: 'Streaming X',
            valorCentavos: 2990,
            diaDoMes: 10,
            budgetCategoryId: categoria.id,
            subcategoryId: sub.id,
            metodo: 'CREDITO',
            cardId: null,
          },
          tx,
        ),
      ).rejects.toThrow();
    });
  });
});
```

- [ ] **Step 4: Rodar os testes novos**

Run: `npx vitest run src/dados/recorrentes.test.ts`
Expected: todos passam, incluindo os 4 novos.

- [ ] **Step 5: Adicionar a Server Action em `src/app/(app)/ajustes/acoes.ts`**

No `import { ... } from '@/dados/recorrentes'` do topo, adicione `editarRecorrencia`.
Depois, logo após `acaoCriarRecorrencia`, adicione:

```ts
export async function acaoEditarRecorrencia(dadosForm: FormData): Promise<void> {
  const metodo = String(dadosForm.get('metodo') ?? 'PIX') as MetodoPagamento;
  const cardIdBruto = String(dadosForm.get('cardId') ?? '');
  const subcategoryId = String(dadosForm.get('subcategoryId') ?? '');

  const subcategoria = await buscarSubcategoria(subcategoryId);
  if (!subcategoria) {
    throw new Error(`Subcategoria não encontrada: ${subcategoryId}`);
  }

  await editarRecorrencia(String(dadosForm.get('id') ?? ''), {
    descricao: String(dadosForm.get('descricao') ?? ''),
    valorCentavos: emCentavos(Number(dadosForm.get('valor') ?? 0)),
    diaDoMes: Number(dadosForm.get('diaDoMes')),
    budgetCategoryId: subcategoria.budgetCategoryId,
    subcategoryId,
    metodo,
    cardId: metodo === 'CREDITO' && cardIdBruto ? cardIdBruto : null,
  });
  revalidatePath('/ajustes');
}
```

- [ ] **Step 6: Criar `src/app/(app)/ajustes/botao-editar-recorrencia.tsx`**

```tsx
'use client';

import { useRef } from 'react';

import type { Cartao } from '@/dados/cartoes';
import type { CategoriaComSubs } from '@/dados/categorias';
import type { RecorrenciaListada } from '@/dados/recorrentes';

import estilos from './ajustes.module.css';

export function BotaoEditarRecorrencia({
  recorrencia,
  categorias,
  cartoes,
  acao,
}: {
  recorrencia: RecorrenciaListada;
  categorias: CategoriaComSubs[];
  cartoes: Cartao[];
  acao: (dadosForm: FormData) => Promise<void>;
}) {
  const dialogoRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className={estilos.botaoTexto}
        onClick={() => dialogoRef.current?.showModal()}
      >
        editar
      </button>
      <dialog ref={dialogoRef} className={estilos.dialogo}>
        <p>Editar despesa fixa</p>
        <form action={acao} className={estilos.dialogoCampos}>
          <input type="hidden" name="id" value={recorrencia.id} />
          <div className={estilos.campo}>
            <label
              className={estilos.rotulo}
              htmlFor={`rec-editar-descricao-${recorrencia.id}`}
            >
              Descrição
            </label>
            <input
              id={`rec-editar-descricao-${recorrencia.id}`}
              name="descricao"
              required
              defaultValue={recorrencia.descricao}
              className={estilos.entrada}
            />
          </div>
          <div className={estilos.campo}>
            <label
              className={estilos.rotulo}
              htmlFor={`rec-editar-valor-${recorrencia.id}`}
            >
              Valor
            </label>
            <input
              id={`rec-editar-valor-${recorrencia.id}`}
              name="valor"
              type="number"
              step="0.01"
              min="0.01"
              required
              defaultValue={(recorrencia.valorCentavos / 100).toFixed(2)}
              className={estilos.entrada}
            />
          </div>
          <div className={estilos.campo}>
            <label
              className={estilos.rotulo}
              htmlFor={`rec-editar-dia-${recorrencia.id}`}
            >
              Dia do mês
            </label>
            <input
              id={`rec-editar-dia-${recorrencia.id}`}
              name="diaDoMes"
              type="number"
              min={1}
              max={31}
              required
              defaultValue={recorrencia.diaDoMes}
              className={estilos.entrada}
            />
          </div>
          <div className={estilos.campo}>
            <label
              className={estilos.rotulo}
              htmlFor={`rec-editar-sub-${recorrencia.id}`}
            >
              Subcategoria
            </label>
            <select
              id={`rec-editar-sub-${recorrencia.id}`}
              name="subcategoryId"
              defaultValue={recorrencia.subcategoryId}
              className={estilos.entrada}
            >
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
            <label
              className={estilos.rotulo}
              htmlFor={`rec-editar-metodo-${recorrencia.id}`}
            >
              Método
            </label>
            <select
              id={`rec-editar-metodo-${recorrencia.id}`}
              name="metodo"
              defaultValue={recorrencia.metodo}
              className={estilos.entrada}
            >
              <option value="PIX">Pix</option>
              <option value="DEBITO">Débito</option>
              <option value="DINHEIRO">Dinheiro</option>
              <option value="BOLETO">Boleto</option>
              <option value="CREDITO">Crédito</option>
            </select>
          </div>
          <div className={estilos.campo}>
            <label
              className={estilos.rotulo}
              htmlFor={`rec-editar-cartao-${recorrencia.id}`}
            >
              Cartão (se crédito)
            </label>
            <select
              id={`rec-editar-cartao-${recorrencia.id}`}
              name="cardId"
              defaultValue={recorrencia.cardId ?? ''}
              className={estilos.entrada}
            >
              <option value="">—</option>
              {cartoes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div className={estilos.dialogoBotoes}>
            <button
              type="button"
              className={estilos.botaoCancelar}
              onClick={() => dialogoRef.current?.close()}
            >
              Cancelar
            </button>
            <button type="submit" className={estilos.botao}>
              Salvar
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
```

- [ ] **Step 7: Atualizar `lista-recorrentes.tsx`**

Troque o import:

```tsx
import { BotaoEditarRecorrencia } from './botao-editar-recorrencia';
```

Troque a assinatura para receber a nova ação:

```tsx
export function ListaRecorrentes({
  recorrentesIniciais,
  categorias,
  cartoes,
  acaoCriar,
  acaoEditar,
  acaoAlternar,
  acaoEncerrar,
}: {
  recorrentesIniciais: RecorrenciaListada[];
  categorias: CategoriaComSubs[];
  cartoes: Cartao[];
  acaoCriar: (dadosForm: FormData) => Promise<void>;
  acaoEditar: (dadosForm: FormData) => Promise<void>;
  acaoAlternar: (dadosForm: FormData) => Promise<void>;
  acaoEncerrar: (dadosForm: FormData) => Promise<void>;
}) {
```

No corpo de `enviar` (a função que monta o item otimista), o objeto passado para
`adicionarOtimista` precisa incluir os dois campos novos da interface — troque:

```ts
    adicionarOtimista({
      id: `otimista-${Date.now()}`,
      descricao: String(dadosForm.get('descricao') ?? ''),
      valorCentavos: emCentavos(Number(dadosForm.get('valor') ?? 0)),
      diaDoMes: Number(dadosForm.get('diaDoMes')),
      metodo,
      cardId,
      cartaoNome,
      categoriaNome,
      subcategoriaNome,
      inicio: String(dadosForm.get('inicio') ?? ''),
      fim: null,
      ativa: true,
    });
```

por (adicionando `budgetCategoryId` e `subcategoryId` — o `budgetCategoryId` vem do
mesmo laço que já procura `categoriaNome`/`subcategoriaNome`, guardando o id da
categoria encontrada):

```ts
    let budgetCategoryId = '';
    let categoriaNome = '';
    let subcategoriaNome = '';
    for (const c of categorias) {
      const sub = c.subcategorias.find((s) => s.id === subcategoryId);
      if (sub) {
        budgetCategoryId = c.id;
        categoriaNome = c.nome;
        subcategoriaNome = sub.nome;
        break;
      }
    }
    const cardId = metodo === 'CREDITO' && cardIdBruto ? cardIdBruto : null;
    const cartaoNome = cardId ? (cartoes.find((c) => c.id === cardId)?.nome ?? null) : null;

    adicionarOtimista({
      id: `otimista-${Date.now()}`,
      descricao: String(dadosForm.get('descricao') ?? ''),
      valorCentavos: emCentavos(Number(dadosForm.get('valor') ?? 0)),
      diaDoMes: Number(dadosForm.get('diaDoMes')),
      budgetCategoryId,
      subcategoryId,
      metodo,
      cardId,
      cartaoNome,
      categoriaNome,
      subcategoriaNome,
      inicio: String(dadosForm.get('inicio') ?? ''),
      fim: null,
      ativa: true,
    });
```

(O laço `for` substitui o que já existia — a única mudança é que ele agora também
guarda `c.id` em `budgetCategoryId` quando encontra a subcategoria certa. As linhas de
`cardId`/`cartaoNome` continuam na mesma posição relativa que já tinham — logo depois
do laço, antes do `adicionarOtimista` — nada foi reordenado.)

No JSX, dentro de `.recorrenciaControles`, adicione o botão de editar antes do
`pausar`/`retomar`:

```tsx
<div className={estilos.recorrenciaControles}>
  <BotaoEditarRecorrencia
    recorrencia={r}
    categorias={categorias}
    cartoes={cartoes}
    acao={acaoEditar}
  />
  <form action={acaoAlternar}>
    ...
```

(O `<form action={acaoAlternar}>` e o `<form action={acaoEncerrar}>` que já existem
depois continuam exatamente iguais — só o `<BotaoEditarRecorrencia>` novo entra antes
deles dentro da mesma `<div className={estilos.recorrenciaControles}>`.)

- [ ] **Step 8: Passar a nova ação em `src/app/(app)/ajustes/page.tsx`**

No `import { ... } from './acoes'`, adicione `acaoEditarRecorrencia`. No JSX:

```tsx
<ListaRecorrentes
  recorrentesIniciais={recorrentes}
  categorias={categorias}
  cartoes={cartoes}
  acaoCriar={acaoCriarRecorrencia}
  acaoEditar={acaoEditarRecorrencia}
  acaoAlternar={acaoAlternarRecorrencia}
  acaoEncerrar={acaoEncerrarRecorrencia}
/>
```

- [ ] **Step 9: Rodar a suíte completa**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`
Expected: os quatro comandos limpos. Preste atenção especial ao `tsc`: o campo novo
`subcategoryId` em `RecorrenciaListada` é obrigatório, não opcional — qualquer outro
lugar do código que constrói um objeto desse tipo sem esse campo aparece aqui como
erro de tipo.

- [ ] **Step 10: Commit**

```bash
git add src/dados/recorrentes.ts src/dados/recorrentes.test.ts \
  "src/app/(app)/ajustes/acoes.ts" "src/app/(app)/ajustes/lista-recorrentes.tsx" \
  "src/app/(app)/ajustes/page.tsx" \
  "src/app/(app)/ajustes/botao-editar-recorrencia.tsx"
git commit -m "feat(despesa-fixa): adiciona editar"
```

---

## Ao terminar

Antes de considerar este sub-projeto pronto, confirme no navegador com sessão real:

- [ ] `npx vitest run` passa inteiro, `npx tsc --noEmit`, `npm run lint` e
      `npm run build` limpos
- [ ] Em **Ajustes**, cada subcategoria mostra "editar" e "excluir" ao lado do nome;
      editar abre o diálogo com o nome atual preenchido, salvar reflete na tela;
      excluir avisa que arquiva (não apaga) e some da lista após confirmar
- [ ] Uma subcategoria arquivada não aparece mais no seletor de subcategoria da
      Despesa Fixa, nem no seletor de Lançamentos
- [ ] Cada cartão mostra "editar" e "excluir"; editar dia de fechamento/vencimento
      de um cartão com fatura já emitida não muda a fatura antiga (confira o valor
      da fatura antes e depois de editar)
- [ ] Um cartão arquivado não aparece mais no seletor de cartão da Despesa Fixa
- [ ] Cada despesa fixa mostra "editar" ao lado de pausar/encerrar; editar abre o
      diálogo com todos os 6 campos preenchidos com os valores atuais (incluindo a
      subcategoria certa já selecionada); salvar reflete na lista
- [ ] Trocar o método de uma despesa fixa de PIX para Crédito sem escolher cartão
      mostra o erro esperado (mesma mensagem da criação)

**Este é o segundo sub-projeto da revisão maior do produto** (o primeiro foi o
sistema de tokens/dark-mode). Reorganização de arquitetura de informação e
maturidade visual ficam para depois, cada um com seu próprio ciclo de brainstorm →
spec → plano.
