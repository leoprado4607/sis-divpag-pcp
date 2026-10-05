// Lógica compartilhada do proxy Gemini (lado servidor) — usada tanto pela função
// serverless do Vercel (api/gemini.ts) quanto pelo plugin de dev do Vite.
// Arquivos iniciados por "_" não viram rotas no Vercel — é só um módulo auxiliar.
import { GoogleGenAI, createPartFromUri } from '@google/genai';

export interface GeminiRequest {
  model?: string;
  contents: any;
  config?: any;
}

// gemini-2.0-flash foi descontinuado (404 "no longer available"); 2.5-flash é o
// fallback ativo quando o cliente não especifica um modelo.
const DEFAULT_MODEL = 'gemini-2.5-flash';

// Teto defensivo de payload. Alinhado ao limite de body de funções serverless da
// Vercel (~4,5 MB): acima disso a própria Vercel rejeita antes de chegar aqui.
export const MAX_BODY_BYTES = 4 * 1024 * 1024; // 4 MB

export async function runGemini(apiKey: string, payload: GeminiRequest): Promise<string> {
  if (!apiKey) throw new Error('Chave de API do Gemini não configurada no servidor.');
  if (!payload || payload.contents == null) {
    throw new Error('Requisição inválida: campo "contents" é obrigatório.');
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: payload.model || DEFAULT_MODEL,
    contents: payload.contents,
    ...(payload.config ? { config: payload.config } : {}),
  });
  return response.text || '';
}

// --- TRANSCRIÇÃO DE PDF DIGITALIZADO ---
// Feita UMA vez por documento (pelo /api/admin) para que PDFs sem camada de texto
// passem a ir às consultas como texto, e não inteiros em base64. O arquivo é lido
// do storage aqui no servidor, então não esbarra no limite de body da Vercel.
// Até 15 MB vai inline; acima disso usa a Files API (limite de ~20 MB por request).
const TRANSCRIBE_MODEL = 'gemini-2.5-flash';
const INLINE_PDF_MAX_BYTES = 15 * 1024 * 1024;

const TRANSCRIBE_PROMPT = `Transcreva INTEGRALMENTE o texto deste documento, página por página, na ordem original.
- Antes do conteúdo de cada página, escreva o marcador [Pag N] (N = número da página).
- Preserve títulos, numeração de artigos, incisos, parágrafos, alíneas, tabelas (em linhas de texto) e valores exatamente como aparecem.
- Não resuma, não comente, não traduza e não acrescente nada que não esteja no documento.
- Trechos ilegíveis: escreva [ilegível].`;

export async function transcribePdf(apiKey: string, data: Blob, mimeType = 'application/pdf'): Promise<string> {
  if (!apiKey) throw new Error('Chave de API do Gemini não configurada no servidor.');
  const ai = new GoogleGenAI({ apiKey });

  let filePart: any;
  let uploadedName: string | undefined;
  if (data.size <= INLINE_PDF_MAX_BYTES) {
    const base64 = Buffer.from(await data.arrayBuffer()).toString('base64');
    filePart = { inlineData: { mimeType, data: base64 } };
  } else {
    const file = await ai.files.upload({ file: data, config: { mimeType } });
    uploadedName = file.name;
    // PDFs grandes passam por processamento antes de poderem ser usados.
    let state = file.state;
    for (let i = 0; i < 60 && state === 'PROCESSING' && file.name; i++) {
      await new Promise(r => setTimeout(r, 2000));
      state = (await ai.files.get({ name: file.name })).state;
    }
    if (state === 'FAILED' || !file.uri) throw new Error('O Gemini não conseguiu processar o arquivo.');
    filePart = createPartFromUri(file.uri, file.mimeType || mimeType);
  }

  try {
    const response = await ai.models.generateContent({
      model: TRANSCRIBE_MODEL,
      contents: [{ role: 'user', parts: [filePart, { text: TRANSCRIBE_PROMPT }] }],
      config: {
        temperature: 0,
        maxOutputTokens: 65536,
        // Transcrição não precisa de raciocínio: todo o orçamento vai para o texto.
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    return (response.text || '').trim();
  } finally {
    if (uploadedName) await ai.files.delete({ name: uploadedName }).catch(() => {});
  }
}

// --- VERIFICAÇÃO DE ORIGEM ---
// Garante que apenas o próprio front (mesma origem) ou origens explicitamente
// permitidas (env ALLOWED_ORIGINS) possam usar o endpoint via navegador.
function originOf(url?: string): string | null {
  if (!url) return null;
  try { return new URL(url).origin; } catch { return null; }
}

export function isRequestAllowed(req: any, allowedEnv?: string): boolean {
  const headers = req.headers || {};
  const host = headers.host;

  const allowed = new Set<string>(
    (allowedEnv || '').split(',').map((s) => s.trim()).filter(Boolean),
  );
  // Mesma origem do deploy é sempre permitida.
  if (host) {
    allowed.add(`https://${host}`);
    allowed.add(`http://${host}`);
  }
  if (typeof process !== 'undefined' && process.env && process.env.VERCEL_URL) {
    allowed.add(`https://${process.env.VERCEL_URL}`);
  }

  // Navegadores enviam Origin em POST; usamos Referer como reserva.
  const reqOrigin = originOf(headers.origin) || originOf(headers.referer);

  // Sem Origin nem Referer = chamada direta (curl/script), não do nosso front: bloqueia.
  if (!reqOrigin) return false;
  return allowed.has(reqOrigin);
}

// --- RATE LIMITING (best-effort, em memória por instância) ---
// Observação: funções serverless escalam em múltiplas instâncias, então este
// limite é por instância — protege contra rajadas, mas para limite global estrito
// use um store compartilhado (Vercel KV / Upstash Redis).
interface RateState { count: number; resetAt: number; }
const rateBuckets = new Map<string, RateState>();
const MAX_BUCKETS = 10000;

export function getClientIp(req: any): string {
  const headers = req.headers || {};
  const xff = headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  if (Array.isArray(xff) && xff.length) return String(xff[0]).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

// Geolocalização do cliente a partir dos headers que a Vercel injeta automaticamente
// na borda (sem custo / sem API externa). Em ambiente local esses headers não existem
// e os campos voltam null.
export function getClientGeo(req: any): {
  country: string | null;
  region: string | null;
  city: string | null;
} {
  const h = req.headers || {};
  const pick = (v: any): string | null => {
    const s = Array.isArray(v) ? v[0] : v;
    if (typeof s !== 'string' || !s.trim()) return null;
    try { return decodeURIComponent(s.trim()); } catch { return s.trim(); }
  };
  return {
    country: pick(h['x-vercel-ip-country']),
    region: pick(h['x-vercel-ip-country-region']),
    city: pick(h['x-vercel-ip-city']),
  };
}

export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();

  // Limpeza oportunista para a Map não crescer sem limite.
  if (rateBuckets.size > MAX_BUCKETS) {
    for (const [k, v] of rateBuckets) {
      if (now >= v.resetAt) rateBuckets.delete(k);
    }
  }

  const bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (bucket.count >= max) {
    return { allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count++;
  return { allowed: true, retryAfterSec: 0 };
}
