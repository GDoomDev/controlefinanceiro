# Reorganização de Arquitetura de Informação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover a criação/edição/exclusão de Orçamento, Subcategoria, Cartão e
Despesa Fixa da tela de Ajustes para as telas onde essas entidades já são
exibidas (Orçamentos, Cartões, Lançamentos), e remover Ajustes por completo.

**Architecture:** Cada entidade migra fisicamente de `src/app/(app)/ajustes/`
para o diretório da tela de destino — mesmo conteúdo de código, só o lugar
muda. Nenhuma função em `src/dados/`/`src/dominio/` muda. As três migrações
(Orçamento+Subcategoria, Cartão, Despesa Fixa) acontecem primeiro, cada uma
deixando o app inteiro funcionando e testável; só depois das três é que o
diretório `ajustes/` (já vazio) e o destino "Ajustes" da navegação são
removidos.

**Tech Stack:** Next.js App Router (Server Components + Server Actions),
CSS Modules — nenhuma dependência nova.

## Global Constraints

- **Nenhuma mudança em `src/dados/` ou `src/dominio/`** — só a camada
  `app/` se move. Nenhum teste em `src/dados/*.test.ts` é tocado em nenhuma
  tarefa deste plano.
- **Nenhuma mudança de campo, validação ou comportamento** em nenhuma das
  quatro entidades — mesmos formulários, mesmos diálogos, mesmo texto de
  aviso de exclusão.
- **Regra de `revalidatePath` ao mover uma Server Action:** tire `/ajustes`
  da lista (a rota deixa de existir) e garanta que o novo caminho de destino
  da entidade está na lista (adicione se não estiver) — todo o resto da
  lista continua igual. Esta é a única mudança de comportamento permitida
  neste plano, e é consequência direta da mudança de local, não uma decisão
  de negócio nova.
- **CSS copiado, nunca compartilhado entre telas** — cada entidade migrada
  ganha um arquivo `gestao.module.css` novo no diretório de destino (mesmo
  conteúdo hoje em `ajustes.module.css`, só as classes que aquela entidade
  usa), em vez de mesclar no `.module.css` que a tela de destino já tem.
  Isso evita colisão de nome de classe com finalidade diferente (ex.:
  `orcamentos.module.css` já tem `.lista`/`.linha`/`.cor`/`.entrada`/`.botao`/
  `.vazio` para a exibição de alocação mensal — são coisas diferentes das
  classes de mesmo nome usadas pelo formulário de criar orçamento).
- **Componentes de diálogo continuam por tela, não compartilhados** — cada
  entidade migrada leva consigo sua própria cópia dos componentes
  `botao-editar-*`/`botao-excluir-*`/`lista-*`, sem introduzir um módulo
  compartilhado novo.
- Toda tarefa termina com `npx tsc --noEmit && npx vitest run && npm run lint
  && npm run build` limpos.

---

## Task 1: Orçamento e Subcategoria — Ajustes → Orçamentos

**Files:**
- Create: `src/app/(app)/orcamentos/gestao.module.css`
- Create: `src/app/(app)/orcamentos/lista-categorias.tsx`
- Create: `src/app/(app)/orcamentos/seletor-de-cor.tsx`
- Create: `src/app/(app)/orcamentos/botao-excluir-categoria.tsx`
- Create: `src/app/(app)/orcamentos/botao-editar-subcategoria.tsx`
- Create: `src/app/(app)/orcamentos/botao-excluir-subcategoria.tsx`
- Modify: `src/app/(app)/orcamentos/acoes.ts`
- Modify: `src/app/(app)/orcamentos/page.tsx`
- Modify: `src/app/(app)/ajustes/acoes.ts`
- Modify: `src/app/(app)/ajustes/page.tsx`
- Modify: `src/app/(app)/lancamentos/novo/page.tsx`
- Delete: `src/app/(app)/ajustes/lista-categorias.tsx`
- Delete: `src/app/(app)/ajustes/seletor-de-cor.tsx`
- Delete: `src/app/(app)/ajustes/botao-excluir-categoria.tsx`
- Delete: `src/app/(app)/ajustes/botao-editar-subcategoria.tsx`
- Delete: `src/app/(app)/ajustes/botao-excluir-subcategoria.tsx`

**Interfaces:**
- Produces: `ListaCategorias` agora mora em `@/app/(app)/orcamentos/lista-categorias`
  (mesma assinatura de props de hoje). A tela `/orcamentos` passa a exportar
  as ações `acaoCriarCategoria`, `acaoExcluirCategoria`, `acaoCriarSubcategoria`,
  `acaoEditarSubcategoria`, `acaoArquivarSubcategoria` do seu próprio `acoes.ts`.

- [ ] **Step 1: Criar `src/app/(app)/orcamentos/gestao.module.css`**

Copie o conteúdo INTEIRO de `src/app/(app)/ajustes/ajustes.module.css` para
este arquivo novo, sem nenhuma mudança de conteúdo (é uma cópia byte a byte
do arquivo hoje existente).

- [ ] **Step 2: Criar os 5 componentes migrados**

