# Sistema de Design (Tokens) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir toda cor/raio/tipografia em hex e px crus, espalhados por 13 telas, por um conjunto único de tokens (variáveis CSS) com uma variante dark de verdade — sem mudar layout, estrutura ou comportamento de nenhuma tela.

**Architecture:** Um bloco de tokens (`:root` + `@media (prefers-color-scheme: dark)`) em `src/app/globals.css`. Cada `.module.css` e cada estilo inline com hex cru passa a referenciar `var(--token)` em vez do valor literal. `next/font/google` troca `Geist`/`Geist_Mono` (carregadas hoje, nunca aplicadas) por `Inter`, aplicada a `body`.

**Tech Stack:** CSS Modules (já em uso), CSS custom properties, `next/font/google` (já em uso, só troca de fonte). Nenhuma dependência nova.

## Global Constraints

- **Nenhuma mudança de layout, estrutura de tela ou comportamento.** Isto é
  puramente troca de valor: hex/px crus → `var(--token)`. Se uma tarefa
  achar necessário mudar HTML/JSX estrutural para aplicar um token, pare e
  relate — não é o esperado em nenhuma tarefa deste plano.
- **Nenhuma mudança de hue de cor.** Toda cor clara mantém exatamente o hex
  de hoje (só formalizado em token) — as únicas cores novas são as
  variantes **dark**, calculadas para contraste, nunca "achadas de olho".
- **Regra de encaixe (spacing/raio/tamanho de fonte):** se um valor em px já
  bate exatamente ou fica a ≤2px do token mais próximo, use o token. Se não
  bate em nenhum com essa proximidade, **deixe o valor literal como está** —
  este plano é uma tokenização, não um redesenho, e nenhum elemento deve
  mudar de tamanho visível. Cor não tem essa margem: todo hex cru tem um
  token exato (a tabela de cada tarefa lista todos), não se aplica "deixar
  como está" para cor. **Esta regra vale para TODO `gap`/`padding`/`margin`/
  `border-radius`/`font-size` de todo arquivo `.module.css` tocado em
  qualquer tarefa deste plano** — mesmo quando o Step da tarefa só mostra
  explicitamente a tabela de cor (a maioria dos casos de espaçamento é
  mecânico e segue esta regra sem precisar de uma tabela própria; só os
  casos com uma decisão não óbvia — como os segmentos finos de barra —
  ganham uma nota explícita na tarefa).
- **Cor não muda por contexto além do que a tabela de cada tarefa diz.**
  Duas ocorrências do mesmo hex na mesma tarefa usam o mesmo token, a menos
  que a tabela explicite dois tokens diferentes para o mesmo hex (isso
  acontece quando o mesmo tom serve dois PAPÉIS visuais diferentes — ex.:
  `--cor-destaque` em preenchimento sólido vs. `--cor-destaque-texto` em
  texto/link; a tabela sempre diz qual token usar para qual propriedade
  CSS, `background`/`color`/`border-color`).
- **Teste:** mudança é só CSS/tokens, sem lógica nova — nenhum teste
  automatizado novo. `npx tsc --noEmit`, `npx vitest run`, `npm run lint`,
  `npm run build` devem continuar limpos em toda tarefa. Conferência visual
  manual (claro e escuro) fica para o fim do plano inteiro, não por tarefa
  (ver "Ao terminar").
- **`src/dominio/paleta.ts` (paleta categórica de orçamento) não muda.** Já
  validada para daltonismo nos dois temas desde a fundação do projeto — fora
  de escopo aqui.
- A paleta completa de tokens (valores exatos, claro e escuro) é definida
  uma única vez na Task 1, em `src/app/globals.css`. Toda tarefa seguinte
  **consome** esses tokens pelo nome — nenhuma tarefa redefine ou inventa
  um valor de token novo sem que a Task 1 já o tenha criado. Se uma tarefa
  encontrar um hex sem token correspondente na tabela, isso é uma falha de
  planejamento: pare e relate em vez de inventar um token novo por conta
  própria.

---

## Task 1: Fundação — tokens em `globals.css`, fonte Inter, limpeza

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Delete: `src/app/page.module.css`

**Interfaces:**
- Produces: todo o conjunto de tokens abaixo, consumido por toda tarefa
  seguinte. Nomes e valores são finais — nenhuma tarefa seguinte muda um
  valor definido aqui, só consome.

- [ ] **Step 1: Reescrever `src/app/globals.css` com o bloco completo de tokens**

Substitua o conteúdo inteiro do arquivo por:

```css
:root {
  /* Cor — base neutra */
  --cor-fundo: #ffffff;
  --cor-superficie: #f9fafb;
  --cor-superficie-sutil: #f3f4f6;
  --cor-borda: #e5e7eb;
  --cor-borda-forte: #d1d5db;
  --cor-texto: #111827;
  --cor-texto-forte: #374151;
  --cor-texto-secundario: #6b7280;
  --cor-texto-mudo: #9ca3af;

  /* Cor — destaque de marca (preenchimento sólido: FAB, botões primários) */
  --cor-destaque: #2a78d6;
  --cor-destaque-hover: #1e5aa8;
  /* Uso como texto/link solto sobre o fundo da página — mesmo tom no claro,
     mas precisa de uma variante mais clara no escuro (ver bloco dark) para
     continuar legível; então já nasce como token próprio. */
  --cor-destaque-texto: var(--cor-destaque);

  /* Cor — status sólido (valores/barras: Painel, Fluxo) */
  --cor-status-sucesso: #16a34a;
  --cor-status-aviso: #d97706;
  --cor-status-perigo: #dc2626;

  /* Cor — ênfase adicional (usadas em mais de uma tela, tons próprios) */
  --cor-aviso-banner: #b45309; /* preenchimento sólido: aviso offline */
  --cor-aviso-texto-forte: #b45309; /* texto solto: "canceladas"/"parado" */
  --cor-perigo-texto-forte: #b91c1c; /* texto de erro/perigo mais forte que --cor-status-perigo */

  /* Cor — chips de severidade de aviso (4 tons × 4 papéis, já usados em
     Painel/Estorno/Reembolsos) */
  --cor-severidade-vermelho-fundo: #fef2f2;
  --cor-severidade-vermelho-borda: #fecaca;
  --cor-severidade-vermelho-borda-forte: var(--cor-status-perigo);
  --cor-severidade-vermelho-texto: #991b1b;

  --cor-severidade-amarelo-fundo: #fffbeb;
  --cor-severidade-amarelo-borda: #fde68a;
  --cor-severidade-amarelo-borda-forte: var(--cor-status-aviso);
  --cor-severidade-amarelo-texto: #92400e;

  --cor-severidade-azul-fundo: #eff6ff;
  --cor-severidade-azul-borda: #bfdbfe;
  --cor-severidade-azul-borda-forte: #2563eb;
  --cor-severidade-azul-texto: #1e40af;

  --cor-severidade-cinza-fundo: var(--cor-superficie);
  --cor-severidade-cinza-borda: var(--cor-borda);
  --cor-severidade-cinza-borda-forte: var(--cor-texto-mudo);
  --cor-severidade-cinza-texto: var(--cor-texto-forte);

  /* Cor — distintivos do Reembolsos (tom -100, mais saturado que os chips
     de severidade acima — não são a mesma coisa, não reaproveitar) */
  --cor-distintivo-amarelo-fundo: #fef3c7;
  --cor-distintivo-verde-fundo: #dcfce7;
  --cor-distintivo-verde-texto: #166534;
  --cor-distintivo-azul-fundo: #dbeafe;

  /* Tipografia */
  --fonte-corpo: var(--font-inter), -apple-system, "Segoe UI", Roboto, sans-serif;
  --fonte-tamanho-rotulo: 11px;
  --fonte-tamanho-corpo: 13px;
  --fonte-tamanho-subtitulo: 14px;
  --fonte-tamanho-destaque: 20px;
  --fonte-tamanho-heroi: 28px;

  /* Raio */
  --raio-fino: 4px;
  --raio-controle: 8px;
  --raio-card: 10px;
  --raio-pilula: 999px;

  /* Espaçamento (múltiplos de 4px) */
  --espaco-1: 4px;
  --espaco-2: 8px;
  --espaco-3: 12px;
  --espaco-4: 16px;
  --espaco-5: 20px;
  --espaco-6: 24px;
  --espaco-8: 32px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --cor-fundo: #0b0e14;
    --cor-superficie: #12161f;
    --cor-superficie-sutil: #1a1f2b;
    --cor-borda: #262c3a;
    --cor-borda-forte: #3a4152;
    --cor-texto: #e8eaf0;
    --cor-texto-forte: #c3cad9;
    --cor-texto-secundario: #9aa3b5;
    --cor-texto-mudo: #6b7386;

    --cor-destaque: #2a78d6;
    --cor-destaque-hover: #3f8bdc;
    --cor-destaque-texto: #5b9be0;

    --cor-status-sucesso: #3ecf7a;
    --cor-status-aviso: #e5a53a;
    --cor-status-perigo: #f0645c;

    --cor-aviso-banner: #b45309;
    --cor-aviso-texto-forte: #d2872f;
    --cor-perigo-texto-forte: var(--cor-status-perigo);

    --cor-severidade-vermelho-fundo: #2a1416;
    --cor-severidade-vermelho-borda: #5c2626;
    --cor-severidade-vermelho-borda-forte: var(--cor-status-perigo);
    --cor-severidade-vermelho-texto: #f5a8a3;

    --cor-severidade-amarelo-fundo: #2a2114;
    --cor-severidade-amarelo-borda: #5c4a26;
    --cor-severidade-amarelo-borda-forte: var(--cor-status-aviso);
    --cor-severidade-amarelo-texto: #f0cf8a;

    --cor-severidade-azul-fundo: #141f2a;
    --cor-severidade-azul-borda: #26405c;
    --cor-severidade-azul-borda-forte: #6ba3e8;
    --cor-severidade-azul-texto: #a8cdf5;

    --cor-severidade-cinza-fundo: var(--cor-superficie);
    --cor-severidade-cinza-borda: var(--cor-borda);
    --cor-severidade-cinza-borda-forte: var(--cor-texto-mudo);
    --cor-severidade-cinza-texto: var(--cor-texto-forte);

    --cor-distintivo-amarelo-fundo: #3d3016;
    --cor-distintivo-verde-fundo: #163d23;
    --cor-distintivo-verde-texto: #6fd696;
    --cor-distintivo-azul-fundo: #16283d;
  }
}

html {
  height: 100%;
}

html,
body {
  max-width: 100vw;
  overflow-x: hidden;
}

body {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--cor-texto);
  background: var(--cor-fundo);
  font-family: var(--fonte-corpo);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
  padding: 0;
  margin: 0;
}

a {
  color: inherit;
  text-decoration: none;
}

@media (prefers-color-scheme: dark) {
  html {
    color-scheme: dark;
  }
}
```

- [ ] **Step 2: Trocar Geist por Inter em `src/app/layout.tsx`**

