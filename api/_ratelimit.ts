// Rate limiting DISTRIBUÍDO (global) via Upstash Redis quando configurado.
// Se as variáveis de ambiente do Upstash/Vercel KV não existirem, faz fallback
// gracioso para o limite em memória por instância (checkRateLimit de _gemini.ts),
// para não quebrar o dev nem deploys sem KV.
//
// Para ativar o limite global (recomendado em produção):
//   1. Vercel → Storage → criar um banco "Upstash for Redis" (Marketplace).
//   2. Conectar ao projeto: as envs UPSTASH_REDIS_REST_URL/TOKEN (ou
//      KV_REST_API_URL/TOKEN) são injetadas automaticamente.
import { checkRateLimit } from './_gemini';

interface RateResult { allowed: boolean; retryAfterSec: number; }

let initialized = false;
let limiter: any = null;

async function getDistributedLimiter(max: number, windowSec: number): Promise<any> {
  if (initialized) return limiter;
  initialized = true;

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    limiter = null; // sem KV → usa fallback em memória
    return null;
  }

  try {
    // Imports dinâmicos: só carregam o SDK do Upstash quando o KV está configurado.
    const { Redis } = await import('@upstash/redis');
    const { Ratelimit } = await import('@upstash/ratelimit');
    const redis = new Redis({ url, token });
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(max, `${windowSec} s` as any),
      prefix: 'gemini-proxy',
      analytics: false,
    });
  } catch (e: any) {
    console.error('[ratelimit] Upstash indisponível, usando limite em memória:', e?.message || e);
    limiter = null;
  }
  return limiter;
}

export async function checkRateLimitAsync(
  key: string,
  max: number,
  windowMs: number,
): Promise<RateResult> {
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  const rl = await getDistributedLimiter(max, windowSec);

  if (rl) {
    try {
      const r = await rl.limit(key);
      return {
        allowed: r.success,
        retryAfterSec: r.success ? 0 : Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)),
      };
    } catch (e: any) {
      // Falha de rede no Upstash não deve derrubar o endpoint: cai para o limite local.
      console.error('[ratelimit] Falha no Upstash, fallback em memória:', e?.message || e);
      return checkRateLimit(key, max, windowMs);
    }
  }

  return checkRateLimit(key, max, windowMs);
}