Para cada um dos 5 arquivos abaixo: copie o conteúdo INTEIRO do arquivo
`ajustes/<nome>` de hoje para o caminho novo em `orcamentos/<nome>`, trocando
apenas a linha de import do CSS de `import estilos from './ajustes.module.css';`
para `import estilos from './gestao.module.css';`. Nenhuma outra linha muda.

- `src/app/(app)/orcamentos/lista-categorias.tsx` (de `ajustes/lista-categorias.tsx`)
- `src/app/(app)/orcamentos/seletor-de-cor.tsx` (de `ajustes/seletor-de-cor.tsx`)
- `src/app/(app)/orcamentos/botao-excluir-categoria.tsx` (de `ajustes/botao-excluir-categoria.tsx`)
- `src/app/(app)/orcamentos/botao-editar-subcategoria.tsx` (de `ajustes/botao-editar-subcategoria.tsx`)
- `src/app/(app)/orcamentos/botao-excluir-subcategoria.tsx` (de `ajustes/botao-excluir-subcategoria.tsx`)

`lista-categorias.tsx` importa `SeletorDeCor`/`SlotOcupadoProp` de
`'./seletor-de-cor'`, `BotaoExcluirCategoria` de `'./botao-excluir-categoria'`,
`BotaoEditarSubcategoria` de `'./botao-editar-subcategoria'`,
`BotaoExcluirSubcategoria` de `'./botao-excluir-subcategoria'` — esses
caminhos relativos continuam corretos sem mudança, já que os 5 arquivos
moveram juntos para o mesmo diretório novo.

- [ ] **Step 3: Adicionar as 5 ações em `src/app/(app)/orcamentos/acoes.ts`**

O arquivo hoje tem só `acaoDefinirAlocacao`/`acaoRemoverAlocacao`. Adicione o
import e as 5 funções abaixo (mesmo corpo de hoje, só a lista de
`revalidatePath` mudou — tirando `/ajustes` e garantindo `/orcamentos` em
cada uma, por Global Constraints):

```ts
import {
  arquivarCategoria,
  arquivarSubcategoria,
  buscarSubcategoria,
  criarCategoria,
  criarSubcategoria,
  editarSubcategoria,
} from '@/dados/categorias';

export async function acaoCriarCategoria(dadosForm: FormData): Promise<void> {
  const corSlotBruto = String(dadosForm.get('corSlot') ?? '');
  const corPersonalizadaBruta = String(dadosForm.get('corPersonalizada') ?? '');

  await criarCategoria({
    nome: String(dadosForm.get('nome') ?? ''),
    corSlot: corSlotBruto ? Number(corSlotBruto) : null,
    corPersonalizada: corPersonalizadaBruta ? corPersonalizadaBruta : null,
  });
  revalidatePath('/orcamentos');
  revalidatePath('/');
  revalidatePath('/areas');
  revalidatePath('/lancamentos/novo');
}

export async function acaoCriarSubcategoria(dadosForm: FormData): Promise<void> {
  await criarSubcategoria({
    budgetCategoryId: String(dadosForm.get('budgetCategoryId') ?? ''),
    nome: String(dadosForm.get('nome') ?? ''),
  });
  revalidatePath('/orcamentos');
}

export async function acaoEditarSubcategoria(dadosForm: FormData): Promise<void> {
  await editarSubcategoria(String(dadosForm.get('id') ?? ''), {
    nome: String(dadosForm.get('nome') ?? ''),
  });
  revalidatePath('/orcamentos');
  revalidatePath('/lancamentos/novo');
}

export async function acaoArquivarSubcategoria(dadosForm: FormData): Promise<void> {
  await arquivarSubcategoria(String(dadosForm.get('id') ?? ''));
  revalidatePath('/orcamentos');
  revalidatePath('/lancamentos/novo');
}

export async function acaoExcluirCategoria(dadosForm: FormData): Promise<void> {
  await arquivarCategoria(String(dadosForm.get('id') ?? ''));
  revalidatePath('/orcamentos');
  revalidatePath('/');
  revalidatePath('/areas');
  revalidatePath('/lancamentos/novo');
}
```

`buscarSubcategoria` é importado aqui mas não usado por nenhuma dessas 5
funções — **não o inclua no import** (ele só era usado por
`acaoCriarRecorrencia`/`acaoEditarRecorrencia`, que vão para Lançamentos na
Task 3, não para cá). Confirme o import acima bate exatamente com o que
está escrito (sem `buscarSubcategoria`).

- [ ] **Step 4: Adicionar a seção de gestão de orçamentos em `src/app/(app)/orcamentos/page.tsx`**

Troque o import do topo de:

```tsx
import { orcamentosDoMes } from '@/dados/orcamentos';
import { competenciaDe, dataCivilEm, somarMeses } from '@/dominio/data';
import { formatarBRL } from '@/dominio/dinheiro';
import { corDaCategoria } from '@/dominio/paleta';

import { acaoDefinirAlocacao, acaoRemoverAlocacao } from './acoes';
import estilos from './orcamentos.module.css';
```

para:

