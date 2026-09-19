# Painel DEA — identidade visual

Referência completa do sistema visual, extraída do `painel.html` em 19/09/2026.
Serve para dois fins: **integrar o painel ao site sem que ele destoe**, e permitir
uma reconstrução nativa futura sem perder a aparência.

Tudo já está no `painel.html` como CSS puro, sem framework, sem build. Se o port
for só servir o arquivo, **não é preciso fazer nada com este documento** — ele é
para quando alguém for mexer na aparência ou reimplementar.

---

## 1. O caráter

Institucional militar, não corporativo de dashboard. Três escolhas sustentam isso:

- **Nada é arredondado.** Só existem `border-radius: 50%` no brasão e no ponto
  pulsante do cabeçalho; todo o resto é canto vivo, inclusive campos de formulário
  (há um `border-radius:0` explícito para vencer o padrão do navegador). Arredondar
  botões e cartões descaracteriza o painel imediatamente.
- **Serifa para hierarquia, sem serifa para trabalho.** Títulos e números grandes
  em Cormorant Garamond; tabelas, rótulos e controles em DM Sans.
- **Verde e dourado do brasão**, não azul de sistema.

---

## 2. Paleta

Declarada em `:root`, toda referenciada por variável. Trocar aqui repinta o painel inteiro.

### Superfícies e texto

| Token | Valor | Uso |
|---|---|---|
| `--ground` | `#F5F2EA` | fundo da página (creme, não branco) |
| `--surface` | `#FFFFFF` | cartões, tabelas, controles |
| `--surface-2` | `#FAF8F2` | zebra de tabela, corpo de grupo aberto, notas |
| `--ink` | `#1A1D12` | texto principal |
| `--ink-2` | `#4C523E` | texto secundário |
| `--ink-3` | `#7C8269` | texto terciário, rótulos, vazios |
| `--line` | `rgba(46,61,26,.14)` | divisórias leves |
| `--line-forte` | `rgba(46,61,26,.28)` | bordas de campo e de barra |

### Marca

| Token | Valor | Uso |
|---|---|---|
| `--verde` | `#2E3D1A` | cabeçalho, cabeçalho de tabela, botão primário |
| `--verde-claro` | `#3F5427` | hover do verde |
| `--dourado` | `#A8832A` | filete do cabeçalho, aba ativa, foco, filete das notas |
| `--dourado-c` | `#C9A84C` | hover do dourado, seta de ordenação |

### Situação — o código de cores que o usuário lê

| Token | Valor | Significado |
|---|---|---|
| `--ok` / `--ok-bg` | `#2F6B3A` / `#ECF3ED` | **pago** — encerrado |
| `--critico` / `--critico-bg` | `#9E2A1F` / `#FAEDEB` | **rejeitado**, grupo em risco, retrocesso |
| `--alerta` / `--alerta-bg` | `#8A5A12` / `#FAF2E1` | **em andamento**, atenção |
| `--neutro` / `--neutro-bg` | `#6E7360` / `#F0EFE8` | **excluído**, neutro |

**Esse mapeamento é semântico, não decorativo.** Verde significa dinheiro na conta.
Trocar as cores de lugar inverte a leitura de 3.421 processos.

O quinto estado, `aguardando CPEx`, não tem cor própria: usa **hachura diagonal**
(`repeating-linear-gradient` 45°, `#F0EFE8`/`#E7E5DB`) para dizer "ainda não avaliado"
sem sugerir bom ou ruim.

---

## 3. Tipografia

