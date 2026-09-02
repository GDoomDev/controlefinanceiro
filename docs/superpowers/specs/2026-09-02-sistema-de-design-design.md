# Sistema de Design (Tokens) — Design

**Data:** 2026-09-02
**Status:** aprovado, pronto para planejamento de implementação

## 1. Objetivo

Segundo sub-projeto da v2 (o primeiro foi o catálogo de cores de orçamentos, já
mesclado). O pedido do usuário foi amplo — "trabalhar no design de toda a
plataforma" — e a exploração do código mostrou que isso é grande demais para
um plano só. Este sub-projeto cobre a base: um sistema de tokens de design
(cor, tipografia, espaçamento, raio) aplicado a todas as 13 telas existentes.
Ajustes de layout/UX específicos de cada tela ficam para sub-projetos
futuros, um de cada vez.

Problemas concretos hoje:

1. Nenhum token existe além de `--background`/`--foreground` em
   `globals.css`. Cada um dos 13 arquivos `.module.css` (mais alguns estilos
   inline, como as cores de status do Painel) repete cor em hex cru —
   contei ~50 valores distintos, a maioria variações do mesmo cinza.
2. **Dark mode está quebrado na prática**: `globals.css` escurece
   `--background`/`--foreground` sob `prefers-color-scheme: dark`, mas todo o
   resto (bordas, superfícies de card, textos secundários, chips de aviso)
   usa hex fixo de modo claro. Em dark mode o fundo escurece mas o resto
   continua claro.
3. Tipografia é só `Arial, Helvetica, sans-serif` (fallback de sistema) sem
   escala formal — tamanhos de fonte são valores soltos por elemento.
   Curiosamente, o projeto já carrega a fonte Geist via `next/font/google`
   em `layout.tsx`, mas nunca a aplica a `body` — carregada à toa.
4. Espaçamento e raio de borda são ad hoc (raios vistos: 6, 7, 8, 9, 10, 14px;
   sem relação clara entre eles).
5. `src/app/page.module.css` (150 linhas) é sobra do scaffold do
   `create-next-app` — nenhum arquivo o importa (a página raiz de verdade é
   `src/app/(app)/page.tsx`, do route group). Removido como parte desta
   limpeza, por estar diretamente no caminho de "todo CSS do app".

## 2. Escopo

Dentro:
- Tokens de cor (fundo, superfície, borda, texto em 3 níveis, destaque, e os
  quatro tons de severidade/status já usados em avisos — vermelho, amarelo,
  azul, cinza), com variante dark de verdade (não um simples inverter).
- Tokens de tipografia: troca de Geist (carregada, não usada) por Inter via
  `next/font/google` (auto-hospedada no build pelo Next.js — sem depender de
  rede em tempo real, então a preocupação de offline não se aplica depois de
  implementado), aplicada a `body`; escala pequena e fixa de tamanhos.
- Tokens de espaçamento (múltiplos de 4px) e raio (um conjunto pequeno:
  controle pequeno / card / painel-hero / pílula).
- Migração de todo `.module.css` existente e dos estilos inline com hex cru
  (Painel: `VERDE`/`AMBAR`/`VERMELHO`/`CINZA`) para consumir os tokens.
- Remoção de `src/app/page.module.css` (morto) e da fonte Geist não usada.

Fora, deliberadamente:
- Qualquer mudança de layout, estrutura de navegação ou comportamento de
  tela — isso é "pele", não reestruturação.
- A paleta categórica de cor por orçamento (`src/dominio/paleta.ts`,
  `CORES`/`corDoSlot`/`corDaCategoria`) — ela já foi validada para
  daltonismo **nos dois temas** desde a fundação do projeto (comentário no
  próprio arquivo) e usa os mesmos hex em claro e escuro. Não muda aqui.
- Qualquer refinamento específico de tela (nav, hero do Painel, etc.) — vira
  sub-projeto futuro, depois que os tokens existirem.

## 3. Direção visual (decidida com o usuário)

Testadas 3 direções lado a lado (companion visual, com um recorte real do
Painel — hero + cards de orçamento — em cada uma): minimalista refinado,
denso/data-forward (superfície escura, números em mono), e quente/acolhedor
(creme + verde). **Escolhida: minimalista refinado** — mantém a sobriedade
branca/cinza e o azul de marca (`#2a78d6`) de hoje, só com tipografia,
espaçamento e hierarquia reais no lugar do CSS ad hoc atual. Risco baixo,
identidade visual já reconhecível pelo usuário preservada.

