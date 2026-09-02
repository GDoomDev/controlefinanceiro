# Orçamentos: Catálogo de Cores e Exclusão — Design

**Data:** 2026-09-02
**Status:** aprovado, pronto para planejamento de implementação

## 1. Objetivo

Primeiro sub-projeto da v2 (melhorias de visual e UX). Dois problemas concretos na tela de
Ajustes, seção Orçamentos:

1. A cor de um orçamento é escolhida por um `<select>` numérico ("1", "2", "3"...) — o
   usuário não vê a cor antes de escolher, só o número do slot.
2. Não existe nenhum jeito, na interface, de remover um orçamento. A função que arquiva
   (`arquivarCategoria`) já existe no backend desde o Plano 1, mas nunca foi ligada a
   nenhum botão.

Ao investigar o primeiro problema, apareceu um terceiro, latente: **nada impede dois
orçamentos ativos de usarem o mesmo slot de cor** — nenhuma validação de unicidade existe
hoje. Um catálogo visual tornaria esse bug visível na hora (duas categorias com o mesmo
retângulo de cor), então ele entra no escopo.

## 2. Escopo

Dentro:
- Catálogo visual de cores na criação de um orçamento, com indicação de slot já em uso.
- Opção de cor personalizada via seletor nativo do navegador (`<input type="color">`).
- Botão de excluir orçamento, com popup de confirmação.

Fora, deliberadamente:
- Editar nome ou cor de um orçamento já criado (só criação e exclusão mudam agora).
- Reativar um orçamento arquivado pela interface (o dado nunca é perdido — `arquivada:
  true` é reversível direto no banco — mas nenhum botão de "reativar" é construído neste
  sub-projeto).
- Qualquer mudança em Subcategorias, Cartões ou Despesas Fixas (seções vizinhas na mesma
  tela de Ajustes, não tocadas aqui).

## 3. Modelo de dados

Um campo novo, opcional, em `BudgetCategory`:

```
BudgetCategory       ...(campos existentes)...
                     corPersonalizada String?   ← hex "#rrggbb", null = usa corSlot
```

`corSlot` continua existindo e continua sendo o valor relevante **sempre que
`corPersonalizada` for nulo** — nenhuma categoria já existente muda de cor com esta
migração, porque toda linha atual tem `corPersonalizada = null`.

A cor final de uma categoria passa a ser resolvida por uma função pura:

```
corDaCategoria(categoria) = categoria.corPersonalizada ?? corDoSlot(categoria.corSlot)
```

Subcategorias continuam herdando a cor do orçamento-pai (spec original, seção 9) — nenhuma
mudança aí, porque elas nunca guardaram cor própria.

## 4. Catálogo visual de cores

A tela de criação de orçamento mostra os 6 slots da paleta validada (spec original, seção
9) como blocos de cor clicáveis, cada um mostrando a cor de verdade — não mais um número.

**Slot já em uso:** antes de renderizar o catálogo, a página busca quais dos 6 slots já
pertencem a alguma categoria **ativa** (`arquivada: false`). Um slot ocupado aparece
visualmente desabilitado (opacidade reduzida, sem cursor de clique) com um rótulo abaixo
mostrando o nome de quem já o usa — por exemplo, "já usado por Alimentação". Isso fecha o
bug latente: não é mais possível criar duas categorias ativas com a mesma cor por acidente.

Um orçamento **arquivado** libera seu slot — ele não conta como "em uso" para essa
checagem, porque ele não aparece mais em nenhuma lista de categorias ativas de qualquer
forma (mesma regra que já vale para tudo o mais no app: uma categoria arquivada some das
novas escolhas, mas seu histórico continua intacto).

**Cor personalizada:** ao lado dos 6 blocos, um sétimo controle abre o seletor de cor
nativo do navegador (`<input type="color">`). A cor escolhida ali vai para
`corPersonalizada`, e nenhum dos 6 slots é ocupado.

