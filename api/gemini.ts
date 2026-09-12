// Função serverless (Vercel) que faz proxy das chamadas ao Gemini.
// A chave fica APENAS aqui, no servidor (process.env), nunca no bundle do cliente.
// Configure em Vercel → Settings → Environment Variables:
//   API_KEY (ou GEMINI_API_KEY)  — chave do Gemini
//   ALLOWED_ORIGINS              — (opcional) origens extras separadas por vírgula
//   GEMINI_RATE_LIMIT            — (opcional) máx. de requisições por janela (default 20)
//   GEMINI_RATE_WINDOW_SEC       — (opcional) tamanho da janela em segundos (default 60)
import { createHash } from 'node:crypto';
import { runGemini, isRequestAllowed, getClientIp, getClientGeo } from './_gemini.js';
import { checkRateLimitAsync } from './_ratelimit.js';
import { readJsonBody } from './_http.js';
import { getAdminSupabase } from './_supabaseAdmin.js';

// --- CACHE DE RESPOSTAS EM MEMÓRIA ---
// Evita cobrar a mesma consulta + conjunto de documentos mais de uma vez por hora.
// O cache vive na instância serverless (warm): frio após cold-start, mas eficaz
// durante rajadas ou consultas repetidas dentro da mesma sessão da função.
// Chave: SHA-256 do body sem _meta (inclui model + contents + config).
const RESPONSE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora
const RESPONSE_CACHE_MAX = 200;
interface ResponseCacheEntry { text: string; at: number; }
const responseCache = new Map<string, ResponseCacheEntry>();

function buildCacheKey(body: object): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

function getCachedResponse(key: string): string | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > RESPONSE_CACHE_TTL_MS) { responseCache.delete(key); return null; }
  return entry.text;
}

function setCachedResponse(key: string, text: string): void {
  if (responseCache.size >= RESPONSE_CACHE_MAX) {
    // Map preserva ordem de inserção: primeira chave é sempre a mais antiga.
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) responseCache.delete(oldestKey);
  }
  responseCache.set(key, { text, at: Date.now() });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  // 1) Verificação de origem (bloqueia uso a partir de outros sites / chamadas diretas).
  if (!isRequestAllowed(req, process.env.ALLOWED_ORIGINS)) {
    return res.status(403).json({ error: 'Origem não autorizada.' });
  }

  // 2) Rate limiting por IP (distribuído via Upstash se configurado; senão, em memória).
  const max = Number(process.env.GEMINI_RATE_LIMIT) || 20;
  const windowMs = (Number(process.env.GEMINI_RATE_WINDOW_SEC) || 60) * 1000;
  const rl = await checkRateLimitAsync(getClientIp(req), max, windowMs);
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    return res.status(429).json({ error: 'Muitas requisições. Tente novamente em instantes.' });
  }

  try {
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || '';
    const body = await readJsonBody(req);
    const { _meta, ...geminiBody } = body;

    // Verifica cache antes de chamar a API (economiza tokens em consultas repetidas).
    const cacheKey = buildCacheKey(geminiBody);
    const cached = getCachedResponse(cacheKey);
    if (cached) {
      // Hit de cache: devolve sem debitar tokens. O log é AGUARDADO de propósito:
      // em serverless (Vercel) a função é congelada após o response, então um log
      // "fire-and-forget" se perderia. O insert é rápido e não compromete a UX.
      await logQuery(_meta, geminiBody, cached, getClientIp(req), getClientGeo(req), 0, true).catch(() => {});
      return res.status(200).json({ text: cached });
    }

    const start = Date.now();
    const text = await runGemini(apiKey, geminiBody);
    const elapsed = Date.now() - start;

    setCachedResponse(cacheKey, text);

    // Grava log de uso. AGUARDADO de propósito: em serverless (Vercel) a função é
    // congelada/encerrada assim que a resposta é enviada, então um log disparado em
    // "fire-and-forget" frequentemente nunca chega ao Supabase. O insert é rápido e
    // o .catch garante que uma falha de log nunca derrube a resposta ao cliente.
    await logQuery(_meta, geminiBody, text, getClientIp(req), getClientGeo(req), elapsed, false).catch(() => {});

    return res.status(200).json({ text });
  } catch (err: any) {
    console.error('Erro no proxy Gemini:', err?.message || err);
    return res.status(500).json({ error: 'Falha ao processar a requisição de IA.' });
  }
}

async function logQuery(
  meta: any,
  body: any,
  responseText: string,
  ip: string,
  geo: { country: string | null; region: string | null; city: string | null },
  elapsedMs: number,
  fromCache = false,
): Promise<void> {
  if (!meta?.query) return;
  const db = getAdminSupabase();
  if (!db) return;
  const ipHash = createHash('sha256').update(ip).digest('hex').slice(0, 12);
  // Cache hits registram 0 tokens: a resposta veio do cache, não da API.
  const tokensEstimated = fromCache
    ? 0
    : Math.round((JSON.stringify(body).length + responseText.length) / 4);
  await db.from('andrecito_logs').insert({
    query_text: String(meta.query).slice(0, 1000),
    documents_used: Array.isArray(meta.documents) ? meta.documents : [],
    user_type: meta.userType || 'guest',
    ip_hash: ipHash,
    // LGPD: não gravamos mais o IP completo (dado pessoal). Mantemos apenas o
    // hash pseudonimizado (ip_hash, p/ contagem de únicos) e a geo aproximada.
    ip_address: null,
    country: geo.country,
    region: geo.region,
    city: geo.city,
    response_time_ms: elapsedMs,
    tokens_estimated: tokensEstimated,
  });
}
