// Núcleo do Painel DEA ("Exercícios Anteriores"): login, sessão e entrega
// PROTEGIDA do painel.html e do dados.js.
//
// POR QUE ISTO EXISTE
// -------------------
// O dados.js traz nome, Prec-cp e valor de milhares de pessoas. Ele NUNCA pode
// ficar num caminho público (public/, bucket público, CDN): a página pedir senha
// não adianta se o arquivo de dados for alcançável pela URL. Por isso:
//   - o dados.js mora num bucket PRIVADO do Supabase (só a service_role lê);
//   - o painel.html e o dados.js só saem por esta função, e só com um cookie de
//     sessão assinado (HMAC), emitido após a senha ser validada NO SERVIDOR.
//
// Escrito só com APIs cruas do Node (statusCode/setHeader/end) para rodar igual
// na Vercel (api/dea.ts) e no servidor de dev do Vite (vite.config.ts).
//
// Env:
//   DEA_PASSWORD               senha(s) de acesso, separadas por vírgula (SECRETA, sem VITE_)
//   DEA_SESSION_SECRET         (opcional) chave do HMAC da sessão; se ausente, é derivada
//                              de DEA_PASSWORD + SUPABASE_SERVICE_ROLE_KEY
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   leitura do bucket privado
//   DEA_DADOS_LOCAL            (SÓ em dev, ignorada na Vercel) caminho de um dados.js local
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRequestAllowed, getClientIp } from './_gemini.js';
import { checkRateLimitAsync } from './_ratelimit.js';
import { readJsonBody } from './_http.js';

export const DEA_BUCKET = 'dea-privado';
export const DEA_DADOS_PATH = 'publicado/dados.js';

const COOKIE = 'dea_sessao';
const SESSAO_MS = 8 * 60 * 60 * 1000; // 8h
const LOGIN_MAX = 10;                  // tentativas de senha...
const LOGIN_JANELA_MS = 15 * 60 * 1000; // ...por IP a cada 15 min

function send(res: any, status: number, body: string | Buffer, headers: Record<string, string> = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(body);
}