```tsx
import { listarCategorias, slotsEmUso } from '@/dados/categorias';
import { orcamentosDoMes } from '@/dados/orcamentos';
import { competenciaDe, dataCivilEm, somarMeses } from '@/dominio/data';
import { formatarBRL } from '@/dominio/dinheiro';
import { corDaCategoria } from '@/dominio/paleta';

import {
  acaoDefinirAlocacao,
  acaoRemoverAlocacao,
  acaoCriarCategoria,
  acaoExcluirCategoria,
  acaoEditarSubcategoria,
  acaoArquivarSubcategoria,
} from './acoes';
import { ListaCategorias } from './lista-categorias';
import estilos from './orcamentos.module.css';
```

No corpo da função, logo após buscar `orcamentos`/`total`, busque também as
categorias e os slots ocupados (em paralelo com o que já existe):

```tsx
  const [orcamentos, categorias, ocupados] = await Promise.all([
    orcamentosDoMes(competencia),
    listarCategorias(),
    slotsEmUso(),
  ]);
  const total = orcamentos.reduce((a, o) => a + o.valorCentavos, 0);
```

(Isso substitui as duas linhas atuais `const orcamentos = await
orcamentosDoMes(competencia);` e `const total = ...`.)

No JSX, logo depois do `<div className={estilos.cabecalho}>...</div>` e
antes do `<div className={estilos.meses}>`, adicione:

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

Por fim, troque a mensagem de vazio (o `orcamentos.length === 0` de hoje diz
"Nenhum orçamento cadastrado. Crie categorias em Ajustes.", com um link para
`/ajustes` que deixará de existir) por uma mensagem que aponta pro
formulário que acabou de entrar na própria página:

```tsx
      {orcamentos.length === 0 ? (
        <div className={estilos.vazio}>
          Nenhum orçamento cadastrado. Crie um orçamento acima.
        </div>
      ) : (
```

(Remova o `import Link` só se, depois dessa troca, nenhuma outra linha do
arquivo usar `<Link>` — confira antes de remover; o arquivo ainda usa
`<Link>` para a navegação de mês, então o import continua necessário.)

- [ ] **Step 5: Remover a seção de Orçamentos/Subcategorias de `src/app/(app)/ajustes/page.tsx`**

Troque o import do topo de:

```tsx
import { listarCategorias, slotsEmUso } from '@/dados/categorias';
import { listarCartoes } from '@/dados/cartoes';
import { listarRecorrentes } from '@/dados/recorrentes';

import {
  acaoEditarCartao,
  acaoArquivarCartao,
  acaoCriarCartao,
  acaoCriarCategoria,
  acaoCriarSubcategoria,
  acaoCriarRecorrencia,
  acaoEditarRecorrencia,
  acaoEncerrarRecorrencia,
  acaoAlternarRecorrencia,
  acaoExcluirCategoria,
  acaoEditarSubcategoria,
  acaoArquivarSubcategoria,
} from './acoes';
import { ListaCategorias } from './lista-categorias';
import { ListaCartoes } from './lista-cartoes';
import { ListaRecorrentes } from './lista-recorrentes';
import estilos from './ajustes.module.css';
```

para (note que `listarCategorias` continua importado — sem `slotsEmUso`,
que só servia ao catálogo de cor de `ListaCategorias`, agora removido desta
página; `ListaRecorrentes`, que continua nesta página até a Task 3, ainda
precisa de `categorias: CategoriaComSubs[]` como prop):

```tsx
import { listarCategorias } from '@/dados/categorias';
import { listarCartoes } from '@/dados/cartoes';
import { listarRecorrentes } from '@/dados/recorrentes';

import {
  acaoEditarCartao,
  acaoArquivarCartao,
  acaoCriarCartao,
  acaoCriarRecorrencia,
  acaoEditarRecorrencia,
  acaoEncerrarRecorrencia,
  acaoAlternarRecorrencia,
} from './acoes';
import { ListaCartoes } from './lista-cartoes';
import { ListaRecorrentes } from './lista-recorrentes';
import estilos from './ajustes.module.css';
```

No corpo da função, troque:

```tsx
  const [categorias, cartoes, recorrentes, ocupados] = await Promise.all([
    listarCategorias(),
    listarCartoes(),
    listarRecorrentes(),
    slotsEmUso(),
  ]);
```

por:

```tsx
  const [categorias, cartoes, recorrentes] = await Promise.all([
    listarCategorias(),
    listarCartoes(),
    listarRecorrentes(),
  ]);
```

(A única mudança real de fundo neste Step é a saída de `slotsEmUso` — o
resto do `Promise.all` continua igual, `categorias` inclusive, porque
`ListaRecorrentes` ainda depende dela.)

No JSX, apague inteiramente a primeira `<section>` (a que tem
`<div className={estilos.titulo}>Orçamentos</div>` com `<ListaCategorias
.../>` dentro) e a segunda `<section>` (a que tem `<div
className={estilos.titulo}>Subcategorias</div>` com o `<form
action={acaoCriarSubcategoria} ...>` dentro) — as duas seções inteiras,
do `<section className={estilos.secao}>` de abertura até o `</section>` de
fechamento de cada uma. As seções de Cartões e Despesas fixas continuam
exatamente como estão.

