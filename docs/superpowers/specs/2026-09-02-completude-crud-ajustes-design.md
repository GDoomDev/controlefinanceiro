# Completude de CRUD — Subcategoria, Cartão, Despesa Fixa — Design

**Data:** 2026-09-02
**Status:** aprovado, pronto para planejamento de implementação

## 1. Objetivo

Primeiro sub-projeto de uma revisão maior do produto (motivada por feedback direto:
"o design... e a experiência do usuário estão muito ruins... o projeto está cheio dessas
falhas [de edição/exclusão]"). Um levantamento na camada de dados confirmou o problema:

| Entidade | Criar | Editar | Excluir/Arquivar |
|---|---|---|---|
| Orçamento (categoria) | ✅ | ❌ (decisão deliberada anterior) | ✅ (arquiva) |
| Subcategoria | ✅ | ❌ nem existe no backend | ❌ nem existe no backend |
| Cartão | ✅ | ❌ nem existe no backend | ❌ nem existe no backend |
| Despesa fixa | ✅ | ❌ (só pausar/retomar/encerrar) | — (encerrar já cobre) |
| Lançamento | ✅ | ❌ | ✅ |
| Alocação de orçamento | ✅ (upsert) | ✅ | ✅ |

Este sub-projeto fecha as lacunas de Subcategoria, Cartão e Despesa Fixa. Editar
Lançamento e revisitar Orçamento ficam de fora, por serem decisões mais arriscadas
(interação com estorno/reembolso) ou já deliberadamente descartadas antes — cada uma
merece seu próprio ciclo depois, se for o caso.

Achado importante que reduz o risco deste trabalho: o schema do banco **já tem** os
campos `arquivada` (`Subcategory`) e `ativo` (`Card`), e as consultas de listagem já
filtram por eles (`listarCategorias` já faz `subcategorias: { where: { arquivada: false
} }`; `listarCartoes` já faz `where: { ativo: true }`). Ou seja, arquivar essas duas
entidades já foi projetado desde a fundação do projeto — só nunca foi terminado
(nenhuma função escreve nesses campos, nenhum botão existe). Isso não é uma decisão de
arquitetura nova, é terminar o que já estava começado.

Também confirmado, sobre editar Cartão: cada fatura (`Invoice`) já guarda sua própria
`dataFechamento`/`dataVencimento` no momento em que é criada (`garantirFatura`), em vez
de recalculá-las do cartão a cada leitura — então mudar o dia de fechamento/vencimento
de um cartão só afeta faturas futuras, nunca as já emitidas. Editar é seguro.

## 2. Escopo

Dentro:
- **Subcategoria**: editar nome; arquivar.
- **Cartão**: editar nome, dia de fechamento, dia de vencimento; arquivar.
- **Despesa fixa**: editar descrição, valor, dia do mês, subcategoria, método, cartão.
- Um botão "editar" por item, abrindo um `<dialog>` nativo pré-preenchido — mesmo
  padrão que o botão "excluir" de Orçamento já usa hoje (`BotaoExcluirCategoria`).

Fora, deliberadamente:
- **Editar Lançamento** — interage com estorno/reembolso de formas que merecem
  investigação própria; fica para um sub-projeto futuro.
- **Renomear/recolorir Orçamento** — já foi decisão deliberada de um sub-projeto
  anterior (catálogo de cores) não fazer isso; não reaberto aqui.
- **Editar o "início" de uma Despesa Fixa** — mudar retroativamente a data de início
  de uma recorrência já ativa é uma operação mais arriscada (o que acontece com
  lançamentos já materializados no meio do caminho?). Quem precisar mudar o início
  continua usando o caminho já existente: encerrar a atual e criar uma nova.
- **"Excluir de fato" uma Despesa Fixa** — `encerrarRecorrencia` já cobre essa
  necessidade (define quando ela para de valer); nenhuma função nova aqui.
- **Escrita otimista nos novos botões de editar/arquivar** — a queixa original de
  lentidão era sobre *criar*, já resolvida num sub-projeto anterior aplicando
  `useOptimistic` às 3 listas de Ajustes. Editar/arquivar são capacidades que não
  existiam até agora — não há queixa de lentidão sobre algo que nunca existiu.
  Adicionar otimismo aqui seria escopo além do que foi pedido; fica para depois, se
  fizer falta.

## 3. Validação de cada função nova

Cada função `editar*` reaplica exatamente a mesma validação que a função `criar*`
irmã já usa (mesmas mensagens de erro, mesmas regras) — nenhuma regra nova é
inventada só para a edição:

- **`editarSubcategoria`**: nome não-vazio (`nomeLimpo`, já usado por
  `criarSubcategoria`). Colisão de nome dentro do mesmo orçamento continua sendo
  pega pela constraint única do banco (`@@unique([budgetCategoryId, nome])`), do
  mesmo jeito que `criarSubcategoria` já deixa o Prisma lançar o erro em vez de
  pré-checar — comportamento idêntico ao da criação, não mais nem menos rigoroso.
- **`arquivarSubcategoria`**: `arquivada = true`, sem mudança de comportamento em
  nenhum outro lugar — já é exatamente isso que `arquivarCategoria` faz para
  orçamento, e a listagem já filtra por esse campo.
- **`editarCartao`**: nome não-vazio, `validarDia` nos dois dias (mesmas funções que
  `criarCartao` já usa) — nenhuma regra nova de relação entre os dois dias, porque
  `criarCartao` também não tem essa regra hoje (o domínio de fatura já lida com as
  duas ordens possíveis).
- **`arquivarCartao`**: `ativo = false`.
- **`editarRecorrencia`**: mesmas validações de `criarRecorrencia` — descrição
  não-vazia, valor inteiro positivo em centavos, dia do mês entre 1 e 31, a
  subcategoria escolhida precisa pertencer ao orçamento informado, método `CREDITO`
  exige um cartão válido. Igual à criação, nenhuma validação cruzada nova.

## 4. Interface

Um botão "editar" por item nas três listas (Subcategoria, Cartão, Despesa Fixa) da
tela de Ajustes, ao lado do que já existe (nada de "excluir" muda para Despesa Fixa,
que continua com pausar/retomar/encerrar; Subcategoria e Cartão ganham um botão
"excluir" novo, no mesmo padrão do de Orçamento). Clicar abre um `<dialog>` nativo com
os campos editáveis daquela entidade, pré-preenchidos com os valores atuais. Confirmar
chama a função `editar*` correspondente; a página revalida normalmente (sem escrita
otimista, por design — seção 2).

O botão "excluir" de Subcategoria/Cartão usa o mesmo aviso honesto que o de Orçamento
já usa: deixa claro que arquivar preserva todo histórico (lançamentos, despesas fixas
que ainda apontam para ali), só tira a opção de escolhas novas.

## 5. Testes

Cada função nova em `src/dados/` ganha teste automatizado com `comRollback`, cobrindo:
o caminho feliz (edita e a leitura reflete a mudança), cada regra de validação
reaplicada (mensagens de erro idênticas às da função `criar*` irmã), e — para as
funções de arquivar — que o item arquivado desaparece da listagem mas o histórico
ligado a ele continua intacto. A interface (Server Components + `<dialog>`) segue sem
teste automatizado, por convenção já estabelecida no projeto; verificação manual no
fim do plano de implementação.

## 6. Auto-revisão

Sem placeholders, sem seção incompleta. Escopo consistente: nenhuma migração de
banco necessária (campos já existem); nenhuma mudança em `src/dominio/agregacao.ts`
ou em qualquer read-model de dinheiro — todas as funções novas são CRUD direto,
sem envolver cálculo financeiro. Exclusões de escopo (editar Lançamento, reabrir
Orçamento, editar "início" de recorrência, otimismo em editar/arquivar) documentadas
com o motivo de cada uma, para não serem confundidas com esquecimento.