O arquivo hoje carrega `Geist`/`Geist_Mono` mas nunca aplica a variável a
`body` (o `font-family` real vem do `Arial` hardcoded que o Step 1 acabou
de substituir por `var(--fonte-corpo)`). Troque:

```tsx
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
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
    <html lang="pt-BR" className={inter.variable}>
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

`themeColor` fica `"#2a78d6"` sem mudar — é o mesmo valor de
`--cor-destaque` nos dois temas (papel de preenchimento sólido, não muda
entre claro/escuro), então não precisa da forma em array por-tema do
Next.js.

- [ ] **Step 3: Apagar o CSS morto do scaffold**

`src/app/page.module.css` não é importado por nenhum arquivo (a página raiz
de verdade é `src/app/(app)/page.tsx`, do route group — confirmado por
`grep -rn "page.module.css" src/` não retornar nada). Ele carrega, entre
outras coisas, as variáveis `--font-geist-sans`/`--font-geist-mono` que
deixam de existir neste Step. Apague o arquivo:

```bash
git rm src/app/page.module.css
```

- [ ] **Step 4: Verificar contraste de todos os tokens de texto**

Rode este script (verifica cada par texto/fundo contra o mínimo WCAG AA
aplicável — 4.5:1 para texto normal, 3:1 para texto/ícone grande em
preenchimento sólido — e falha se algum par não passar):

```bash
node -e '
function lum(hex) {
  hex = hex.replace("#", "");
  const r = parseInt(hex.slice(0,2),16)/255, g = parseInt(hex.slice(2,4),16)/255, b = parseInt(hex.slice(4,6),16)/255;
  const f = c => c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
  return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b);
}
function ratio(h1, h2) {
  const l1 = lum(h1), l2 = lum(h2);
  const [a,b] = l1 > l2 ? [l1,l2] : [l2,l1];
  return (a+0.05)/(b+0.05);
}
const casos = [
  ["claro: texto/fundo", "#111827", "#ffffff", 4.5],
  ["claro: texto-forte/fundo", "#374151", "#ffffff", 4.5],
  ["claro: texto-secundario/fundo", "#6b7280", "#ffffff", 4.5],
  // #2a78d6 sobre branco é o azul de marca já usado hoje em produção como cor
  // de link (FAB, links de Cartões/Áreas/Orçamentos) — não é um valor novo
  // desta tarefa. Fica a 4.42:1, levemente abaixo do mínimo de texto normal
  // (4.5:1); é uma característica pré-existente do claro, fora de escopo
  // corrigir aqui (nenhuma mudança de hue no claro, ver Global Constraints).
  // Informativo apenas — não gate.
  ["claro: destaque-texto/fundo (pré-existente, informativo)", "#2a78d6", "#ffffff", 0],
  ["claro: branco/destaque (preenchimento)", "#ffffff", "#2a78d6", 3],
  ["claro: aviso-texto-forte/fundo", "#b45309", "#ffffff", 4.5],
  ["claro: branco/aviso-banner (preenchimento)", "#ffffff", "#b45309", 3],
  ["escuro: texto/fundo", "#e8eaf0", "#0b0e14", 4.5],
  ["escuro: texto-forte/fundo", "#c3cad9", "#0b0e14", 4.5],
  ["escuro: texto-secundario/fundo", "#9aa3b5", "#0b0e14", 4.5],
  ["escuro: destaque-texto/fundo", "#5b9be0", "#0b0e14", 4.5],
  ["escuro: branco/destaque (preenchimento)", "#ffffff", "#2a78d6", 3],
  ["escuro: aviso-texto-forte/fundo", "#d2872f", "#0b0e14", 4.5],
  ["escuro: branco/aviso-banner (preenchimento)", "#ffffff", "#b45309", 3],
  ["escuro: status-sucesso/fundo", "#3ecf7a", "#0b0e14", 4.5],
  ["escuro: status-aviso/fundo", "#e5a53a", "#0b0e14", 4.5],
  ["escuro: status-perigo/fundo", "#f0645c", "#0b0e14", 4.5],
  ["escuro: severidade-vermelho-texto/fundo-chip", "#f5a8a3", "#2a1416", 4.5],
  ["escuro: severidade-amarelo-texto/fundo-chip", "#f0cf8a", "#2a2114", 4.5],
  ["escuro: severidade-azul-texto/fundo-chip", "#a8cdf5", "#141f2a", 4.5],
  ["escuro: distintivo-verde-texto/fundo-distintivo", "#6fd696", "#163d23", 4.5],
];
let falhou = false;
for (const [nome, c1, c2, minimo] of casos) {
  const r = ratio(c1, c2);
  const ok = r >= minimo;
  if (!ok) falhou = true;
  console.log((ok ? "OK  " : "FAIL"), nome.padEnd(45), r.toFixed(2), "(mín", minimo + ":1)");
}
process.exit(falhou ? 1 : 0);
'
```

Expected: toda linha `OK`, saída com código 0. Se alguma linha falhar
(`FAIL`), ajuste o hex daquele token no Step 1 (só a variante que falhou —
claro ou escuro) até passar, e rode de novo antes de seguir.

- [ ] **Step 5: Rodar a suíte completa**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`
Expected: os quatro comandos limpos. Nenhuma mudança de lógica ocorreu
nesta tarefa — qualquer erro aqui é regressão real, não esperada.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git rm src/app/page.module.css
git commit -m "feat(design): fundação do sistema de tokens (cor, tipografia, espaçamento, raio)"
```

---

## Task 2: Navegação (casca do app) e aviso offline

**Files:**
- Modify: `src/app/(app)/navegacao.module.css`

**Interfaces:**
- Consumes: todos os tokens de cor da Task 1.

**Mapa de cor (todo hex do arquivo, por ocorrência):**

| Hex atual | Propriedade | Token |
|---|---|---|
| `#e5e7eb` (borda lateral, borda superior mobile) | `border-*-color` | `var(--cor-borda)` |
| `#f3f4f6` (`.link:hover` background) | `background` | `var(--cor-superficie-sutil)` |
| `#374151` (`.link` color) | `color` | `var(--cor-texto-forte)` |
| `#9ca3af` (`.rodape` color) | `color` | `var(--cor-texto-mudo)` |
| `#6b7280` (`.sair` color) | `color` | `var(--cor-texto-secundario)` |
| `#2a78d6` (`.fab` background) | `background` | `var(--cor-destaque)` |
| `#1e5aa8` (`.fab:hover` background) | `background` | `var(--cor-destaque-hover)` |
| `#fff` (`.lateral` background, mobile) | `background` | `var(--cor-fundo)` |
| `#fff` (`.fab` color) | `color` | `var(--cor-fundo)` |
| `#b45309` (`.avisoOffline` background) | `background` | `var(--cor-aviso-banner)` |
| `#fff` (`.avisoOffline` color) | `color` | `var(--cor-fundo)` |