function sendJson(res: any, status: number, obj: unknown, headers: Record<string, string> = {}) {
  send(res, status, JSON.stringify(obj), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function senhas(): string[] {
  return (process.env.DEA_PASSWORD || '').split(',').map((s) => s.trim()).filter(Boolean);
}

// Compara contra TODAS as senhas (sem curto-circuito) para não vazar, pelo tempo
// de resposta, qual delas casou ou quantas existem.
function senhaValida(tentativa: string): boolean {
  let ok = false;
  for (const s of senhas()) ok = safeEqual(tentativa, s) || ok;
  return ok;
}

function chaveSessao(): Buffer {
  const base = process.env.DEA_SESSION_SECRET
    || `${process.env.DEA_PASSWORD || ''}|${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`;
  // Trocar a senha (ou o segredo) invalida todas as sessões abertas.
  return createHash('sha256').update('dea-sessao|' + base).digest();
}

function assinar(payload: string): string {
  return createHmac('sha256', chaveSessao()).update(payload).digest('base64url');
}

function emitirToken(): string {
  const payload = `v1.${Date.now() + SESSAO_MS}`;
  return `${payload}.${assinar(payload)}`;
}

function lerCookie(req: any, nome: string): string {
  const raw = String(req.headers?.cookie || '');
  for (const parte of raw.split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nome) return parte.slice(i + 1).trim();
  }
  return '';
}

export function sessaoValida(req: any): boolean {
  if (senhas().length === 0) return false;
  const token = lerCookie(req, COOKIE);
  const m = /^(v1\.(\d+))\.([A-Za-z0-9_-]+)$/.exec(token);
  if (!m) return false;
  if (Number(m[2]) < Date.now()) return false;
  return safeEqual(m[3], assinar(m[1]));
}

function cookieSessao(valor: string, maxAgeSec: number): string {
  // Secure só em produção: em dev o Vite roda em http://localhost.
  const secure = process.env.VERCEL ? '; Secure' : '';
  return `${COOKIE}=${valor}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure}`;
}

// ---------------------------------------------------------------------------
// painel.html — servido idêntico ao do pacote (dea/app/painel.html).
// A CSP libera o <script> inline pelo HASH dele (calculado do próprio arquivo),
// então atualizar o painel não exige mexer na política.
// ---------------------------------------------------------------------------
let painelCache: { html: string; csp: string } | null = null;

function painel(): { html: string; csp: string } {
  if (painelCache) return painelCache;
  const html = readFileSync(join(process.cwd(), 'dea', 'app', 'painel.html'), 'utf8');
  const hashes: string[] = [];
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    hashes.push(`'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
  }
  const csp = [
    "default-src 'none'",
    `script-src 'self' ${hashes.join(' ')}`,
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    'img-src data:',
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    // Só pode ser embutido pelo próprio site (iframe da ferramenta).
    "frame-ancestors 'self'",
  ].join('; ');
  painelCache = { html, csp };
  return painelCache;
}

const HEADERS_PRIVADOS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
};

const PAGINA_401 = '<!doctype html><meta charset="utf-8"><title>Acesso restrito</title>'
  + '<p style="font:14px sans-serif;padding:2rem">Sessão expirada ou inexistente. '
  + 'Volte à ferramenta "Exercícios Anteriores" e entre novamente.</p>';

// ---------------------------------------------------------------------------
// dados.js — lido do bucket PRIVADO com a service_role (REST do Storage).
// ---------------------------------------------------------------------------
async function lerDadosJs(): Promise<Buffer | null> {
  const local = process.env.DEA_DADOS_LOCAL;
  if (local && !process.env.VERCEL) return readFileSync(local);

  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const r = await fetch(`${url}/storage/v1/object/${DEA_BUCKET}/${DEA_DADOS_PATH}`, {
    headers: { Authorization: `Bearer ${key}`, apikey: key },
  });
  if (!r.ok) {
    console.error('[dea] falha ao ler dados.js do bucket:', r.status);
    return null;
  }
  return Buffer.from(await r.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Roteamento. Os caminhos públicos são reescritos para cá (vercel.json):
//   GET  /dea/painel      -> ?r=painel
//   GET  /dea/dados.js    -> ?r=dados
//   GET  /api/dea?r=sessao
//   POST /api/dea  {acao: 'entrar', senha} | {acao: 'sair'}
// ---------------------------------------------------------------------------
export async function handleDea(req: any, res: any): Promise<void> {
  const url = new URL(req.url || '/', 'http://local');
  const r = url.searchParams.get('r')
    || (url.pathname === '/dea/painel' ? 'painel' : url.pathname === '/dea/dados.js' ? 'dados' : '');

  try {
    if (req.method === 'GET' && r === 'sessao') {
      return sendJson(res, 200, { autenticado: sessaoValida(req), configurado: senhas().length > 0 });
    }

    if (req.method === 'GET' && r === 'painel') {
      if (!sessaoValida(req)) {
        return send(res, 401, PAGINA_401, { 'Content-Type': 'text/html; charset=utf-8', ...HEADERS_PRIVADOS });
      }
      const p = painel();
      return send(res, 200, p.html, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': p.csp,
        'X-Frame-Options': 'SAMEORIGIN',
        ...HEADERS_PRIVADOS,
      });
    }

    if (req.method === 'GET' && r === 'dados') {
      if (!sessaoValida(req)) {
        return send(res, 401, '/* acesso restrito */', { 'Content-Type': 'application/javascript; charset=utf-8', ...HEADERS_PRIVADOS });
      }
      const dados = await lerDadosJs();
      if (!dados) {
        // Sem corpo JS: o painel mostra o próprio aviso de "dados indisponíveis".
        return send(res, 503, '/* dados indisponíveis */', { 'Content-Type': 'application/javascript; charset=utf-8', ...HEADERS_PRIVADOS });
      }
      return send(res, 200, dados, { 'Content-Type': 'application/javascript; charset=utf-8', ...HEADERS_PRIVADOS });
    }

    if (req.method === 'POST') {
      // Mesma origem apenas (defesa contra CSRF de login/logout).
      if (!isRequestAllowed(req, process.env.ALLOWED_ORIGINS)) {
        return sendJson(res, 403, { error: 'Origem não autorizada.' });
      }
      const body = await readJsonBody(req);

      if (body?.acao === 'sair') {
        return sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookieSessao('', 0) });
      }

      if (body?.acao === 'entrar') {
        if (senhas().length === 0) {
          return sendJson(res, 503, { error: 'Acesso não configurado no servidor (DEA_PASSWORD ausente).' });
        }
        const rl = await checkRateLimitAsync('dea-login:' + getClientIp(req), LOGIN_MAX, LOGIN_JANELA_MS);
        if (!rl.allowed) {
          return sendJson(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' }, { 'Retry-After': String(rl.retryAfterSec) });
        }
        if (!senhaValida(String(body?.senha || ''))) {
          return sendJson(res, 401, { error: 'Senha incorreta.' });
        }
        return sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookieSessao(emitirToken(), SESSAO_MS / 1000) });
      }
    }

    return sendJson(res, 404, { error: 'Rota inexistente.' });
  } catch (e: any) {
    console.error('[dea] erro:', e?.message || e);
    return sendJson(res, 500, { error: 'Falha interna.' });
  }
}
