# Controle Financeiro Pessoal — Design

**Data:** 2026-08-31
**Status:** aprovado, pronto para planejamento de implementação

## 1. Objetivo

Aplicativo web instalável (PWA) de organização financeira pessoal, acessível do PC e do
celular. Registra receitas e despesas, controla orçamentos mensais por categoria,
acompanha reembolsos pendentes, gerencia faturas de cartão de crédito e projeta quanto
sobra em cada mês.

Usuário único. O login existe para proteger o acesso, não para separar dados entre pessoas.

## 2. Decisões tomadas

| Tema | Decisão |
|---|---|
| Usuários | Um só |
| Hospedagem | Nuvem gerenciada em plano gratuito |
| Stack | Next.js (App Router) + Postgres + Prisma, repositório único |
| Login | Auth.js com provedor Google |
| Categorização | Hierarquia estrita: Orçamento → Subcategoria |
| Competência | Carimbada na gravação, nunca recalculada sozinha |
| Parcelamento | Uma parcela por mês, cada uma na competência da sua fatura |
| Cartões | Fatura como entidade, com fechar e pagar |
| Reembolso | Consome orçamento; ao receber, estorna na competência original |
| Receita futura | Informada manualmente por mês |
| Orçamento | Versionado por vigência, sem acúmulo entre meses |

**Fora do escopo desta versão:** saldo de contas bancárias e conciliação, importação de
CSV/OFX, e sincronização offline com resolução de conflitos. O app exige conexão.

## 3. Modelo de dados

```
User                 id, email, nome, imagem
                     (Auth.js: Account, Session, VerificationToken)

BudgetCategory       id, nome, ordem, corSlot (1..6), arquivada
Subcategory          id, budgetCategoryId → BudgetCategory, nome, arquivada

BudgetAllocation     id, budgetCategoryId, vigenteDe (YYYY-MM), valorCentavos
                     UNIQUE (budgetCategoryId, vigenteDe)

Card                 id, nome, diaFechamento (1..31), diaVencimento (1..31), ativo
Invoice              id, cardId, competencia (YYYY-MM), dataFechamento, dataVencimento,
                     status (ABERTA | FECHADA | PAGA), pagaEm
                     UNIQUE (cardId, competencia)

Transaction          id, tipo (DESPESA | RECEITA)
                     descricao, valorCentavos, data
                     metodo (CREDITO | DEBITO | PIX | DINHEIRO | BOLETO)
                     cardId?, invoiceId?
                     budgetCategoryId?, subcategoryId?
                     competencia (YYYY-MM)              ← carimbada na gravação
                     reembolso (NAO | PENDENTE | RECEBIDO), reembolsoRecebidoEm?
                     grupoParcelamentoId?, parcelaNum, parcelaTotal
                     recorrenciaId?
                     UNIQUE (recorrenciaId, competencia) onde recorrenciaId não é nulo

ExpectedIncome       id, competencia (YYYY-MM), descricao, valorCentavos
RecurringExpense     id, descricao, valorCentavos, diaDoMes, budgetCategoryId,
                     subcategoryId, metodo, cardId?, inicio (YYYY-MM), fim?, ativa
```

### Regras de integridade

- Despesa exige `budgetCategoryId` e `subcategoryId`; receita não aceita nenhum dos dois.
- `subcategoryId` deve pertencer ao `budgetCategoryId` informado.
- `metodo = CREDITO` exige `cardId` e `invoiceId`; os demais métodos exigem ambos nulos.
- Dinheiro é sempre inteiro em centavos. Ponto flutuante não aparece em nenhum ponto do
  domínio.
- Na divisão de parcelas, os centavos de resto vão para a primeira parcela: R$100,05 em
  10x gera uma de R$10,05 e nove de R$10,00.

Parcelamento não tem tabela própria: as parcelas são `Transaction` compartilhando um
`grupoParcelamentoId`, o que permite editar ou apagar a compra inteira operando pelo grupo.

## 4. Motor de competência

Módulo puro, sem banco e sem framework. Concentra toda a aritmética de datas.

**Método diferente de crédito:** competência é o mês da `data` do lançamento.

**Método crédito:** o lançamento entra na fatura cuja janela contém a `data`, e a
competência é **o mês do vencimento dessa fatura**.

A janela de uma fatura vai do dia seguinte ao fechamento anterior até o dia do fechamento
atual. O vencimento é o próximo dia `diaVencimento` após o fechamento — no **mesmo mês**
quando `diaVencimento > diaFechamento`, no mês seguinte caso contrário.