**Raio:** todo `border-radius` do arquivo já está em 7px (`.link`) e 999px
(`.fab`) — mapeiam para `var(--raio-controle)` (7px está a 1px de 8px, dentro
da margem de encaixe) e `var(--raio-pilula)`, respectivamente.

- [ ] **Step 1: Aplicar o mapa de cor e raio acima**

Edite `src/app/(app)/navegacao.module.css` substituindo cada hex/raio pela
`var(--token)` da tabela.

- [ ] **Step 2: Rodar a suíte**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`
Expected: limpo — mudança é só CSS.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/navegacao.module.css"
git commit -m "style(nav): consome tokens de design na casca do app"
```

---

## Task 3: Painel (`/`)

**Files:**
- Modify: `src/app/(app)/painel.module.css`
- Modify: `src/app/(app)/page.tsx:13-16`

**Interfaces:**
- Consumes: tokens de cor da Task 1.

**Mapa de cor — `painel.module.css`:**

| Hex atual | Token |
|---|---|
| `#e5e7eb` | `var(--cor-borda)` |
| `#9ca3af` | `var(--cor-texto-mudo)` |
| `#6b7280` | `var(--cor-texto-secundario)` |
| `#f9fafb` | `var(--cor-superficie)` |
| `#f3f4f6` | `var(--cor-superficie-sutil)` |
| `#dc2626` (`.negativo` color) | `var(--cor-status-perigo)` |
| `#16a34a` (`.positivo` color) | `var(--cor-status-sucesso)` |
| `#fef2f2` / `#fecaca` (`.avisoVermelho`) | `var(--cor-severidade-vermelho-fundo)` / `var(--cor-severidade-vermelho-borda)` |
| `#dc2626` (`.avisoVermelho` border-left-color) | `var(--cor-severidade-vermelho-borda-forte)` |
| `#991b1b` (`.avisoVermelho` color) | `var(--cor-severidade-vermelho-texto)` |
| `#fffbeb` / `#fde68a` (`.avisoAmarelo`) | `var(--cor-severidade-amarelo-fundo)` / `var(--cor-severidade-amarelo-borda)` |
| `#d97706` (`.avisoAmarelo` border-left-color) | `var(--cor-severidade-amarelo-borda-forte)` |
| `#92400e` (`.avisoAmarelo` color) | `var(--cor-severidade-amarelo-texto)` |
| `#eff6ff` / `#bfdbfe` (`.avisoAzul`) | `var(--cor-severidade-azul-fundo)` / `var(--cor-severidade-azul-borda)` |
| `#2563eb` (`.avisoAzul` border-left-color) | `var(--cor-severidade-azul-borda-forte)` |
| `#1e40af` (`.avisoAzul` color) | `var(--cor-severidade-azul-texto)` |
| `#f9fafb` / `#e5e7eb` (`.avisoCinza`) | `var(--cor-severidade-cinza-fundo)` / `var(--cor-severidade-cinza-borda)` |
| `#9ca3af` (`.avisoCinza` border-left-color) | `var(--cor-severidade-cinza-borda-forte)` |
| `#4b5563` (`.avisoCinza` color) | `var(--cor-severidade-cinza-texto)` |

**Raio:** `.heroi` (10px) e `.card` (10px) → `var(--raio-card)`; `.trilha`,
`.cardTrilha`, `.cardPreenchimento` (99px) → `var(--raio-pilula)`; `.aviso`
(8px) → `var(--raio-controle)`; `.vazio` (10px) → `var(--raio-card)`.

**Constantes JS — `page.tsx:13-16`:**

```ts
const VERDE = 'var(--cor-status-sucesso)';
const AMBAR = 'var(--cor-status-aviso)';
const VERMELHO = 'var(--cor-status-perigo)';
const CINZA = 'var(--cor-texto-mudo)';
```

Nenhum outro ponto do arquivo muda — essas constantes já são consumidas
via `style={{ background: cor }}` / `style={{ color: cor }}`, que aceitam
qualquer string CSS válida, incluindo `var(...)`.

- [ ] **Step 1: Aplicar o mapa de cor e raio em `painel.module.css`**

- [ ] **Step 2: Trocar as 4 constantes em `page.tsx` pelas strings `var(--token)` acima**

- [ ] **Step 3: Rodar a suíte**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`
Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/painel.module.css" "src/app/(app)/page.tsx"
git commit -m "style(painel): consome tokens de design"
```

