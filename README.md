# SIPP — Portal Div Pg Pes

Portal de informações e ferramentas da **Divisão de Pagamento de Pessoal** do Batalhão de Administração da Guarnição de Natal (B Adm Gu Natal).

SPA em **React + Vite + Tailwind**, hospedada na **Vercel**, com funções serverless para IA (Google Gemini) e escrita protegida no **Supabase**.

Produção: **https://sispagpesbadm.com**

## Sub-aplicações

| Módulo | Descrição |
|---|---|
| **Andrecito** | RAG de legislação militar com Gemini (busca em documentos indexados no Supabase). |
| **Painel DEA** | Dashboard de Despesas de Exercícios Anteriores (dados de planilha Google Sheets). |
| **Comparador** | Cruzamento CPEx × SiCaPEx por CPF (processamento 100% no navegador). |
| **SIPP Notes** | Notas/legislação em HTML rico, sanitizado com DOMPurify. |

## Rodar localmente

Pré-requisitos: Node.js.

```bash
npm install
# Configure o .env a partir do .env.example (ver variáveis abaixo)
npm run dev      # dev server em http://localhost:5173
```

Em dev, o `/api/gemini` é replicado por um plugin do Vite; o `/api/admin` retorna 503 de propósito (o app cai para modo localStorage).

## Scripts

```bash
npm run dev      # servidor de desenvolvimento
npm run build    # build de produção (Vite → dist/)
npm run lint     # type-check (tsc --noEmit)
```

## Deploy (Vercel)

```bash
npx vercel build --prod
npx vercel deploy --prebuilt --prod
# Não usar "vercel --prod" direto: trava no build do servidor.
```

Verificação rápida de saúde: `GET /api/gemini` deve responder **405** (só aceita POST) = função viva.

## Variáveis de ambiente

Ver [.env.example](.env.example) para a lista completa. As críticas:

| Variável | Onde | Uso |
|---|---|---|
| `API_KEY` | Vercel / `.env` | Chave Google Gemini (só servidor) |
| `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` | Vercel / `.env` | Cliente Supabase (leitura, RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel | `/api/admin` (escrita, secreta) |
| `ADMIN_PASSWORD` | Vercel / `.env` | Gate de login do painel admin |
| `UPSTASH_REDIS_REST_URL/TOKEN` | Vercel (opcional) | Rate-limit global do proxy de IA |

## Segurança (resumo)

- **Leitura** pública via `anon key` protegida por RLS; **escrita** só via `/api/admin` com `service_role` + `ADMIN_PASSWORD` (`timingSafeEqual`).
- Chave do Gemini nunca vai ao cliente (proxy serverless).
- Headers fortes (CSP, HSTS, X-Frame-Options) em [vercel.json](vercel.json).
- HTML de notas sanitizado (DOMPurify); saída da IA renderizada sem HTML bruto.

## Arquitetura

Ver [CLAUDE.md](CLAUDE.md) para o detalhamento de views, funções serverless (`api/`), camada de serviços (`services/`) e modelo de dados do Supabase.