Exemplo, cartão que fecha dia 25 e vence dia 5:

| Compra | Fatura fecha | Vence | Competência |
|---|---|---|---|
| 20/ago | 25/ago | 05/set | setembro |
| 28/ago | 25/set | 05/out | outubro |

**Parcelas:** a parcela *k* cai na competência da parcela 1 somada de (*k*−1) meses, cada
uma vinculada à fatura correspondente daquele cartão. As faturas futuras são criadas sob
demanda, com status `ABERTA`.

**Casos que o módulo trata explicitamente:**

- `diaVencimento > diaFechamento` → vencimento no mesmo mês do fechamento.
- Dia 29, 30 ou 31 em meses curtos → ajustado para o último dia do mês.
- Todo cálculo de mês fixa o fuso em `America/Sao_Paulo`, para que uma compra às 22h não
  migre de mês.

**Recálculo:** a competência é gravada uma vez e nunca muda sozinha. Ao alterar
`diaFechamento` ou `diaVencimento` de um cartão, o app informa quantas faturas **abertas**
seriam afetadas e só reprocessa após confirmação explícita. Faturas `FECHADA` ou `PAGA`
nunca são tocadas.

**Pagamento de fatura não é despesa.** As compras já consumiram o orçamento na sua
competência; marcar a fatura como paga apenas muda o status e não gera lançamento, para
não contar o mesmo dinheiro duas vezes.

## 5. Orçamento versionado

`BudgetAllocation` grava **uma linha por mudança**, não uma por mês. O valor vigente em um
mês *M* é o da linha com o maior `vigenteDe` menor ou igual a *M*.

Com as linhas `ago/2026 = 1000`, `set/2026 = 800` e `dez/2026 = 600`:

| Ago | Set | Out | Nov | Dez | Jan |
|---|---|---|---|---|---|
| 1000 | 800 | 800 | 800 | 600 | 600 |

Alterar dezembro não afeta outubro e novembro; agosto permanece intacto.

Na interface, cada orçamento indica se o valor é **herdado** (com o mês de origem) ou
**definido neste mês**, e permite remover a definição para voltar a herdar. Editar um mês
passado é permitido, mas exibe aviso de que reescreve o histórico daquele mês em diante até
a próxima mudança.

**Não há acúmulo:** sobrar R$150 em outubro não aumenta o orçamento de novembro.

## 6. Reembolso

| Estado | Orçamento | Sobra do mês | Fatura do cartão |
|---|---|---|---|
| `PENDENTE` | consome | conta como despesa | entra |
| `RECEBIDO` | estorna | sai da conta | **continua entrando** |

A fatura é o único agregado que usa valor bruto — o dinheiro saiu para o banco de fato,
independentemente de ressarcimento posterior. Orçamento, aba de Áreas e sobra usam valor
líquido, ou seja, ignoram lançamentos com `reembolso = RECEBIDO`.

O estorno vale na **competência original** da despesa. Consequência aceita: uma despesa de
setembro reembolsada em outubro altera o número de setembro depois de o mês ter fechado. A
aba de Reembolsos torna isso visível, registrando a data de recebimento e o mês corrigido.

Implementação: nenhum lançamento de crédito é criado. O estorno é a própria exclusão do
lançamento das agregações líquidas.

**O reembolso é integral.** Marcar como recebido estorna o valor cheio do lançamento; não
existe reembolso parcial. Para ressarcimento de parte de uma compra, o lançamento deve ser
dividido em dois — a parte própria e a parte a reembolsar.

## 7. Fórmula da sobra

Definições por competência *M*, todas em centavos:

- `despesaLiquida(M)` = soma das despesas de *M* com `reembolso ≠ RECEBIDO`
- `receitaRealizada(M)` = soma das transações `RECEITA` de *M*
- `receitaPrevista(M)` = soma de `ExpectedIncome` de *M*
- `gastoCat(c, M)` = despesa líquida de *M* na categoria *c*
- `orcamento(c, M)` = alocação vigente de *c* em *M*, ou 0 se *M* é anterior à primeira
  alocação daquela categoria

**Receita considerada:**

- *M* anterior ao mês corrente → `receitaRealizada(M)`
- *M* corrente ou futuro → `máx(receitaPrevista(M), receitaRealizada(M))`

O `máx` cobre os três casos reais: receita ainda não recebida, receita já recebida, e bônus
acima do previsto. Quando `receitaPrevista(M)` está ausente para um mês futuro, o app emite
aviso pedindo o valor — ele não estima média de meses anteriores.