---

## Task 4: Login e tela de erro global

**Files:**
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/(app)/error.tsx`

**Interfaces:**
- Consumes: tokens de cor/raio da Task 1.

`src/app/login/page.tsx` não tem nenhum hex — nada a mudar de cor. Mantido
na mesma tarefa que `error.tsx` só por serem, cada um, uma mudança de uma
linha (nenhuma tela real de layout a revisar em nenhum dos dois).

**Mapa — `error.tsx`:**

| Hex atual | Propriedade | Token |
|---|---|---|
| `#6b7280` (parágrafo) | `color` | `var(--cor-texto-secundario)` |
| `#111827` (botão, background) | `background` | `var(--cor-texto)` |
| `#fff` (botão, color) | `color` | `var(--cor-fundo)` |

Essa dupla (`background: var(--cor-texto)`, `color: var(--cor-fundo)`) é
intencional: o botão usa a cor de texto/fundo da própria página com os
papéis invertidos (texto vira o preenchimento do botão, fundo vira a cor do
texto do botão) — no claro isso reproduz exatamente o hoje (`#111827`/
`#fff`); no escuro isso vira automaticamente um botão claro sobre fundo
escuro, sem precisar de um token novo só para este botão.

**Raio:** `border-radius: 8` no botão → `var(--raio-controle)`.
**Espaçamento:** `padding: 24` no container → `var(--espaco-6)`;
`padding: '10px 16px'` no botão → `padding: 'var(--espaco-2) var(--espaco-4)'`
(10px está a 2px de 8px, dentro da margem de encaixe).

- [ ] **Step 1: Aplicar o mapa acima em `error.tsx`**

- [ ] **Step 2: Confirmar que `login/page.tsx` não precisa de nenhuma mudança**

Leia o arquivo — nenhum hex, nenhum px fora do inline `minHeight: '100dvh'`
(estrutural, não visual). Nenhuma edição necessária.

- [ ] **Step 3: Rodar a suíte**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`
Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add src/app/login/page.tsx "src/app/(app)/error.tsx"
git commit -m "style(login,erro): consome tokens de design"
```

---

## Task 5: Ajustes

**Files:**
- Modify: `src/app/(app)/ajustes/ajustes.module.css`

**Interfaces:**
- Consumes: tokens de cor da Task 1.

**Não mude `src/app/(app)/ajustes/seletor-de-cor.tsx`** — o hex `#2a78d6`
nesse arquivo é o valor semente do seletor de cor personalizada (estado
inicial de um `<input type="color">`, escolhido pelo usuário depois), não
uma cor de tema. Fora de escopo por definição (spec, seção 2).

**Mapa de cor — `ajustes.module.css`:**

| Hex atual | Token |
|---|---|
| `#9ca3af` | `var(--cor-texto-mudo)` |
| `#d1d5db` | `var(--cor-borda-forte)` |
| `#6b7280` | `var(--cor-texto-secundario)` |
| `#fff` | `var(--cor-fundo)` |
| `#e5e7eb` | `var(--cor-borda)` |
| `#b91c1c` | `var(--cor-perigo-texto-forte)` |
| `#111827` | `var(--cor-texto)` |
| `#f3f4f6` | `var(--cor-superficie-sutil)` |

**Raio:** o único raio pequeno do arquivo (`border-radius: 3px`, linha 69)
está a 1px de `var(--raio-fino)` (4px) — use esse token. Os demais raios já
existentes no arquivo (controles/cards) mapeiam para `var(--raio-controle)`
ou `var(--raio-card)` pelo mesmo critério de proximidade.

- [ ] **Step 1: Aplicar o mapa de cor e raio acima**

- [ ] **Step 2: Rodar a suíte**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`
Expected: limpo.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/ajustes/ajustes.module.css"
git commit -m "style(ajustes): consome tokens de design"
```

---

## Task 6: Áreas

**Files:**
- Modify: `src/app/(app)/areas/areas.module.css`

**Interfaces:**
- Consumes: tokens de cor da Task 1.

**Mapa de cor:**

| Hex atual | Token |
|---|---|
| `#6b7280` | `var(--cor-texto-secundario)` |
| `#111827` | `var(--cor-texto)` |
| `#f3f4f6` | `var(--cor-superficie-sutil)` |
| `#9ca3af` | `var(--cor-texto-mudo)` |
| `#fff` | `var(--cor-fundo)` |
| `#f9fafb` | `var(--cor-superficie)` |
| `#e5e7eb` | `var(--cor-borda)` |
| `#d1d5db` | `var(--cor-borda-forte)` |
| `#374151` | `var(--cor-texto-forte)` |
| `#2a78d6` | `var(--cor-destaque-texto)` (confirme a propriedade: se for `color`/link, use este; se for `background` de preenchimento sólido, use `var(--cor-destaque)` — leia a linha antes de decidir) |

**Raio:** o `border-radius: 2px` (linha 104) e os dois `border-radius: 4px`
(linhas 185, 193) são segmentos finos de barra de composição — mapeiam para
`var(--raio-fino)` (4px), não para `var(--raio-controle)` (a diferença
visual entre 2px e 4px num segmento fino é imperceptível; forçar para 8px
mudaria o formato da barra, fora do escopo deste plano).

- [ ] **Step 1: Aplicar o mapa de cor e raio acima**

- [ ] **Step 2: Rodar a suíte**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`
Expected: limpo.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/areas/areas.module.css"
git commit -m "style(areas): consome tokens de design"
```

---

## Task 7: Orçamentos