- [ ] **Step 6: Remover as 5 ações de `src/app/(app)/ajustes/acoes.ts`**

Apague as funções `acaoCriarCategoria`, `acaoCriarSubcategoria`,
`acaoEditarSubcategoria`, `acaoArquivarSubcategoria`, `acaoExcluirCategoria`
inteiras. No import do topo, remova `arquivarCategoria`, `buscarSubcategoria`,
`criarCategoria`, `criarSubcategoria`, `editarSubcategoria`,
`arquivarSubcategoria` de `@/dados/categorias` — mas **mantenha** o import
de `buscarSubcategoria` se `acaoCriarRecorrencia`/`acaoEditarRecorrencia`
(que continuam neste arquivo até a Task 3) ainda o usarem — confira o
arquivo depois de editar: `buscarSubcategoria` é usado por
`acaoCriarRecorrencia`/`acaoEditarRecorrencia`, então o import continua
necessário, só que a partir de `@/dados/categorias` sozinho (sem os outros
5 nomes desta lista).

- [ ] **Step 7: Apagar os 5 arquivos migrados de `ajustes/`**

```bash
git rm "src/app/(app)/ajustes/lista-categorias.tsx" \
  "src/app/(app)/ajustes/seletor-de-cor.tsx" \
  "src/app/(app)/ajustes/botao-excluir-categoria.tsx" \
  "src/app/(app)/ajustes/botao-editar-subcategoria.tsx" \
  "src/app/(app)/ajustes/botao-excluir-subcategoria.tsx"
```

- [ ] **Step 8: Corrigir a referência a `/ajustes` em `src/app/(app)/lancamentos/novo/page.tsx`**

Esta tela mostra um aviso quando não existe nenhum orçamento cadastrado
ainda, apontando hoje para `/ajustes` (rota que este plano remove por
completo na Task 3). Troque:

```tsx
        <p style={{ fontSize: 14, color: 'var(--cor-texto-secundario)' }}>
          Cadastre pelo menos um orçamento com uma subcategoria em{' '}
          <Link href="/ajustes">Ajustes</Link> antes de lançar uma despesa.
        </p>
```

por:

```tsx
        <p style={{ fontSize: 14, color: 'var(--cor-texto-secundario)' }}>
          Cadastre pelo menos um orçamento com uma subcategoria em{' '}
          <Link href="/orcamentos">Orçamentos</Link> antes de lançar uma despesa.
        </p>
```

- [ ] **Step 9: Rodar a suíte completa**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`
Expected: os quatro comandos limpos. Nenhum teste em `src/dados/` deveria
sequer ser afetado — qualquer falha ali é regressão real.

- [ ] **Step 10: Commit**

```bash
git add "src/app/(app)/orcamentos/" "src/app/(app)/ajustes/acoes.ts" \
  "src/app/(app)/ajustes/page.tsx" \
  "src/app/(app)/lancamentos/novo/page.tsx"
git commit -m "refactor(ia): move gestão de Orçamento e Subcategoria pra tela de Orçamentos"
```

---

## Task 2: Cartão — Ajustes → Cartões

**Files:**
- Create: `src/app/(app)/cartoes/gestao.module.css`
- Create: `src/app/(app)/cartoes/lista-cartoes.tsx`
- Create: `src/app/(app)/cartoes/botao-editar-cartao.tsx`
- Create: `src/app/(app)/cartoes/botao-excluir-cartao.tsx`
- Modify: `src/app/(app)/cartoes/acoes.ts`
- Modify: `src/app/(app)/cartoes/page.tsx`
- Modify: `src/app/(app)/ajustes/acoes.ts`
- Modify: `src/app/(app)/ajustes/page.tsx`
- Delete: `src/app/(app)/ajustes/lista-cartoes.tsx`
- Delete: `src/app/(app)/ajustes/botao-editar-cartao.tsx`
- Delete: `src/app/(app)/ajustes/botao-excluir-cartao.tsx`

**Interfaces:**
- Consumes: nada de Task 1 (entidades independentes).
- Produces: `ListaCartoes` agora mora em `@/app/(app)/cartoes/lista-cartoes`.
  `/cartoes` exporta `acaoCriarCartao`, `acaoEditarCartao`,
  `acaoArquivarCartao` do seu próprio `acoes.ts`, ao lado de
  `acaoFecharFatura`/`acaoPagarFatura` que já existem lá.

- [ ] **Step 1: Criar `src/app/(app)/cartoes/gestao.module.css`**

Igual à Task 1 — copie o conteúdo INTEIRO de
`src/app/(app)/ajustes/ajustes.module.css` (ainda existe neste ponto do
plano, já sem as classes específicas de Orçamento que a Task 1 não apagou —
o arquivo `ajustes.module.css` inteiro continua até a Task 4; só copie tudo
igual à Task 1) para este arquivo novo, sem mudança.

- [ ] **Step 2: Criar os 3 componentes migrados**

Mesma mecânica da Task 1: copie o conteúdo INTEIRO de cada arquivo
`ajustes/<nome>` de hoje, trocando só a linha de import do CSS de
`import estilos from './ajustes.module.css';` para
`import estilos from './gestao.module.css';`.

- `src/app/(app)/cartoes/lista-cartoes.tsx` (de `ajustes/lista-cartoes.tsx`)
- `src/app/(app)/cartoes/botao-editar-cartao.tsx` (de `ajustes/botao-editar-cartao.tsx`)
- `src/app/(app)/cartoes/botao-excluir-cartao.tsx` (de `ajustes/botao-excluir-cartao.tsx`)

Os imports relativos entre esses 3 arquivos (`lista-cartoes.tsx` importa
`BotaoEditarCartao`/`BotaoExcluirCartao` de `'./botao-editar-cartao'`/
`'./botao-excluir-cartao'`) continuam corretos sem mudança.

- [ ] **Step 3: Adicionar as 3 ações em `src/app/(app)/cartoes/acoes.ts`**

O arquivo hoje tem só `acaoFecharFatura`/`acaoPagarFatura`. Adicione o
import e as 3 funções abaixo:

```ts
import { arquivarCartao, criarCartao, editarCartao } from '@/dados/cartoes';

