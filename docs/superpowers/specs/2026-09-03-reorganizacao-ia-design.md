# Reorganização de Arquitetura de Informação — Design

**Data:** 2026-09-03
**Status:** aprovado, pronto para planejamento de implementação

## 1. Objetivo

Segundo sub-projeto da revisão maior do produto (o primeiro, completude de CRUD,
já foi mesclado). Feedback direto do usuário: "algumas coisas estarem dentro de
Ajustes não faz muito sentido pra mim... a criação do Orçamento estar dentro de
Ajustes não faz sentido sendo que pode ser criado na própria aba de Orçamento."

Hoje, criar/editar/arquivar Orçamento, Subcategoria, Cartão e Despesa Fixa vive
inteiramente na tela de Ajustes — desconectado das telas onde essas mesmas
entidades já são exibidas (Orçamentos mostra alocações mensais por categoria sem
poder criar uma categoria nova ali; Cartões lista faturas sem poder cadastrar um
cartão ali). Este sub-projeto move cada fluxo de criação/edição para a tela onde
ele já é lido — puramente uma reorganização, sem mudar nenhuma regra de negócio.

## 2. Escopo

Dentro:
- Orçamento (`criarCategoria`, `arquivarCategoria`) e toda a gestão de
  Subcategoria (`criarSubcategoria`, `editarSubcategoria`,
  `arquivarSubcategoria`) migram de Ajustes para a tela **Orçamentos**.
- Cartão (`criarCartao`, `editarCartao`, `arquivarCartao`) migra de Ajustes
  para a tela **Cartões**.
- Despesa Fixa (`criarRecorrencia`, `editarRecorrencia`,
  `pausarRecorrencia`/`retomarRecorrencia`, `encerrarRecorrencia`) migra de
  Ajustes para a tela **Lançamentos**, como uma seção nova e recolhível.
- Remoção do destino "Ajustes" da navegação (`DESTINOS_SECUNDARIOS`, 9→8) e do
  diretório `src/app/(app)/ajustes/` inteiro, depois que tudo tiver migrado.

Fora, deliberadamente:
- **Nenhuma mudança em `src/dados/` ou `src/dominio/`** — é puramente a camada
  de rota/tela (`app/`) que se move; a lógica de negócio, os tipos e os 12
  testes automatizados que já cobrem essas funções continuam exatamente onde
  estão, sem tocar.
- **Nenhuma mudança de regra ou de campo** em nenhuma das quatro entidades —
  os formulários de criação/edição continuam com os mesmos campos, mesma
  validação, mesmos diálogos de confirmação de exclusão.
- **Nenhum componente de diálogo vira compartilhado** — cada tela mantém sua
  própria cópia do padrão `<dialog>` + `useRef`, como já é hoje entre
  Orçamento/Cartão/Despesa Fixa. Consistente com o resto do projeto: arquivo
  pequeno e focado em vez de abstração prematura por enquanto três usos
  parecidos.
- **Sem redirecionamento de `/ajustes`** — vira 404 normal do Next.js depois
  que o diretório for apagado. Ninguém deveria ter esse link salvo.
- **Maturidade visual (animações, efeitos)** — próximo sub-projeto, não este.

## 3. Destino de cada entidade

**Orçamento + Subcategoria → `src/app/(app)/orcamentos/`.** O formulário de
criar orçamento (nome + catálogo de cor) entra no topo da lista já existente,
antes da navegação de mês. A gestão de subcategoria (criar/editar/excluir)
passa a viver dentro de cada linha de orçamento — a tela já mostra o nome das
subcategorias ali; só falta o formulário de criar (editar/excluir já existem
desde o sub-projeto anterior, só precisam se mudar de diretório).

**Cartão → `src/app/(app)/cartoes/`.** O formulário de criar cartão (nome, dia
de fechamento, dia de vencimento) entra no topo da lista, antes das faturas.

**Despesa Fixa → `src/app/(app)/lancamentos/`.** Vira uma seção nova,
recolhível, abaixo da lista de lançamentos do mês — despesa fixa não é a ação
principal desta tela (lançamento avulso continua sendo), então fica visível
mas não domina a tela.

## 4. Mecânica da migração

Cada `acoes.ts`/`page.tsx`/componente que hoje vive em `ajustes/` se move para
o diretório de destino, mantendo o mesmo conteúdo — os destinos (Orçamentos,
Cartões) já têm seu próprio `acoes.ts`; as novas ações entram nesses arquivos
já existentes, ao lado do que já está lá. Lançamentos também já tem seu
próprio `acoes.ts` — a ação de Despesa Fixa entra ali.

Os componentes de diálogo (`botao-editar-cartao.tsx`,
`botao-excluir-subcategoria.tsx`, etc.) e os componentes de lista
(`lista-cartoes.tsx`, etc.) se mudam para o diretório de destino junto com a
entidade que gerenciam, ajustando só os imports relativos.

As classes CSS que esses componentes usam (`.dialogo`, `.dialogoCampos`,
`.linha`, `.campo`, `.rotulo`, `.entrada`, `.botao`, `.botaoTexto`,
`.botaoCancelar`, `.botaoConfirmarExclusao`, `.lista`, `.item`, `.vazio`,
`.subs`, `.cor`, `.subLista`, `.subItem`) são **copiadas** para o
`.module.css` de cada tela de destino — não compartilhadas entre telas,
mesmo padrão de "cada tela com seu próprio CSS" que o projeto já usa em
todo lugar. Se a tela de destino já tiver uma classe com o mesmo nome para
outra finalidade (CSS Modules não colidem em tempo de execução, mas duas
classes de mesmo nome com finalidades diferentes no mesmo arquivo confundem
quem lê o código depois), a classe recém-chegada ganha um nome próprio
nessa tela em vez de reaproveitar o nome — decidido caso a caso durante a
implementação, olhando o arquivo de destino real antes de copiar.

Ao final, `src/app/(app)/ajustes/` fica vazio e é apagado por completo — página,
ações, componentes, CSS.

## 5. Testes

Nenhum teste automatizado novo — a lógica coberta por `comRollback` em
`src/dados/*.test.ts` não muda de comportamento nem de localização. Verificação
é `tsc`/`vitest`/`lint`/`build` continuarem limpos (nenhuma mudança de lógica
deveria quebrá-los) e conferência manual no fim: cada tela de destino mostra o
formulário certo, cria/edita/arquiva corretamente, e `/ajustes` deixa de
existir na navegação.

## 6. Auto-revisão

Sem placeholders, sem seção incompleta. Escopo consistente: nenhuma mudança em
`src/dados/`/`src/dominio/`, nenhuma mudança de regra de negócio, nenhuma
introdução de abstração compartilhada nova. A remoção completa de
`src/app/(app)/ajustes/` só acontece depois que as três migrações estiverem
concluídas e verificadas — a ordem das tarefas do plano de implementação
precisa refletir essa dependência (migrar as três entidades antes, remover o
diretório e o destino de navegação por último).