Aviso explícito, visível perto do seletor de cor personalizada, sem bloquear o fluxo:

> Cores personalizadas não passam pela validação de daltonismo da paleta padrão — o nome
> do orçamento sempre aparece ao lado da cor em toda tela do app, então a identificação
> nunca depende só da cor.

Essa garantia ("nome sempre ao lado da cor") já é verdadeira em todo o app hoje — Painel,
Áreas e a própria lista de Ajustes sempre mostram o nome da categoria ao lado do bloco de
cor. Nenhuma tela precisa mudar para que essa garantia continue valendo com cores
personalizadas.

**Validação do formato:** um hex de cor personalizada precisa bater com
`/^#[0-9a-f]{6}$/i` — o mesmo formato que `<input type="color">` sempre produz, então na
prática só protege contra alguém montar a requisição manualmente com um valor fora do
formato.

## 5. Excluir orçamento

Cada categoria na lista de Ajustes ganha um botão "excluir". Ele abre um popup de
confirmação usando o elemento nativo `<dialog>` do HTML (sem biblioteca nova) mostrando:

- O nome da categoria.
- Um aviso de que "excluir" aqui significa **arquivar**: a categoria some de toda escolha
  nova (novos lançamentos, novos orçamentos, novas despesas fixas), mas nenhum lançamento,
  alocação ou histórico já existente é apagado ou muda de valor.
- Um botão "Confirmar exclusão" e um "Cancelar".

Confirmar chama `arquivarCategoria` (já existente, sem mudança). Nenhuma parte do domínio
de agregação muda — o app já sabe lidar com categoria arquivada com gasto desde o Plano 3
(a barra do herói e a sobra projetada já incluem uma categoria arquivada que ainda teve
gasto no mês).

Uma categoria que tem subcategorias ativas pode ser arquivada normalmente — as
subcategorias continuam existindo (não são arquivadas em cascata), mas ficam órfãs de uma
categoria visível: qualquer tela que hoje monta o seletor de subcategoria a partir de
`listarCategorias()` (que já filtra `arquivada: false`) simplesmente para de oferecer
aquelas subcategorias como opção para novos lançamentos, porque o orçamento-pai delas não
aparece mais na lista. Isso é o comportamento correto e não precisa de código novo: é
exatamente como o filtro `arquivada: false` já se comporta hoje.

## 6. Testes

Domínio (puro, novo módulo ou extensão de `src/app/(app)/cores.ts`):
- `corDaCategoria`: prioriza `corPersonalizada` sobre `corSlot`; cai para `corDoSlot`
  quando `corPersonalizada` é nulo.
- Validação de formato hex: aceita `#rrggbb` maiúsculo ou minúsculo; rejeita formato
  errado (sem `#`, tamanho errado, caracteres fora de 0-9a-f).

Dados (`src/dados/categorias.ts`, testes com `comRollback`):
- `criarCategoria` aceita `corPersonalizada` em vez de `corSlot`, ou nenhum dos dois
  simultaneamente (mutuamente exclusivos — a entrada tem exatamente uma forma de definir
  cor).
- Uma função nova que lista quais dos 6 slots estão ocupados por categoria ativa — só
  conta categorias com `arquivada: false` e `corPersonalizada: null` (uma categoria com cor
  personalizada não ocupa slot nenhum).
- `arquivarCategoria` continua funcionando como já funciona (sem mudança de comportamento,
  só de ligação com a interface).

Interface: sem teste automatizado (Server Components + `<dialog>`), verificação manual no
fim do plano de implementação.

## 7. Auto-revisão

Sem placeholders, sem seção incompleta. Escopo consistente com o restante do app: nenhuma
mudança em `src/dominio/agregacao.ts` ou qualquer read-model, porque a resolução de cor é
sempre um detalhe de apresentação — o domínio de dinheiro nunca soube nem precisa saber
qual cor uma categoria usa.