**Sobra realizada** (o que de fato aconteceu):

```
sobraRealizada(M) = receitaRealizada(M) − despesaLiquida(M)
```

**Sobra projetada** (como o mês deve fechar):

```
sobraProjetada(M) = receitaConsiderada(M)
                  − Σ_c máx( orcamento(c, M), gastoCat(c, M) )
```

O somatório percorre todas as categorias não arquivadas, mais qualquer categoria arquivada
que ainda tenha gasto em *M*. Como toda despesa é obrigada a ter categoria (seção 3), não
existe termo residual fora do somatório.

O `máx` por categoria existe por causa das parcelas já comprometidas: se dezembro tem
R$200 alocados em Eletrônicos mas já carrega uma parcela de R$300, a projeção precisa usar
R$300 — somar os dois contaria a parcela duas vezes.

O mês corrente exibe os dois números lado a lado: *realizado até hoje* e *projeção do
fechamento*. Meses passados exibem apenas o realizado; meses futuros, apenas a projeção.

## 8. Telas

Sete destinos: barra lateral no desktop, barra inferior com quatro ícones mais "Mais" no
celular, e botão flutuante de novo lançamento sempre acessível.

| Tela | Responde |
|---|---|
| Painel | "Como estou este mês?" |
| Lançamentos | "O que eu gastei?" |
| Áreas | "Pra onde foi o dinheiro?" |
| Fluxo | "E nos outros meses?" |
| Reembolsos | "Quem me deve?" |
| Cartões | "Quanto vem de fatura?" |
| Ajustes | Orçamentos, categorias, despesas fixas, receita prevista |

### 8.1 Painel

Três blocos verticais, com seletor de mês no topo:

1. **Herói** — sobra projetada em destaque, receita considerada ao lado, e uma barra única
   de consumo dividida em *já gastos / comprometidos / livres*. No canto oposto, o
   realizado até hoje, em tipografia secundária.
2. **Central de avisos** — uma linha por aviso, empilhadas, cada uma com barra colorida à
   esquerda e navegação ao clicar.
3. **Cards de orçamento** — grade de 3 colunas no desktop e 2 no celular. O número grande
   de cada card é o **restante**, não o gasto, para responder diretamente "posso gastar
   isso?". Abaixo, o consumido sobre o alocado e uma barra de progresso.

   **Ordenação por criticidade:** primeiro os estourados, depois os demais por percentual
   consumido decrescente. Orçamentos que atingiram exatamente 100% sem estourar vão para o
   fim, esmaecidos — não há mais decisão a tomar sobre eles. O seletor no cabeçalho permite
   trocar para uma ordem fixa definida pelo usuário.

**Regras da central de avisos** — no máximo 5 visíveis, o restante colapsado em "+ N
avisos". Ordenação por severidade e, dentro da mesma severidade, por valor decrescente:

| Severidade | Gatilho |
|---|---|
| Vermelho | orçamento estourado |
| Amarelo | orçamento com 90% ou mais consumido, ainda não estourado |
| Amarelo | fatura fecha em 2 dias ou menos |
| Azul | há reembolso pendente há mais de 30 dias |
| Cinza | receita prevista do próximo mês não informada |

### 8.2 Áreas

Duas camadas sobre o total gasto do mês:

1. **Composição por orçamento** — barra 100% empilhada horizontal, com 2px de respiro entre
   segmentos, rótulo direto nos segmentos que couberem e legenda com valores absolutos
   abaixo. Clicar num segmento filtra o ranking.
2. **Ranking de subcategorias** — barras horizontais ordenadas por valor, cada uma na cor
   do orçamento-pai, com nome, orçamento de origem, valor e percentual do mês. As 10
   maiores aparecem; o resto colapsa em "Outras N", em cinza.

O número principal é o peso da **subcategoria** no total do mês. O hover revela detalhe:
percentual do mês, percentual dentro do orçamento-pai, contagem de lançamentos e o maior
lançamento individual.

### 8.3 Fluxo

Seis meses para trás e seis para frente, uma coluna por mês representando a sobra. Como o
valor cruza o zero, usa paleta divergente — azul acima da linha, vermelho abaixo, cinza no
zero. Meses futuros recebem textura diagonal, distinguindo projeção de realizado sem
depender de cor. Abaixo, tabela com receita, despesa e sobra mês a mês.

### 8.4 Formulário de lançamento