Tipografia testada lado a lado (mesmo conteúdo real, duas fontes): sistema
vs. Inter. **Escolhida: Inter.**

## 4. Tokens de cor

CSS custom properties em `globals.css`, dois blocos (`:root` claro, e
`prefers-color-scheme: dark` — mesmo padrão que já existe para
`--background`/`--foreground`, só expandido).

**Papéis, não só nomes de cor** — cada token existe pelo que faz na tela, não
pelo hex que carrega hoje (isso é o que faltava):

- `--cor-fundo` — fundo da página.
- `--cor-superficie` — fundo de card/painel (hoje `#f9fafb`).
- `--cor-superficie-sutil` — fundo de trilha/preenchimento neutro (hoje
  `#f3f4f6`).
- `--cor-borda` — borda padrão de card/divisor (hoje `#e5e7eb`).
- `--cor-texto` — texto primário (hoje `#111827`).
- `--cor-texto-secundario` — rótulo, valor secundário (hoje `#6b7280` — o
  tom mais repetido no código atual, 36 ocorrências).
- `--cor-texto-mudo` — placeholder, texto de menor prioridade (hoje
  `#9ca3af`).
- `--cor-destaque` / `--cor-destaque-hover` — azul de marca, inalterado
  (`#2a78d6` / `#1e5aa8`, já usados no FAB hoje).
- Quatro tons de severidade (fundo/borda/borda-forte/texto cada), um por
  tom já usado em `painel.module.css` hoje: vermelho, amarelo, azul, cinza —
  a mesma paleta que já existe, só formalizada em tokens em vez de repetida
  por classe.

A variante dark **não é um inverter automático**: fundo/superfície ganham
tons escuros neutros de verdade (não preto puro), e os tons de texto e de
severidade são recalculados para contraste — a etapa de implementação inclui
uma verificação de contraste (WCAG AA, ≥4.5:1 para texto normal, ≥3:1 para
texto grande/elementos de interface) antes de fechar os valores exatos, em
vez de assumir que o hex do modo claro escurecido "só funciona".

## 5. Tipografia

`next/font/google` com `Inter` no lugar de `Geist`/`Geist_Mono` (que hoje são
carregadas em `layout.tsx` mas nunca aplicadas a `body` — carga à toa,
removida). Uma variável CSS (`--font-inter`) aplicada a `body`.

Escala pequena e fixa de tamanho (rótulo pequeno, corpo, subtítulo, valor
destacado tipo herói, valor de card) — números seguem usando
`font-variant-numeric: tabular-nums` onde já usam hoje (Painel, Orçamentos).

## 6. Espaçamento e raio

- Espaçamento: escala em múltiplos de 4px (4/8/12/16/20/24/32/40), como
  variáveis CSS. Os valores ad hoc de hoje (8, 9, 10, 11, 12, 14, 16, 20,
  24, 28px) migram para o degrau mais próximo da escala.
- Raio: quatro tokens — controle pequeno (botão, input), card, painel/hero
  (maior), pílula (barra de progresso, badge, FAB) — no lugar dos seis
  valores soltos de hoje (6, 7, 8, 9, 10, 14px).

## 7. Migração

Todo `.module.css` existente (13 arquivos) troca hex/px cru por
`var(--token)`. Os quatro estilos inline com hex cru do Painel
(`VERDE`/`AMBAR`/`VERMELHO`/`CINZA` em `page.tsx`) passam a conter a string
`'var(--cor-sucesso)'` etc. em vez do hex — funciona sem mudança nenhuma no
`style={{color: cor}}` que já existe, e mantém fonte única de verdade no
CSS. Nenhuma tela muda de estrutura, classe ou comportamento — só a origem
dos valores visuais.

## 8. Testes

Mudança é só CSS/tokens — sem lógica nova. Nenhum teste automatizado novo (a
interface já não tem, por convenção do projeto). Verificação:
`tsc --noEmit`, `vitest run`, `lint`, `build` devem continuar limpos
durante toda a migração (nenhuma mudança de lógica deveria quebrá-los).
Conferência visual manual no fim, tela por tela, nos dois temas (claro e
escuro) — item novo na checklist "Ao terminar", já que hoje ninguém nunca
verificou dark mode de verdade.

## 9. Auto-revisão

Sem placeholders, sem seção incompleta. Escopo consistente: nenhuma mudança
de domínio (`src/dominio/`, exceto leitura de `paleta.ts` sem alterá-lo),
nenhuma mudança de `src/dados/` — isto é puramente `src/app/**/*.css` (mais
o `layout.tsx` para a fonte, e a remoção de `page.module.css`).
