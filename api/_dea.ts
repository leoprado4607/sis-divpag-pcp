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
//   DEA_ADMIN_PASSWORD         senha(s) de ADMINISTRADOR: entram no painel como as demais e,
//                              além disso, veem o botão "Atualizar". Sem ela, ninguém é admin.
//   DEA_SESSION_SECRET         (opcional) chave do HMAC da sessão; se ausente, é derivada
//                              das senhas + SUPABASE_SERVICE_ROLE_KEY
//   DEA_GITHUB_TOKEN           token (fine-grained) com "Actions: Read and write" SÓ neste
//                              repositório — dispara o workflow dea-atualizar.yml
//   DEA_GITHUB_REPO            (opcional) padrão leoprado4607/sis-divpag-pcp
//   DEA_GITHUB_WORKFLOW        (opcional) padrão dea-atualizar.yml
//   DEA_GITHUB_REF             (opcional) padrão main
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
const ATUALIZAR_MAX = 5;                    // disparos de atualização...
const ATUALIZAR_JANELA_MS = 10 * 60 * 1000; // ...por IP a cada 10 min

type Papel = 'leitor' | 'admin';

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

function lista(env: string | undefined): string[] {
  return (env || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function senhas(): string[] {
  return lista(process.env.DEA_PASSWORD);
}

function senhasAdmin(): string[] {
  return lista(process.env.DEA_ADMIN_PASSWORD);
}

function acessoConfigurado(): boolean {
  return senhas().length > 0 || senhasAdmin().length > 0;
}

// Compara contra TODAS as senhas (sem curto-circuito) para não vazar, pelo tempo
// de resposta, qual delas casou ou quantas existem. Admin prevalece sobre leitor.
function papelDaSenha(tentativa: string): Papel | null {
  let leitor = false;
  let admin = false;
  for (const s of senhas()) leitor = safeEqual(tentativa, s) || leitor;
  for (const s of senhasAdmin()) admin = safeEqual(tentativa, s) || admin;
  return admin ? 'admin' : leitor ? 'leitor' : null;
}

function chaveSessao(): Buffer {
  const base = process.env.DEA_SESSION_SECRET
    || `${process.env.DEA_PASSWORD || ''}|${process.env.DEA_ADMIN_PASSWORD || ''}|${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`;
  // Trocar a senha (ou o segredo) invalida todas as sessões abertas.
  return createHash('sha256').update('dea-sessao|' + base).digest();
}

function assinar(payload: string): string {
  return createHmac('sha256', chaveSessao()).update(payload).digest('base64url');
}

// O papel vai DENTRO do payload assinado: não dá para promover a sessão a admin
// editando o cookie.
function emitirToken(papel: Papel): string {
  const payload = `v2.${Date.now() + SESSAO_MS}.${papel === 'admin' ? 'a' : 'l'}`;
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

function papelDaSessao(req: any): Papel | null {
  if (!acessoConfigurado()) return null;
  const token = lerCookie(req, COOKIE);
  const m = /^(v2\.(\d+)\.([la]))\.([A-Za-z0-9_-]+)$/.exec(token);
  if (!m) return null;
  if (Number(m[2]) < Date.now()) return null;
  if (!safeEqual(m[4], assinar(m[1]))) return null;
  return m[3] === 'a' ? 'admin' : 'leitor';
}

export function sessaoValida(req: any): boolean {
  return papelDaSessao(req) !== null;
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

  // O CDN do Storage chegou a entregar à Vercel o dados.js anterior por mais de
  // uma hora depois de sobrescrito (21/09/2026), enquanto a Action já lia o novo.
  // O parâmetro único na URL fura esse cache a cada leitura.
  const r = await fetch(`${url}/storage/v1/object/${DEA_BUCKET}/${DEA_DADOS_PATH}?v=${Date.now()}`, {
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Cache-Control': 'no-cache' },
    cache: 'no-store',
  });
  if (!r.ok) {
    console.error('[dea] falha ao ler dados.js do bucket:', r.status);
    return null;
  }
  return Buffer.from(await r.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Atualização sob demanda — dispara o workflow dea-atualizar.yml no GitHub.
// O pipeline (Python, credencial do Google, estado no bucket) continua rodando
// no GitHub Actions; daqui só saem o gatilho e a leitura do status. O
// `concurrency` do workflow já impede duas execuções simultâneas; a checagem de
// "em andamento" abaixo evita, além disso, ENFILEIRAR uma segunda rodada por
// clique duplo (que gravaria uma entrada extra e vazia no histórico).
// ---------------------------------------------------------------------------
interface GithubCfg { token: string; repo: string; workflow: string; ref: string }

function githubCfg(): GithubCfg | null {
  const token = process.env.DEA_GITHUB_TOKEN || '';
  if (!token) return null;
  return {
    token,
    repo: process.env.DEA_GITHUB_REPO || 'leoprado4607/sis-divpag-pcp',
    workflow: process.env.DEA_GITHUB_WORKFLOW || 'dea-atualizar.yml',
    ref: process.env.DEA_GITHUB_REF || 'main',
  };
}

function githubFetch(cfg: GithubCfg, caminho: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`https://api.github.com/repos/${cfg.repo}/actions/workflows/${cfg.workflow}${caminho}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'sispagpesbadm-dea',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}

class ErroGithub extends Error {
  constructor(public http: number) {
    super(`O GitHub respondeu HTTP ${http}.${http === 401 || http === 403 || http === 404 ? ' Confira o DEA_GITHUB_TOKEN.' : ''}`);
  }
}

const EM_ANDAMENTO = new Set(['queued', 'in_progress', 'waiting', 'pending', 'requested']);

function resumoRun(run: any) {
  return {
    status: String(run.status || ''),
    conclusao: run.conclusion ?? null,
    criadaEm: run.created_at || null,
    atualizadaEm: run.updated_at || null,
    url: run.html_url || null,
  };
}

async function statusAtualizacao(cfg: GithubCfg) {
  const [rRecentes, rSucesso] = await Promise.all([
    githubFetch(cfg, '/runs?per_page=10'),
    githubFetch(cfg, '/runs?status=success&per_page=1'),
  ]);
  if (!rRecentes.ok) throw new ErroGithub(rRecentes.status);
  const recentes: any[] = ((await rRecentes.json()) as any)?.workflow_runs || [];
  const sucesso: any[] = rSucesso.ok ? ((await rSucesso.json()) as any)?.workflow_runs || [] : [];
  return {
    emAndamento: recentes.some((r) => EM_ANDAMENTO.has(r.status)),
    ultima: recentes[0] ? resumoRun(recentes[0]) : null,
    ultimoSucesso: sucesso[0]?.updated_at || null,
  };
}

// ---------------------------------------------------------------------------
// Roteamento. Os caminhos públicos são reescritos para cá (vercel.json):
//   GET  /dea/painel      -> ?r=painel
//   GET  /dea/dados.js    -> ?r=dados
//   GET  /api/dea?r=sessao
//   GET  /api/dea?r=atualizacao                 (só admin) status do workflow
//   POST /api/dea  {acao: 'entrar', senha} | {acao: 'sair'}
//   POST /api/dea  {acao: 'atualizar'}          (só admin) dispara o workflow
// ---------------------------------------------------------------------------
export async function handleDea(req: any, res: any): Promise<void> {
  const url = new URL(req.url || '/', 'http://local');
  const r = url.searchParams.get('r')
    || (url.pathname === '/dea/painel' ? 'painel' : url.pathname === '/dea/dados.js' ? 'dados' : '');

  try {
    if (req.method === 'GET' && r === 'sessao') {
      const papel = papelDaSessao(req);
      return sendJson(res, 200, { autenticado: papel !== null, admin: papel === 'admin', configurado: acessoConfigurado() });
    }

    if (req.method === 'GET' && r === 'atualizacao') {
      if (papelDaSessao(req) !== 'admin') return sendJson(res, 403, { error: 'Apenas o administrador.' });
      const cfg = githubCfg();
      if (!cfg) return sendJson(res, 200, { configurado: false });
      return sendJson(res, 200, { configurado: true, ...(await statusAtualizacao(cfg)) });
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
        if (!acessoConfigurado()) {
          return sendJson(res, 503, { error: 'Acesso não configurado no servidor (DEA_PASSWORD ausente).' });
        }
        const rl = await checkRateLimitAsync('dea-login:' + getClientIp(req), LOGIN_MAX, LOGIN_JANELA_MS);
        if (!rl.allowed) {
          return sendJson(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' }, { 'Retry-After': String(rl.retryAfterSec) });
        }
        const papel = papelDaSenha(String(body?.senha || ''));
        if (!papel) {
          return sendJson(res, 401, { error: 'Senha incorreta.' });
        }
        return sendJson(res, 200, { ok: true, admin: papel === 'admin' }, { 'Set-Cookie': cookieSessao(emitirToken(papel), SESSAO_MS / 1000) });
      }

      if (body?.acao === 'atualizar') {
        if (papelDaSessao(req) !== 'admin') {
          return sendJson(res, 403, { error: 'Apenas o administrador pode atualizar o painel.' });
        }
        const cfg = githubCfg();
        if (!cfg) {
          return sendJson(res, 503, { error: 'Atualização não configurada no servidor (DEA_GITHUB_TOKEN ausente).' });
        }
        const rl = await checkRateLimitAsync('dea-atualizar:' + getClientIp(req), ATUALIZAR_MAX, ATUALIZAR_JANELA_MS);
        if (!rl.allowed) {
          return sendJson(res, 429, { error: 'Muitos disparos seguidos. Aguarde alguns minutos.' }, { 'Retry-After': String(rl.retryAfterSec) });
        }
        const st = await statusAtualizacao(cfg);
        if (st.emAndamento) {
          return sendJson(res, 409, { error: 'Já há uma atualização em andamento.', ...st });
        }
        // permitir_sem_estado fica SEMPRE false aqui: rodar sem estado apaga a
        // memória do painel e só pode ser feito à mão, no próprio GitHub.
        const d = await githubFetch(cfg, '/dispatches', {
          method: 'POST',
          body: JSON.stringify({ ref: cfg.ref, inputs: { permitir_sem_estado: false } }),
        });
        if (d.status !== 204) {
          console.error('[dea] GitHub recusou o disparo:', d.status, (await d.text()).slice(0, 300));
          throw new ErroGithub(d.status);
        }
        return sendJson(res, 202, { ok: true, disparadoEm: new Date().toISOString() });
      }
    }

    return sendJson(res, 404, { error: 'Rota inexistente.' });
  } catch (e: any) {
    console.error('[dea] erro:', e?.message || e);
    if (e instanceof ErroGithub) return sendJson(res, 502, { error: e.message });
    return sendJson(res, 500, { error: 'Falha interna.' });
  }
}