Carregadas do Google Fonts:

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap">
```

- `--serif: 'Cormorant Garamond', Georgia, 'Times New Roman', serif`
- `--sans: 'DM Sans', Inter, system-ui, -apple-system, Segoe UI, sans-serif`

**Se a intranet não tiver saída para a internet**, as fontes caem para Georgia e
system-ui. O painel continua funcionando, com outra aparência. Ver §8.

### Escala aplicada

| Elemento | Família | Tamanho | Peso |
|---|---|---|---|
| `.titulo` (cabeçalho) | serifa | 1.2rem | 600 |
| `.secao-tit` (título de aba) | serifa | 1.35rem | 600 |
| `.rel-tit` (capa do PDF) | serifa | 2.1rem | 700 |
| `.alerta-num` (número da faixa de alerta) | serifa | 2rem | 600 |
| `.hist-tot` (total do dia no histórico) | serifa | 1.5rem | 600 |
| corpo | sem serifa | 14px | 400 |
| `.aba` | sem serifa | .82rem | 500 |
| `.selo` (situação) | sem serifa | .7rem | 500 |
| `.veredito` (Em risco / Resolvido) | sem serifa | .7rem | 600, caixa alta, `letter-spacing:.1em` |
| `.dias-selo` | sem serifa | .72rem | 600 |
| `.rotulo` / `.sobretitulo` | sem serifa | 9px | 600 / 500, caixa alta, `letter-spacing:.14em` |

**Todo número usa `font-variant-numeric: tabular-nums`** — valores, datas, contagens,
Prec-cp. É o que faz as colunas alinharem. Não remova ao reimplementar.

---

## 4. Espaçamento

Escala única, em variáveis:

```
--s1:4px  --s2:8px  --s3:12px  --s4:16px  --s5:24px  --s6:32px  --s7:48px
```

Larguras: conteúdo `max-width:1500px`; relatório A4 retrato `840px`, paisagem `1120px`.

---

## 5. Componentes

**Cabeçalho** (`.topo`) — fixo no topo, fundo `--verde`, filete inferior de 2px
`--dourado`, altura mínima 72px. Brasão em círculo de 52px (imagem embutida como
data-URI WebP no próprio HTML — não é arquivo externo, não quebra ao mover). À
direita, a pastilha "Atualizado em …" com ponto verde pulsante (2,4s).

**Barra de segmento** (`.segbar`) — primeiro elemento da página. Três chips
alternáveis: Veteranos / Pensionistas / Ativa. Chip ativo = fundo `--verde`, texto
branco. **O recorte vale para todas as abas simultaneamente.**

**Abas** (`.abas`) — rolagem horizontal, aba ativa com filete dourado embaixo.
Cada aba tem um selo `.cnt` com a contagem; abas com `.urgente` mostram o selo em
vermelho. Hoje são urgentes: Prec-cp repetido, Entre anos, Homologados (quando > 0)
e Fila de homologação (quando há parado).

**Nota** (`.nota`) — bloco explicativo com filete lateral dourado de 3px. Aparece
no topo de cada aba explicando a regra daquela tela. Variante `.nota.vazio` com
filete cinza para estados vazios.

**Grupo** (`.grupo`) — cartão com borda esquerda de 4px na cor do status. Cabeçalho
clicável (nome, Prec-cp, ano, quantidade, faixa de valor, selos de contagem, veredito),
corpo carregado só ao abrir.

**Faixa de alerta** (`.alerta-faixa`) — usada na Fila de homologação. Três colunas:
número grande em serifa, texto explicativo, lista de protocolos à direita. Borda
esquerda de 4px: vermelha (crítico), dourada (novidade), verde (calmo).

**Tabelas** — cabeçalho verde fixo (`position:sticky`), rótulos 9px caixa alta,
zebra em `--surface-2`, valores alinhados à direita.

---

## 6. Relatórios em PDF

Não há biblioteca de PDF. O painel monta um documento A4 no próprio DOM
(`#relatorio`, com `modo-relatorio` no `body`) e chama `window.print()`.

Decisões que custaram iteração e **não devem ser desfeitas sem motivo**:

- Tabela com `table-layout:auto` e cabeçalho curto ("Situação (DEA)"). Com largura
  fixa, data e valor empurram a tabela para fora da margem.
- Dentro da tabela, situação é **texto com filete lateral, não pílula**. A pílula
  quebrava "Analisado e Rejeitado / Restituído à OM/OP" em quatro linhas e levava
  o relatório de 36 para 47 páginas.
- A explicação do veredito é **legenda na folha de rosto**, não parágrafo por grupo.
- `overflow-wrap:anywhere` **só no parecer** — na tabela inteira, partia nomes.
- "Alterações do dia", "Histórico", "Homologados" e "Fila de homologação" saem em
  **paisagem**; o resto em retrato.
- Pareceres vazios ou "ND" não viram linha.

Se o `print()` programático for bloqueado, a pré-visualização fica na tela com a
barra "Salvar em PDF" e o Ctrl+P resolve — por isso o botão nunca falha em silêncio.

---

## 7. Acessibilidade e comportamento

- `role="tablist"` / `role="tab"` / `aria-selected` nas abas; `aria-pressed` nos chips;
  `aria-expanded` nos grupos.
- Foco visível: `outline: 2px solid var(--dourado)` com `outline-offset: 2px`.
- `@media (prefers-reduced-motion: reduce)` desliga animação e transição.
- `localStorage` guarda só a aba aberta (`dea_aba`), dentro de `try/catch`.
- Layout responsivo por `@media(min-width:900px)` e `(min-width:1000px)`.

---

## 8. Ao integrar ao site

**Colisão de CSS.** O painel usa nomes curtos e genéricos (`.aba`, `.nota`, `.chip`,
`.selo`, `.grupo`, `.btn`). Se for embutido numa página que já tem CSS próprio, há
risco real de conflito. Duas saídas:

1. **`<iframe>`** — isolamento total, zero conflito, e o painel continua sendo o
   arquivo original sem modificação. É o caminho recomendado para o port.
2. **Prefixar** todas as classes (ex.: `dea-aba`) — mais trabalho e cria divergência
   com este pacote.

**Fontes offline.** Para não depender do Google (e para o painel não mudar de cara
numa intranet fechada), baixe as duas famílias, sirva de uma pasta local e troque o
`<link>` por um `@font-face`. Os fallbacks já declarados evitam quebra enquanto isso
não é feito.

**Impressão.** Se o site injetar cabeçalho/rodapé próprios na página, eles vão sair
nos relatórios. O `body.modo-relatorio` esconde os elementos do painel, mas não
conhece os do site — acrescente os seletores do site àquela regra.
