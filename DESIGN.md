---
name: Portal Div Pg Pes
description: Portal interno de consultas sobre pagamento de pessoal da DivPag / B Adm Gu Natal
colors:
  army-green: "#2E3D1A"
  army-mid: "#445526"
  army-light: "#6B7A42"
  army-gold: "#A8832A"
  army-gold-light: "#C9A84C"
  army-gold-deep: "#7F6220"
  army-blue: "#002776"
  army-cream: "#F5F2EA"
  army-cream-dark: "#EAE5D5"
  army-charcoal: "#1A1D12"
  surface: "#FFFFFF"
  painel-ink-2: "#4C523E"
  painel-ink-3: "#676D55"
typography:
  wordmark:
    fontFamily: "Playfair Display, serif"
    fontSize: "clamp(0.9375rem, 2vw, 1.375rem)"
    fontWeight: 600
    lineHeight: 1.2
  display:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "clamp(1.875rem, 4vw, 3rem)"
    fontWeight: 600
    lineHeight: 1.1
  heading-lg:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
  heading:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.2
  heading-sm:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.3
  small:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
  caption:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    letterSpacing: "0.14em"
rounded:
  none: "0px"
  focus: "2px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
components:
  header:
    backgroundColor: "{colors.army-green}"
    textColor: "{colors.surface}"
    height: "64px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.army-charcoal}"
    rounded: "{rounded.none}"
    padding: "20px"
  button-primary:
    backgroundColor: "{colors.army-green}"
    textColor: "{colors.surface}"
    rounded: "{rounded.none}"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.army-mid}"
  button-on-dark:
    backgroundColor: "{colors.army-gold-light}"
    textColor: "{colors.army-charcoal}"
    rounded: "{rounded.none}"
    height: "44px"
  input:
    backgroundColor: "{colors.army-cream}"
    textColor: "{colors.army-charcoal}"
    rounded: "{rounded.none}"
    padding: "12px 16px"
---

# Portal Div Pg Pes

## Overview

Ferramenta interna de uma divisão de pagamento militar: quem usa está no expediente, num desktop de repartição, conferindo legislação, relações de folha e protocolos. A linguagem é a de um documento oficial bem impresso: papel creme, tinta verde-oliva, filete dourado, serifa clássica nos títulos e uma sans discreta para o trabalho. Sóbrio, legível e sem ornamento de "app".

Todas as telas (portal, Andrecito, Comparador, Painel DEA) seguem este mesmo mundo. O Painel DEA (`dea/app/painel.html`) tem tokens próprios equivalentes (`--verde`, `--dourado`, `--ground`…) e só muda a pedido explícito.

## Colors

- **Verde (`army-green`)**: cabeçalhos, botões primários, texto de destaque. Hover em `army-mid`.
- **Creme (`army-cream`)**: fundo das páginas e dos campos. Cartões e painéis ficam em branco por cima.
- **Dourado**: três tons com papéis fixos.
  - `army-gold`: filetes, bordas e ícones. Não serve para texto pequeno (dá 3,3:1 no branco).
  - `army-gold-light`: texto e ícones sobre o verde.
  - `army-gold-deep`: texto pequeno dourado sobre fundo claro (5,7:1).
- **Carvão (`army-charcoal`)**: texto principal e rodapé.
- **Texto secundário**: verde ou carvão com opacidade mínima de 75% sobre claro. Branco com 70% ou mais sobre o verde.
- **Estados**: tons do Tailwind em 50 (fundo) e 700 (texto): vermelho para crítico, âmbar para alerta, roxo, azul e rosa para tipos de divergência.

## Typography

- **Playfair Display 600 itálico** só no nome da Divisão, no cabeçalho do portal (assinatura). Não use em nenhum outro lugar.
- **Cormorant Garamond 600** para títulos de página, de seção, de cartão e de modal (escala `display` → `heading-sm`). Itálico para ênfase no título. Nunca abaixo de 1rem nem em caixa-alta.
- **DM Sans** para todo o resto.
- **Piso de 11px** para qualquer texto funcional. O normal fica entre 13px e 14px.
- **Caixa-alta espaçada** (`tracking-[0.14em]`) só em rótulos curtos de 11px, como o "Portal" do botão de voltar e os cabeçalhos de tabela. Nunca em título.
- **Números** em tabela e contagem usam `tabular-nums`. Monoespaçada só para dados (Prec-CP, CPF, valores, texto colado).

## Layout

- Conteúdo com largura máxima de 1600px. Margens laterais de 16px a 32px, conforme o tamanho da tela.
- O cabeçalho dos subsistemas tem 64px: voltar ("← Portal"), divisor de 1px, ícone dourado, título em Cormorant e linha secundária.
- As grades de cartões do portal e do Comparador usam `gap-px` sobre `army-green/10`, então os cartões dividem a mesma linha fina.
- Funciona sem rolagem lateral a partir de 375px.

## Elevation & Depth

Profundidade vem de borda, não de sombra: `border-army-green/10` em repouso e `border-army-gold/40–50` no hover. Sombra (`shadow-2xl`) só em modal, sobre um véu `army-charcoal/60`.

## Shapes

Cantos retos em tudo: cartões, botões, campos, modais e caixas de ícone. `rounded-full` fica só para pílulas, barras de progresso e o círculo do brasão.

## Components

- **Cartão de ação**: fundo branco e caixa de ícone quadrada em creme com borda. No hover, um filete verde de 3px cresce na base, da esquerda para a direita (`scale-x`).
- **Botão primário**: verde, 44px de altura, texto de 13px em peso 600 e caixa normal. Sobre o verde, usa `army-gold-light` com texto carvão.
- **Campo**: fundo creme que vira branco no foco, borda `army-green/15` que vira `army-green` no foco. Sempre com rótulo visível ou `aria-label`.
- **Modal**: `role="dialog"`, `aria-modal` e `aria-labelledby`. Esc fecha, o foco vai para o primeiro controle e há um filete dourado de 2px no topo.
- **Foco**: anel dourado global em `:focus-visible` (`index.css`), que não deve ser removido.
- **Cabeçalho do Andrecito**: o `AndrecitoHeader` é o mesmo nas três telas internas. No celular a navegação desce para uma segunda linha com alvos de 44px e a seção atual marcada com `aria-current`.
- **Coluna lateral** (acervo e departamentos): no desktop é coluna fixa. Abaixo de `md` vira gaveta sobre o conteúdo, aberta por um botão de 44px na barra de busca e fechada por "Voltar à consulta" ou "Ver documentos".

## Do's and Don'ts

- **Faça:** use os tokens `army-*`, sem `slate`/`gray` para texto ou superfície.
- **Faça:** dê nome acessível a todo botão de ícone e rótulo a todo campo.
- **Faça:** deixe todo elemento clicável acessível pelo teclado (`button`, ou `tabIndex={0}` com Enter e Espaço).
- **Não faça:** cantos arredondados, sombras em cartões, borda lateral colorida grossa, Montserrat ou caixa-alta pesada em título.
- **Não faça:** texto abaixo de 11px ou texto secundário abaixo de 4,5:1.
- **Não faça:** indicadores "ao vivo" que não medem nada.