**Files:**
- Modify: `src/app/(app)/orcamentos/orcamentos.module.css`
- Modify: `src/app/(app)/orcamentos/page.tsx:44`

**Interfaces:**
- Consumes: tokens de cor da Task 1.

**Mapa de cor — `orcamentos.module.css`:**

| Hex atual | Token |
|---|---|
| `#f3f4f6` | `var(--cor-superficie-sutil)` |
| `#9ca3af` | `var(--cor-texto-mudo)` |
| `#6b7280` | `var(--cor-texto-secundario)` |
| `#111827` | `var(--cor-texto)` |
| `#fff` | `var(--cor-fundo)` |
| `#e5e7eb` | `var(--cor-borda)` |
| `#d1d5db` | `var(--cor-borda-forte)` |
| `#2a78d6` | ver a mesma nota da Task 6 sobre `color` vs `background` |

**Raio:** `border-radius: 3px` (linha 55) é o mesmo caso de segmento fino da
Task 6 — use `var(--raio-fino)`.

**`page.tsx:44`** — o parágrafo com
`style={{ fontSize: 12.5, color: '#6b7280', marginTop: 0, marginBottom: 16 }}`
vira:

```tsx
<p style={{ fontSize: 'var(--fonte-tamanho-corpo)', color: 'var(--cor-texto-secundario)', marginTop: 0, marginBottom: 'var(--espaco-4)' }}>
```

(`12.5px` está a 0.5px de `--fonte-tamanho-corpo`, 13px — dentro da margem;
`16px` já é exatamente `--espaco-4`.)

- [ ] **Step 1: Aplicar o mapa de cor/raio em `orcamentos.module.css`**

- [ ] **Step 2: Aplicar a troca acima em `page.tsx:44`**

- [ ] **Step 3: Rodar a suíte**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`
Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/orcamentos/orcamentos.module.css" "src/app/(app)/orcamentos/page.tsx"
git commit -m "style(orcamentos): consome tokens de design"
```

---

## Task 8: Lançamentos — lista e novo lançamento

**Files:**
- Modify: `src/app/(app)/lancamentos/lista.module.css`
- Modify: `src/app/(app)/lancamentos/formulario.module.css`
- Modify: `src/app/(app)/lancamentos/page.tsx:104`
- Modify: `src/app/(app)/lancamentos/novo/page.tsx:18`

**Interfaces:**
- Consumes: tokens de cor da Task 1.

**Mapa de cor — `lista.module.css`:**

| Hex atual | Token |
|---|---|
| `#9ca3af` | `var(--cor-texto-mudo)` |
| `#f3f4f6` | `var(--cor-superficie-sutil)` |
| `#111827` | `var(--cor-texto)` |
| `#fff` | `var(--cor-fundo)` |
| `#e5e7eb` | `var(--cor-borda)` |
| `#dc2626` | `var(--cor-status-perigo)` |
| `#6b7280` | `var(--cor-texto-secundario)` |

**Mapa de cor — `formulario.module.css`:**

| Hex atual | Token |
|---|---|
| `#fff` | `var(--cor-fundo)` |
| `#111827` | `var(--cor-texto)` |
| `#d1d5db` | `var(--cor-borda-forte)` |
| `#fef2f2` | `var(--cor-severidade-vermelho-fundo)` |
| `#fecaca` | `var(--cor-severidade-vermelho-borda)` |
| `#f9fafb` | `var(--cor-superficie)` |
| `#e5e7eb` | `var(--cor-borda)` |
| `#b91c1c` | `var(--cor-perigo-texto-forte)` |
| `#9ca3af` | `var(--cor-texto-mudo)` |
| `#6b7280` | `var(--cor-texto-secundario)` |
| `#374151` | `var(--cor-texto-forte)` |

**`lancamentos/page.tsx:104`** — `color: '#b45309'` (link "estornar") vira
`color: 'var(--cor-aviso-texto-forte)'`.

**`lancamentos/novo/page.tsx:18`** — `color: '#6b7280'` vira
`color: 'var(--cor-texto-secundario)'`.

- [ ] **Step 1: Aplicar os mapas de cor em `lista.module.css` e `formulario.module.css`**

- [ ] **Step 2: Aplicar as duas trocas inline acima**

- [ ] **Step 3: Rodar a suíte**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`
Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/lancamentos/lista.module.css" "src/app/(app)/lancamentos/formulario.module.css" "src/app/(app)/lancamentos/page.tsx" "src/app/(app)/lancamentos/novo/page.tsx"
git commit -m "style(lancamentos): consome tokens de design"
```

---

## Task 9: Estorno

**Files:**
- Modify: `src/app/(app)/lancamentos/[id]/estornar/estorno.module.css`

**Interfaces:**
- Consumes: tokens de cor da Task 1.

**Mapa de cor:**

| Hex atual | Token |
|---|---|
| `#fff` | `var(--cor-fundo)` |
| `#6b7280` | `var(--cor-texto-secundario)` |
| `#d1d5db` | `var(--cor-borda-forte)` |
| `#9ca3af` | `var(--cor-texto-mudo)` |
| `#111827` | `var(--cor-texto)` |
| `#f9fafb` | `var(--cor-superficie)` |
| `#e5e7eb` | `var(--cor-borda)` |
| `#b91c1c` | `var(--cor-perigo-texto-forte)` |
| `#b45309` (`.canceladas`, `color`) | `var(--cor-aviso-texto-forte)` |
| `#991b1b` | `var(--cor-severidade-vermelho-texto)` (confirme: se está associado a um fundo/borda de chip igual ao padrão `.avisoVermelho` do Painel, use este; senão, é o mesmo caso de `--cor-perigo-texto-forte` — leia o contexto da regra antes de decidir) |
| `#2a78d6` | ver nota da Task 6 sobre `color` vs `background` |
| `#1e40af` | `var(--cor-severidade-azul-texto)` |