export async function acaoCriarCartao(dadosForm: FormData): Promise<void> {
  await criarCartao({
    nome: String(dadosForm.get('nome') ?? ''),
    diaFechamento: Number(dadosForm.get('diaFechamento')),
    diaVencimento: Number(dadosForm.get('diaVencimento')),
  });
  revalidatePath('/cartoes');
}

export async function acaoEditarCartao(dadosForm: FormData): Promise<void> {
  await editarCartao(String(dadosForm.get('id') ?? ''), {
    nome: String(dadosForm.get('nome') ?? ''),
    diaFechamento: Number(dadosForm.get('diaFechamento')),
    diaVencimento: Number(dadosForm.get('diaVencimento')),
  });
  revalidatePath('/cartoes');
  revalidatePath('/');
}

export async function acaoArquivarCartao(dadosForm: FormData): Promise<void> {
  await arquivarCartao(String(dadosForm.get('id') ?? ''));
  revalidatePath('/lancamentos/novo');
  revalidatePath('/cartoes');
  revalidatePath('/');
}
```

- [ ] **Step 4: Adicionar a seção de gestão de cartões em `src/app/(app)/cartoes/page.tsx`**

Troque o import do topo de:

```tsx
import Link from 'next/link';

import { listarCartoes } from '@/dados/cartoes';
import { listarFaturas, totalDaFatura } from '@/dados/faturas';
import { competenciaDe, dataCivilEm, formatarDataCivil } from '@/dominio/data';
import { janelaDeFaturas } from '@/dominio/fatura';
import { formatarBRL } from '@/dominio/dinheiro';

import { acaoFecharFatura, acaoPagarFatura } from './acoes';
```

para:

```tsx
import Link from 'next/link';

import { listarCartoes } from '@/dados/cartoes';
import { listarFaturas, totalDaFatura } from '@/dados/faturas';
import { competenciaDe, dataCivilEm, formatarDataCivil } from '@/dominio/data';
import { janelaDeFaturas } from '@/dominio/fatura';
import { formatarBRL } from '@/dominio/dinheiro';

