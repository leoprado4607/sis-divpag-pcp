// Função serverless (Vercel) que faz proxy das chamadas ao Gemini.
// A chave fica APENAS aqui, no servidor (process.env), nunca no bundle do cliente.
// Configure em Vercel → Settings → Environment Variables:
//   API_KEY (ou GEMINI_API_KEY)  — chave do Gemini
//   ALLOWED_ORIGINS              — (opcional) origens extras separadas por vírgula
//   GEMINI_RATE_LIMIT            — (opcional) máx. de requisições por janela (default 20)
//   GEMINI_RATE_WINDOW_SEC       — (opcional) tamanho da janela em segundos (default 60)
import { createHash } from 'node:crypto';
import { runGemini, isRequestAllowed, getClientIp } from './_gemini.js';
import { checkRateLimitAsync } from './_ratelimit.js';
import { readJsonBody } from './_http.js';
import { getAdminSupabase } from './_supabaseAdmin.js';

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
    const start = Date.now();
    const text = await runGemini(apiKey, geminiBody);
    const elapsed = Date.now() - start;

    // Grava log de uso de forma assíncrona — nunca bloqueia a resposta ao cliente.
    logQuery(_meta, geminiBody, text, getClientIp(req), elapsed).catch(() => {});

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
  elapsedMs: number,
): Promise<void> {
  if (!meta?.query) return;
  const db = getAdminSupabase();
  if (!db) return;
  const ipHash = createHash('sha256').update(ip).digest('hex').slice(0, 12);
  const tokensEstimated = Math.round((JSON.stringify(body).length + responseText.length) / 4);
  await db.from('andrecito_logs').insert({
    query_text: String(meta.query).slice(0, 1000),
    documents_used: Array.isArray(meta.documents) ? meta.documents : [],
    user_type: meta.userType || 'guest',
    ip_hash: ipHash,
    response_time_ms: elapsedMs,
    tokens_estimated: tokensEstimated,
  });
}