- [ ] **Step 1: Aplicar o mapa de cor acima**

- [ ] **Step 2: Rodar a suíte**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`
Expected: limpo.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/lancamentos/[id]/estornar/estorno.module.css"
git commit -m "style(estorno): consome tokens de design"
```

---

## Task 10: Cartões

**Files:**
- Modify: `src/app/(app)/cartoes/page.tsx`

**Interfaces:**
- Consumes: tokens de cor da Task 1.

Esta é a única tela sem `.module.css` próprio — todo o estilo é inline.
Mantendo a convenção já usada nas outras telas com estilo inline neste
plano (Painel, Erro, Orçamentos): troque cada hex por `var(--token)` sem
extrair para um arquivo `.module.css` novo — isso seria refatoração
estrutural, fora do escopo deste plano.

**Mapa de cor (toda ocorrência de hex no arquivo):**

| Hex atual | Propriedade | Token |
|---|---|---|
| `#6b7280` (linha 46, parágrafo) | `color` | `var(--cor-texto-secundario)` |
| `#2a78d6` (linha 54, link) | `color` | `var(--cor-destaque-texto)` |
| `#9ca3af` (linha 62, div) | `color` | `var(--cor-texto-mudo)` |
| `#9ca3af` (linha 67, div) | `color` | `var(--cor-texto-mudo)` |
| `#9ca3af` (linha 84, cabeçalho de tabela) | `color` | `var(--cor-texto-mudo)` |
| `#e5e7eb` (linha 87, borderBottom) | `border-bottom` | `var(--cor-borda)` |
| `#f3f4f6` (linha 98, borderBottom) | `border-bottom` | `var(--cor-superficie-sutil)` |
| `#f3f4f6` (linha 104, borderBottom) | `border-bottom` | `var(--cor-superficie-sutil)` |
| `#f3f4f6` (linha 107, borderBottom) | `border-bottom` | `var(--cor-superficie-sutil)` |
| `#9ca3af` (linha 107, span) | `color` | `var(--cor-texto-mudo)` |
| `#f3f4f6` (linha 116, borderBottom) | `border-bottom` | `var(--cor-superficie-sutil)` |
| `#f3f4f6` (linha 123, borderBottom) | `border-bottom` | `var(--cor-superficie-sutil)` |
| `#6b7280` (linha 146, div) | `color` | `var(--cor-texto-secundario)` |
| `#2a78d6` (linha 149, link) | `color` | `var(--cor-destaque-texto)` |

Para as linhas com `border-bottom: '1px solid #hex'`, troque só o hex
dentro da string, mantendo `'1px solid var(--cor-borda)'` (ou
`var(--cor-superficie-sutil)`, conforme a tabela).

- [ ] **Step 1: Ler o arquivo inteiro e aplicar o mapa acima em cada ocorrência**

- [ ] **Step 2: Rodar a suíte**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`
Expected: limpo.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/cartoes/page.tsx"
git commit -m "style(cartoes): consome tokens de design"
```

---

## Task 11: Fluxo

**Files:**
- Modify: `src/app/(app)/fluxo/fluxo.module.css`
- Modify: `src/app/(app)/fluxo/page.tsx:11-13`

**Interfaces:**
- Consumes: tokens de cor da Task 1.

**Mapa de cor — `fluxo.module.css`:**

| Hex atual | Token |
|---|---|
| `#6b7280` | `var(--cor-texto-secundario)` |
| `#f3f4f6` | `var(--cor-superficie-sutil)` |
| `#9ca3af` | `var(--cor-texto-mudo)` |
| `#111827` | `var(--cor-texto)` |
| `#f9fafb` | `var(--cor-superficie)` |
| `#e5e7eb` | `var(--cor-borda)` |
| `#dc2626` | `var(--cor-status-perigo)` |
| `#d1d5db` | `var(--cor-borda-forte)` |
| `#2a78d6` | ver nota da Task 6 sobre `color` vs `background` |

**Raio:** os dois `border-radius: 3px 3px 0 0` (linhas 80, 94) e o
`border-radius: 3px` (linha 146) são o mesmo caso de segmento fino —
`var(--raio-fino)` em todos os quatro valores (`4px 4px 0 0` / `4px`). O
`border-radius: 4px` (linha 117) já bate exato com `var(--raio-fino)`.

**Constantes JS — `page.tsx:11-13`:**

```ts
const AZUL = 'var(--cor-destaque)';
const VERMELHO = 'var(--cor-status-perigo)';
const NEUTRO = 'var(--cor-borda-forte)';
```

- [ ] **Step 1: Aplicar o mapa de cor e raio em `fluxo.module.css`**

- [ ] **Step 2: Trocar as 3 constantes em `page.tsx` acima**

- [ ] **Step 3: Rodar a suíte**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`
Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/fluxo/fluxo.module.css" "src/app/(app)/fluxo/page.tsx"
git commit -m "style(fluxo): consome tokens de design"
```

---

## Task 12: Receitas

**Files:**
- Modify: `src/app/(app)/receitas/receitas.module.css`

**Interfaces:**
- Consumes: tokens de cor da Task 1.

**Mapa de cor:**