Campos: valor, descrição, orçamento → subcategoria em cascata, data, e método como chips
(Crédito, Pix, Débito, Dinheiro, Boleto). Selecionar Crédito revela cartão e número de
parcelas. Um toggle marca "a reembolsar".

O rodapé se atualiza em tempo real enquanto o formulário é preenchido:

> Cai em **setembro/2026** · fatura Nubank, fecha 25/ago e vence 05/set · sobram **R$ 260**
> em Alimentação

Numa compra parcelada, mostra "10x de R$200, de setembro/2026 a junho/2027". Esse rodapé é
o que torna a regra de competência compreensível no momento do uso, em vez de um
comportamento inexplicável descoberto depois.

## 9. Paleta

Paleta categórica validada para deficiência de visão de cores nos dois temas, com separação
mínima verificada por script (não por inspeção visual).

| Slot | Claro | Escuro |
|---|---|---|
| 1 | `#2a78d6` | `#3987e5` |
| 2 | `#eb6834` | `#d95926` |
| 3 | `#1baf7a` | `#199e70` |
| 4 | `#eda100` | `#c98500` |
| 5 | `#e87ba4` | `#d55181` |
| 6 | `#008300` | `#008300` |

Regras que decorrem da validação:

- **Apenas 6 orçamentos** recebem cor própria; os demais caem em "Outras", cinza. Acima
  disso as cores deixam de ser distinguíveis sob daltonismo.
- Cores são atribuídas por **entidade** (`BudgetCategory.corSlot`), nunca por posição no
  ranking — filtrar não pode repintar as categorias remanescentes.
- Três slots do tema claro ficam abaixo de 3:1 de contraste, o que **obriga** rótulo
  textual visível em toda marca colorida. Cor nunca é o único portador de informação.
- Subcategorias herdam a cor do orçamento-pai. Nenhuma cor nova é gerada.
- Status (vermelho/amarelo/verde de orçamento) é uma paleta reservada, sempre acompanhada
  de ícone e texto, e nunca reaproveitada como cor de série.

## 10. Autenticação

Auth.js com provedor Google, sessões persistidas no mesmo Postgres do restante do app, em
cookie `httpOnly` com `SameSite=Lax`. Não há tela de cadastro: uma variável de ambiente
define o e-mail autorizado, e qualquer outra conta que tente entrar é rejeitada no callback
de login.

PC e celular funcionam de forma independente — cada dispositivo mantém a própria sessão e
ambos leem o mesmo banco.

## 11. PWA

`manifest.json`, ícones e um service worker enxuto que guarda o *app shell*, o suficiente
para instalar na tela inicial e abrir em tela cheia. Sem sincronização offline: aberto sem
rede, o app exibe aviso claro em vez de aparentar ter salvo algo.

## 12. Testes

Escritos **antes** da implementação nos módulos puros, onde errar é caro e silencioso:

- **competência** — janela de fatura; vencimento no mesmo mês e no mês seguinte; dias 29 a
  31 em meses curtos; compra às 22h não mudando de mês; distribuição de parcelas com resto
  de centavos.
- **orçamento vigente** — herança entre meses, incluindo o cenário ago/set/dez da seção 5;
  mês anterior à primeira alocação; remoção de uma definição.
- **agregação** — despesa líquida com reembolso pendente e recebido; `máx(orçamento,
  comprometido)`; sobra realizada e projetada; receita ausente.

Ponta a ponta com Playwright, três fluxos: entrar no app; lançar compra parcelada no
crédito e conferir a competência de cada parcela; marcar reembolso como recebido e conferir
o estorno no mês correto.

## 13. Robustez

- Validação de esquema em toda server action, antes de tocar o banco.
- Dinheiro em centavos inteiros; nenhum ponto flutuante no domínio.
- Fuso fixo em `America/Sao_Paulo` em todo cálculo de mês.
- Geração de parcelas dentro de uma transação de banco: dez parcelas entram todas ou
  nenhuma.
- Despesas fixas materializadas sob demanda ao abrir o mês, com unicidade por
  `(recorrenciaId, competencia)` garantindo idempotência.

## 14. Organização do código

Três camadas com fronteiras rígidas:

| Camada | Conteúdo | Restrição |
|---|---|---|
| `dominio/` | competência, orçamento vigente, agregações, sobra | não importa Prisma nem React |
| `dados/` | consultas e escritas | não contém regra de negócio |
| `app/` | rotas, telas, server actions | não recalcula regra de domínio |

O domínio desconhece a existência do banco. É isso que o mantém pequeno, rápido de testar e
possível de raciocinar por inteiro.
