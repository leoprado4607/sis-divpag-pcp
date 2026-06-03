// Função serverless (Vercel) que faz proxy das chamadas ao Gemini.
// A chave fica APENAS aqui, no servidor (process.env), nunca no bundle do cliente.
// Configure em Vercel → Settings → Environment Variables:
//   API_KEY (ou GEMINI_API_KEY)  — chave do Gemini
//   ALLOWED_ORIGINS              — (opcional) origens extras separadas por vírgula
//   GEMINI_RATE_LIMIT            — (opcional) máx. de requisições por janela (default 20)
//   GEMINI_RATE_WINDOW_SEC       — (opcional) tamanho da janela em segundos (default 60)
import { runGemini, isRequestAllowed, getClientIp } from './_gemini';
import { checkRateLimitAsync } from './_ratelimit';
import { readJsonBody } from './_http';

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
    const text = await runGemini(apiKey, body);
    return res.status(200).json({ text });
  } catch (err: any) {
    console.error('Erro no proxy Gemini:', err?.message || err);
    return res.status(500).json({ error: 'Falha ao processar a requisição de IA.' });
  }
}
