# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # dev server (localhost:5173) — inclui mock de /api/gemini via plugin Vite
npm run build     # build de produção (Vite → dist/)
npm run lint      # type-check TypeScript (tsc --noEmit)
```

**Deploy:**
```bash
vercel build --prod && vercel deploy --prebuilt --prod
# --prod no build: usa as variáveis de ambiente de produção (sem ele, o build sai com as de preview).
# Não usar "vercel --prod" direto: trava no build do servidor.
```

## Arquitetura

SPA React + Tailwind hospedada na Vercel. Não há Next.js nem roteador de URL — a navegação é controlada por `currentView` em [App.tsx](App.tsx) usando `React.lazy` para carregamento de cada sub-app.

### Sub-aplicações (views)

| View | Componente | Descrição |
|---|---|---|
| `home` | `App.tsx` | Portal com cards de acesso |
| `andrecito-app` | `components/andrecito/AndrecitoApp.tsx` | RAG de legislação militar com Gemini |
| `dea-dashboard` | `components/dashboard/DeaDashboard.tsx` | Login + iframe do Painel DEA (ver seção abaixo) |
| `comparison-app` | `components/comparison/ComparisonApp.tsx` | Comparação CPEx × SiCaPEx |

### Funções serverless (`api/`)

Três endpoints Vercel (Node.js):

- **`/api/gemini`** — Proxy seguro para Google Gemini. Mantém `API_KEY` no servidor. Tem rate-limit por IP (Upstash Redis ou em memória) e cache de respostas em memória (1h, max 200 entradas). Loga cada consulta na tabela `andrecito_logs` do Supabase.
- **`/api/admin`** — Operações de escrita do Andrecito (CRUD de categorias/docs, upload com Signed URL, analytics). Requer header `x-admin-token` validado contra `ADMIN_PASSWORD` com `timingSafeEqual`.

- **`/api/dea`** — Login do Painel DEA (senhas em `DEA_PASSWORD`/`DEA_ADMIN_PASSWORD`, validadas no servidor) e cookie de sessão HMAC com o papel (leitor/admin) assinado. Admin pode disparar e acompanhar a atualização. Também atende `/dea/painel` e `/dea/dados.js` (rewrites no `vercel.json`), que só respondem com sessão válida.

Helpers internos (prefixo `_`): `_gemini.ts`, `_ratelimit.ts`, `_http.ts`, `_supabaseAdmin.ts`.

**Em dev** (`npm run dev`): o plugin `geminiDevApi` em `vite.config.ts` replica o `/api/gemini`. O `/api/admin` retorna 503 intencionalmente → o sistema cai para modo localStorage.

### Camada de serviços (`services/`)

- **`andrecitoService.ts`** — Serviço principal do Andrecito: busca categorias/documentos, extrai texto de PDFs (pdf.js carregado sob demanda), cache de texto em localStorage (TTL 1 dia), pontuação de relevância por token antes de enviar ao Gemini, e fallback local completo quando Supabase ou `/api/admin` estão indisponíveis.
- **`geminiClient.ts`** — `callGemini()`: faz POST para `/api/gemini`.
- **`adminClient.ts`** — `adminRequest()`: faz POST para `/api/admin` com o token. Lança `AdminUnavailableError` em 404/503 para ativar fallback local.
- **`supabaseClient.ts`** — Cria o cliente anon do Supabase (leitura pública, RLS).
- **`csvUtils.ts`** — Parse de CSV com números no formato BR (1.000,00).

### Modo offline/demo

`andrecitoService.ts` tem seeds hardcoded (`INITIAL_CATEGORIES`, `INITIAL_DOCUMENTS`, `INITIAL_TEXT_CACHE`). Se o Supabase não estiver configurado ou o backend admin retornar 404/503, todas as operações usam localStorage como banco local. Isso permite rodar o sistema sem nenhuma variável de ambiente configurada.

## Painel DEA ("Exercícios Anteriores")

Pacote portado em [dea/](dea/) — leia [dea/LEIA-PRIMEIRO.md](dea/LEIA-PRIMEIRO.md) e [dea/docs/NOTAS-DOMINIO.md](dea/docs/NOTAS-DOMINIO.md). **`dea/app/build_data.py` e `dea/app/painel.html` só mudam a pedido explícito do usuário** (testados contra os dados reais); toda mudança de regra vai registrada no `NOTAS-DOMINIO.md`.

- `dados.js` (nome, Prec-cp e valor de milhares de pessoas) e o estado (`snapshot-anterior.json`, `historico.json`, insubstituíveis) vivem **só** no bucket privado `dea-privado` do Supabase — nunca no repositório, em `public/` ou em bucket público.
- Atualização **só manual** (sem agendamento): o admin (login com `DEA_ADMIN_PASSWORD`) clica em "Atualizar" → `/api/dea` dispara a GitHub Action [dea-atualizar.yml](.github/workflows/dea-atualizar.yml) via `workflow_dispatch` (token `DEA_GITHUB_TOKEN`) → `supabase_sync.py baixar` → `atualizar.py` (intocado) → `supabase_sync.py enviar`. A barra acompanha o status e recarrega o iframe ao terminar.
- Em dev, `DEA_DADOS_LOCAL` aponta para um `dados.js` fora do repositório.
- **Resolvidos manualmente:** o admin (sessão admin + senha redigitada) tira do painel um grupo sem pagamento; a lista fica em `manual/resolvidos.json` no bucket privado e o `/api/dea` a anexa ao `dados.js`. O painel não faz requisições (CSP `connect-src 'none'`): os botões falam com o `DeaDashboard.tsx` por `postMessage`. Detalhes em [dea/docs/NOTAS-DOMINIO.md](dea/docs/NOTAS-DOMINIO.md).

## Banco de dados (Supabase)

Schema atual: [andrecito_schema.sql](andrecito_schema.sql)

Tabelas: `categories`, `subcategories`, `documents`, `andrecito_logs`.

Storage bucket: `documents` (público para leitura; uploads via Signed Upload URL gerada pelo `/api/admin`).

**Regra de acesso:** a `anon key` (pública, vai no bundle via `VITE_*`) só lê. Escritas passam obrigatoriamente pelo `/api/admin` que usa `SUPABASE_SERVICE_ROLE_KEY` (secreta, nunca com prefixo `VITE_`).

## Variáveis de ambiente

Ver [.env.example](.env.example) para a lista completa. As mais críticas:

| Variável | Onde | Uso |
|---|---|---|
| `API_KEY` | Vercel / `.env` | Chave Google Gemini (só servidor) |
| `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` | Vercel / `.env` | Cliente Supabase (bundle) |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel | `/api/admin` (escrita, secreta) |
| `ADMIN_PASSWORD` | Vercel / `.env` | Gate de login do painel admin |

## Tema / Design

Paleta `army-*` definida em [tailwind.config.js](tailwind.config.js). Fontes: Cormorant Garamond (títulos) + Inter (corpo), carregadas via CDN no [index.html](index.html).