| Hex atual | Token |
|---|---|
| `#6b7280` | `var(--cor-texto-secundario)` |
| `#f3f4f6` | `var(--cor-superficie-sutil)` |
| `#9ca3af` | `var(--cor-texto-mudo)` |
| `#111827` | `var(--cor-texto)` |
| `#fff` | `var(--cor-fundo)` |
| `#e5e7eb` | `var(--cor-borda)` |
| `#dc2626` | `var(--cor-status-perigo)` |
| `#d1d5db` | `var(--cor-borda-forte)` |
| `#16a34a` | `var(--cor-status-sucesso)` |

- [ ] **Step 1: Aplicar o mapa de cor acima**

- [ ] **Step 2: Rodar a suíte**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`
Expected: limpo.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/receitas/receitas.module.css"
git commit -m "style(receitas): consome tokens de design"
```

---

## Task 13: Reembolsos

**Files:**
- Modify: `src/app/(app)/reembolsos/reembolsos.module.css`

**Interfaces:**
- Consumes: tokens de cor da Task 1.

**Mapa de cor:**

| Hex atual | Token |
|---|---|
| `#9ca3af` | `var(--cor-texto-mudo)` |
| `#6b7280` | `var(--cor-texto-secundario)` |
| `#f3f4f6` | `var(--cor-superficie-sutil)` |
| `#d1d5db` | `var(--cor-borda-forte)` |
| `#fff` | `var(--cor-fundo)` |
| `#e5e7eb` | `var(--cor-borda)` |
| `#374151` | `var(--cor-texto-forte)` |
| `#111827` | `var(--cor-texto)` |
| `#2a78d6` | ver nota da Task 6 sobre `color` vs `background` |
| `#b45309` (`.parado`, `color`, linha 120) | `var(--cor-aviso-texto-forte)` |
| `#92400e` | `var(--cor-severidade-amarelo-texto)` (confirme: se associado ao mesmo par fundo/borda do `.avisoAmarelo` do Painel, use este) |
| `#1e40af` | `var(--cor-severidade-azul-texto)` |
| `#166534` (texto do distintivo verde) | `var(--cor-distintivo-verde-texto)` |
| `#fef3c7` (fundo do distintivo amarelo) | `var(--cor-distintivo-amarelo-fundo)` |
| `#dcfce7` (fundo do distintivo verde) | `var(--cor-distintivo-verde-fundo)` |
| `#dbeafe` (fundo do distintivo azul) | `var(--cor-distintivo-azul-fundo)` |

- [ ] **Step 1: Aplicar o mapa de cor acima**

- [ ] **Step 2: Rodar a suíte**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`
Expected: limpo.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/reembolsos/reembolsos.module.css"
git commit -m "style(reembolsos): consome tokens de design"
```

---

## Task 14: Mais

**Files:**
- Modify: `src/app/(app)/mais/mais.module.css`

**Interfaces:**
- Consumes: tokens de cor da Task 1.

**Mapa de cor:**

| Hex atual | Token |
|---|---|
| `#6b7280` | `var(--cor-texto-secundario)` |
| `#f9fafb` | `var(--cor-superficie)` |
| `#f3f4f6` | `var(--cor-superficie-sutil)` |
| `#e5e7eb` | `var(--cor-borda)` |
| `#111827` | `var(--cor-texto)` |

Esta é a última tarefa do plano — depois dela, nenhum `.module.css` ou
estilo inline do app deveria ter hex cru fora de
`src/dominio/paleta.ts` (fora de escopo) e do valor semente em
`seletor-de-cor.tsx` (fora de escopo).

- [ ] **Step 1: Aplicar o mapa de cor acima**

- [ ] **Step 2: Confirmar que nenhum hex cru restou fora do escopo**

```bash
grep -rn "#[0-9a-fA-F]\{3,8\}" src/app --include='*.css' --include='*.tsx' \
  | grep -v "src/dominio/paleta.ts" \
  | grep -v "seletor-de-cor.tsx:.*setCorHex\|seletor-de-cor.tsx:.*useState('#"
```

Expected: nenhuma linha — todo hex restante (se houver) deveria já estar
coberto pelas duas exclusões acima. Se algo aparecer, é uma tarefa anterior
incompleta: volte e corrija antes de finalizar esta.

- [ ] **Step 3: Rodar a suíte**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`
Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/mais/mais.module.css"
git commit -m "style(mais): consome tokens de design"
```

---

## Ao terminar

Antes de considerar este sub-projeto pronto, confirme no navegador com
sessão real, nos **dois temas** (claro e escuro — trocar em
Preferências do Sistema/DevTools, já que a troca é só via
`prefers-color-scheme`, sem seletor manual no app):

- [ ] `npx vitest run` passa inteiro, `npx tsc --noEmit`, `npm run lint` e
      `npm run build` limpos
- [ ] Cada uma das 13 telas (Painel, Ajustes, Áreas, Orçamentos,
      Lançamentos — lista/novo/estornar, Cartões, Fluxo, Receitas,
      Reembolsos, Mais, Login, tela de erro) abre sem quebra visual óbvia
      em claro
- [ ] As mesmas 13 telas abrem corretamente em **escuro** — este é o item
      novo: hoje ninguém verificou isso de verdade, e é o motivo original
      deste sub-projeto
- [ ] O aviso de modo offline (desconectar a rede) continua legível nos
      dois temas
- [ ] O texto de qualquer orçamento com cor personalizada (sub-projeto
      anterior) continua legível ao lado do nome, nos dois temas — a
      paleta categórica não mudou, mas o fundo ao redor dela mudou

**Este é o segundo sub-projeto da v2.** Próximos sub-projetos de
visual/UX (refinar telas específicas de novo, agora com os tokens
disponíveis) ficam para depois, um de cada vez.