import {
  acaoFecharFatura,
  acaoPagarFatura,
  acaoCriarCartao,
  acaoEditarCartao,
  acaoArquivarCartao,
} from './acoes';
import { ListaCartoes } from './lista-cartoes';
```

No JSX, logo depois de `<h1>Cartões</h1>` e antes do bloco
`{cartoes.length === 0 ? (`, adicione:

```tsx
      <ListaCartoes
        cartoesIniciais={cartoes}
        acao={acaoCriarCartao}
        acaoEditar={acaoEditarCartao}
        acaoExcluir={acaoArquivarCartao}
      />
```

Troque a mensagem de vazio (hoje diz "Nenhum cartão cadastrado. Crie um em
Ajustes.") — como o `<ListaCartoes>` agora aparece ANTES dessa checagem
(sempre visível, com seu próprio formulário e sua própria lista), a
mensagem de "nenhum cartão" original fica redundante com o que
`ListaCartoes` já mostra por conta própria quando `cartoesIniciais` está
vazio (`estilos.vazio` interno do componente). Troque:

```tsx
      {cartoes.length === 0 ? (
        <p style={{ fontSize: 'var(--fonte-tamanho-subtitulo)', color: 'var(--cor-texto-secundario)' }}>
          Nenhum cartão cadastrado. Crie um em Ajustes.
        </p>
      ) : (
```

por:

```tsx
      {cartoes.length === 0 ? null : (
```

(O restante do bloco `<>...</>` que já existia depois do `) : (` continua
igual — só a condição do vazio muda, já que `ListaCartoes` cobre esse caso
agora.)

- [ ] **Step 5: Remover a seção de Cartões de `src/app/(app)/ajustes/page.tsx`**

Troque o import do topo de:

```tsx
import { listarCategorias } from '@/dados/categorias';
import { listarCartoes } from '@/dados/cartoes';
import { listarRecorrentes } from '@/dados/recorrentes';

import {
  acaoEditarCartao,
  acaoArquivarCartao,
  acaoCriarCartao,
  acaoCriarRecorrencia,
  acaoEditarRecorrencia,
  acaoEncerrarRecorrencia,
  acaoAlternarRecorrencia,
} from './acoes';
import { ListaCartoes } from './lista-cartoes';
import { ListaRecorrentes } from './lista-recorrentes';
import estilos from './ajustes.module.css';
```

para (só o import de `./acoes` e o de `ListaCartoes` mudam — o resto fica
igual; `listarCartoes` e `cartoes` continuam necessários porque
`ListaRecorrentes`, que continua nesta página até a Task 3, depende de
`cartoes` como prop para seu seletor "Cartão (se crédito)"):

```tsx
import { listarCategorias } from '@/dados/categorias';
import { listarCartoes } from '@/dados/cartoes';
import { listarRecorrentes } from '@/dados/recorrentes';

import {
  acaoCriarRecorrencia,
  acaoEditarRecorrencia,
  acaoEncerrarRecorrencia,
  acaoAlternarRecorrencia,
} from './acoes';
import { ListaRecorrentes } from './lista-recorrentes';
import estilos from './ajustes.module.css';
```

O corpo da função (o `Promise.all` buscando `[categorias, cartoes,
recorrentes]`) **não muda neste Step** — continua exatamente igual, pelo
mesmo motivo (`cartoes` ainda é consumido por `ListaRecorrentes`).

No JSX, apague inteiramente a `<section>` que tem `<div
className={estilos.titulo}>Cartões</div>` com `<ListaCartoes .../>` dentro
— do `<section className={estilos.secao}>` de abertura até o `</section>`
de fechamento. A seção de Despesas fixas continua exatamente como está.

- [ ] **Step 6: Remover as 3 ações em `src/app/(app)/ajustes/acoes.ts`**

Apague `acaoCriarCartao`, `acaoEditarCartao`, `acaoArquivarCartao` inteiras.
Remova `criarCartao, editarCartao, arquivarCartao` do import de
`@/dados/cartoes`.

- [ ] **Step 7: Apagar os 3 arquivos migrados de `ajustes/`**

```bash
git rm "src/app/(app)/ajustes/lista-cartoes.tsx" \
  "src/app/(app)/ajustes/botao-editar-cartao.tsx" \
  "src/app/(app)/ajustes/botao-excluir-cartao.tsx"
```

- [ ] **Step 8: Rodar a suíte completa**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`
Expected: os quatro comandos limpos.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(app)/cartoes/" "src/app/(app)/ajustes/acoes.ts" \
  "src/app/(app)/ajustes/page.tsx"
git commit -m "refactor(ia): move gestão de Cartão pra tela de Cartões"
```

---

## Task 3: Despesa Fixa — Ajustes → Lançamentos

**Files:**
- Create: `src/app/(app)/lancamentos/gestao.module.css`
- Create: `src/app/(app)/lancamentos/lista-recorrentes.tsx`
- Create: `src/app/(app)/lancamentos/botao-editar-recorrencia.tsx`
- Modify: `src/app/(app)/lancamentos/acoes.ts`
- Modify: `src/app/(app)/lancamentos/page.tsx`
- Delete: `src/app/(app)/ajustes/lista-recorrentes.tsx`
- Delete: `src/app/(app)/ajustes/botao-editar-recorrencia.tsx`
- Delete: `src/app/(app)/ajustes/acoes.ts`
- Delete: `src/app/(app)/ajustes/ajustes.module.css`
- Delete: `src/app/(app)/ajustes/page.tsx`
- Modify: `src/app/(app)/destinos.ts`

**Interfaces:**
- Consumes: nada das Tasks 1/2.
- Produces: `ListaRecorrentes` agora mora em
  `@/app/(app)/lancamentos/lista-recorrentes`. `/lancamentos` exporta
  `acaoCriarRecorrencia`, `acaoEditarRecorrencia`, `acaoEncerrarRecorrencia`,
  `acaoAlternarRecorrencia` do seu próprio `acoes.ts`, ao lado de
  `acaoCriarLancamento` que já existe lá.

Esta é a última tarefa — depois dela, `ajustes/` deixa de ter qualquer
conteúdo usado por outra tela e é apagado por completo, e o destino
"Ajustes" some da navegação.

- [ ] **Step 1: Criar `src/app/(app)/lancamentos/gestao.module.css`**

Copie o conteúdo INTEIRO de `src/app/(app)/ajustes/ajustes.module.css`
(neste ponto do plano, o arquivo ainda existe — as Tasks 1/2 não o
apagaram) para este arquivo novo, sem mudança.

- [ ] **Step 2: Criar os 2 componentes migrados**

Mesma mecânica das tarefas anteriores: copie o conteúdo INTEIRO, trocando
só a linha de import do CSS de `import estilos from './ajustes.module.css';`
para `import estilos from './gestao.module.css';`.

- `src/app/(app)/lancamentos/lista-recorrentes.tsx` (de `ajustes/lista-recorrentes.tsx`)
- `src/app/(app)/lancamentos/botao-editar-recorrencia.tsx` (de `ajustes/botao-editar-recorrencia.tsx`)

`lista-recorrentes.tsx` importa `BotaoEditarRecorrencia` de
`'./botao-editar-recorrencia'` — continua correto sem mudança.

- [ ] **Step 3: Adicionar as 4 ações em `src/app/(app)/lancamentos/acoes.ts`**

O arquivo hoje tem só `acaoCriarLancamento`. Adicione o import e as 4
funções abaixo:

```ts
import { buscarSubcategoria } from '@/dados/categorias';
import {
  criarRecorrencia,
  editarRecorrencia,
  encerrarRecorrencia,
  pausarRecorrencia,
  retomarRecorrencia,
} from '@/dados/recorrentes';

export async function acaoCriarRecorrencia(dadosForm: FormData): Promise<void> {
  const metodo = String(dadosForm.get('metodo') ?? 'PIX') as MetodoPagamento;
  const cardIdBruto = String(dadosForm.get('cardId') ?? '');
  const subcategoryId = String(dadosForm.get('subcategoryId') ?? '');

  // O formulário só oferece a escolha de subcategoria (já rotulada com o
  // orçamento pai) — o orçamento em si é derivado dela aqui, em vez de vir de
  // um segundo campo independente que o usuário poderia preencher em
  // desacordo com a subcategoria escolhida.
  const subcategoria = await buscarSubcategoria(subcategoryId);
  if (!subcategoria) {
    throw new Error(`Subcategoria não encontrada: ${subcategoryId}`);
  }

  await criarRecorrencia({
    descricao: String(dadosForm.get('descricao') ?? ''),
    valorCentavos: emCentavos(Number(dadosForm.get('valor') ?? 0)),
    diaDoMes: Number(dadosForm.get('diaDoMes')),
    budgetCategoryId: subcategoria.budgetCategoryId,
    subcategoryId,
    metodo,
    cardId: metodo === 'CREDITO' && cardIdBruto ? cardIdBruto : null,
    inicio: String(dadosForm.get('inicio') ?? ''),
  });
  revalidatePath('/lancamentos');
}

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
  revalidatePath('/lancamentos');
}

export async function acaoEncerrarRecorrencia(dadosForm: FormData): Promise<void> {
  await encerrarRecorrencia(
    String(dadosForm.get('id') ?? ''),
    String(dadosForm.get('fim') ?? ''),
  );
  revalidatePath('/lancamentos');
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
  revalidatePath('/lancamentos');
}
```

`emCentavos` e `MetodoPagamento` já são importados por este arquivo hoje
(usados por `acaoCriarLancamento`) — não duplique esses imports, só
verifique que continuam lá.

- [ ] **Step 4: Adicionar a seção de Despesas fixas em `src/app/(app)/lancamentos/page.tsx`**

Troque o import do topo de:

```tsx
import Link from 'next/link';
import { revalidatePath } from 'next/cache';

import { competenciaDe, dataCivilEm, somarMeses } from '@/dominio/data';
import { formatarBRL } from '@/dominio/dinheiro';
import { apagarGrupo, apagarLancamento, listarLancamentos } from '@/dados/lancamentos';
import { materializarRecorrentes } from '@/dados/recorrentes';

import estilos from './lista.module.css';
```

para:

```tsx
import Link from 'next/link';
import { revalidatePath } from 'next/cache';

import { listarCartoes } from '@/dados/cartoes';
import { listarCategorias } from '@/dados/categorias';
import { competenciaDe, dataCivilEm, somarMeses } from '@/dominio/data';
import { formatarBRL } from '@/dominio/dinheiro';
import { apagarGrupo, apagarLancamento, listarLancamentos } from '@/dados/lancamentos';
import { listarRecorrentes, materializarRecorrentes } from '@/dados/recorrentes';

import {
  acaoCriarRecorrencia,
  acaoEditarRecorrencia,
  acaoEncerrarRecorrencia,
  acaoAlternarRecorrencia,
} from './acoes';
import { ListaRecorrentes } from './lista-recorrentes';
import estilos from './lista.module.css';
```

No corpo da função, logo após `await materializarRecorrentes(competencia);`,
troque:

```tsx
  const lancamentos = await listarLancamentos(competencia);
  const total = lancamentos.reduce((a, l) => a + l.valorCentavos, 0);
```

por:

```tsx
  const [lancamentos, categorias, cartoes, recorrentes] = await Promise.all([
    listarLancamentos(competencia),
    listarCategorias(),
    listarCartoes(),
    listarRecorrentes(),
  ]);
  const total = lancamentos.reduce((a, l) => a + l.valorCentavos, 0);
```

No JSX, logo antes do `</>` de fechamento no final do `return`, adicione uma
seção nova (recolhível via o elemento nativo `<details>`, sem biblioteca
nova — mesmo espírito de "sem dependência nova" do resto do projeto):

```tsx
      <details style={{ marginTop: 'var(--espaco-8)' }}>
        <summary
          style={{
            cursor: 'pointer',
            fontSize: 'var(--fonte-tamanho-subtitulo)',
            fontWeight: 600,
            marginBottom: 'var(--espaco-3)',
          }}
        >
          Despesas fixas
        </summary>
        <div style={{ marginTop: 'var(--espaco-3)' }}>
          <ListaRecorrentes
            recorrentesIniciais={recorrentes}
            categorias={categorias}
            cartoes={cartoes}
            acaoCriar={acaoCriarRecorrencia}
            acaoEditar={acaoEditarRecorrencia}
            acaoAlternar={acaoAlternarRecorrencia}
            acaoEncerrar={acaoEncerrarRecorrencia}
          />
        </div>
      </details>
```

- [ ] **Step 5: Apagar `ajustes/` por completo**

Neste ponto (depois das Tasks 1 e 2), `ajustes/page.tsx` só tem o `<h1>` e a
seção de Despesas fixas (Orçamentos/Subcategorias e Cartões já saíram nas
tarefas anteriores) — a Despesa Fixa em si já migrou para
`lancamentos/page.tsx` no Step 4 desta mesma tarefa, então o conteúdo que
ainda resta em `ajustes/page.tsx` está duplicado (a mesma seção existe
agora nos dois lugares) e prestes a ser apagado por inteiro, não editado.
Antes de apagar, leia o arquivo e confirme que o que sobrou é exatamente
isso — só `<h1>Ajustes</h1>` mais a seção de Despesas fixas, nada de
Orçamentos/Subcategorias/Cartões (se sobrou qualquer uma dessas três, é
sinal de que uma tarefa anterior não removeu sua seção por completo — pare
e corrija antes de continuar). Confirmada essa checagem, apague os cinco
arquivos que ainda restam em `ajustes/`:

```bash
git rm "src/app/(app)/ajustes/page.tsx" \
  "src/app/(app)/ajustes/acoes.ts" \
  "src/app/(app)/ajustes/ajustes.module.css" \
  "src/app/(app)/ajustes/lista-recorrentes.tsx" \
  "src/app/(app)/ajustes/botao-editar-recorrencia.tsx"
```

(Os últimos dois da lista são os componentes desta própria tarefa, migrados
no Step 2 — apagados junto com o resto de `ajustes/` neste Step final, já
que essa é a última entidade a sair de lá.)

- [ ] **Step 6: Remover "Ajustes" da navegação**

Em `src/app/(app)/destinos.ts`, troque:

```ts
export const DESTINOS_SECUNDARIOS = [
  { href: '/orcamentos', rotulo: 'Orçamentos' },
  { href: '/reembolsos', rotulo: 'Reembolsos' },
  { href: '/receitas', rotulo: 'Receitas' },
  { href: '/cartoes', rotulo: 'Cartões' },
  { href: '/ajustes', rotulo: 'Ajustes' },
];
```

por:

```ts
export const DESTINOS_SECUNDARIOS = [
  { href: '/orcamentos', rotulo: 'Orçamentos' },
  { href: '/reembolsos', rotulo: 'Reembolsos' },
  { href: '/receitas', rotulo: 'Receitas' },
  { href: '/cartoes', rotulo: 'Cartões' },
];
```

- [ ] **Step 7: Rodar a suíte completa**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`
Expected: os quatro comandos limpos. Confirme também, por `grep`, que
nenhum arquivo fora de `git status` referencia mais `/ajustes` ou
`ajustes.module.css`:

```bash
grep -rn "'/ajustes'\|ajustes.module.css\|from '\.\./ajustes" src/ || echo "nenhuma referência restante"
```

Expected: `nenhuma referência restante` (a busca não deve achar nada — o
diretório inteiro se foi e nada mais aponta pra ele).

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/lancamentos/" "src/app/(app)/destinos.ts"
git rm "src/app/(app)/ajustes/page.tsx" "src/app/(app)/ajustes/acoes.ts" \
  "src/app/(app)/ajustes/ajustes.module.css" \
  "src/app/(app)/ajustes/lista-recorrentes.tsx" \
  "src/app/(app)/ajustes/botao-editar-recorrencia.tsx"
git commit -m "refactor(ia): move Despesa Fixa pra Lançamentos e remove Ajustes por completo"
```

---

## Ao terminar

Antes de considerar este sub-projeto pronto, confirme no navegador com
sessão real:

- [ ] `npx vitest run` passa inteiro, `npx tsc --noEmit`, `npm run lint` e
      `npm run build` limpos
- [ ] "Ajustes" não aparece mais na navegação lateral nem no menu "Mais"
      do celular; visitar `/ajustes` direto na URL dá 404
- [ ] Em **Orçamentos**, criar um novo orçamento funciona (com catálogo de
      cor); dentro de cada orçamento, criar/editar/excluir uma subcategoria
      funciona; excluir um orçamento funciona (com o diálogo de aviso)
- [ ] Em **Cartões**, criar/editar/excluir um cartão funciona
- [ ] Em **Lançamentos**, a seção recolhível "Despesas fixas" aparece
      embaixo da lista do mês; criar/editar/pausar/retomar/encerrar uma
      despesa fixa funciona
- [ ] Criar uma despesa fixa nova oferece corretamente os cartões e
      subcategorias já existentes nos seletores

**Este é o segundo dos dois sub-projetos restantes da revisão maior do
produto.** Maturidade visual (animações, efeitos, cor mais expressiva) fica
para um próximo ciclo de brainstorm → spec → plano.
