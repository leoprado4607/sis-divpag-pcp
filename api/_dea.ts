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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isRequestAllowed, getClientIp } from './_gemini.js';
import { checkRateLimitAsync } from './_ratelimit.js';
import { readJsonBody } from './_http.js';

export const DEA_BUCKET = 'dea-privado';
export const DEA_DADOS_PATH = 'publicado/dados.js';
// Grupos que o administrador enviou para "resolvidos" à mão. Fica fora de
// estado/ de propósito: o pipeline (supabase_sync.py) não lê nem sobrescreve.
export const DEA_RESOLVIDOS_PATH = 'manual/resolvidos.json';
// Protocolos que o administrador confirmou como pendência própria ("Manter
// pendente", 29/09/2026). Arquivo separado: não mexe nos resolvidos.
export const DEA_PENDENTES_PATH = 'manual/pendentes.json';
// Protocolos "Pagamento autorizado (CPEx)" + "Pago" que o administrador deu como
// lançados, com o mês da folha (29/09/2026). Saem de "Homologados para lançamento".
export const DEA_LANCADOS_PATH = 'manual/lancados.json';
// Protocolos de "Homologados para lançamento" que o operador já lançou no SIPPES,
// com o mês/ano de referência do pagamento e o nome do operador (05/10/2026).
// Não tiram o protocolo da lista: isso continua com o registro do mês da folha.
export const DEA_SIPPES_PATH = 'manual/sippes.json';

const COOKIE = 'dea_sessao';
const SESSAO_MS = 8 * 60 * 60 * 1000; // 8h
const LOGIN_MAX = 10;                  // tentativas de senha...
const LOGIN_JANELA_MS = 15 * 60 * 1000; // ...por IP a cada 15 min
const ATUALIZAR_MAX = 5;                    // disparos de atualização...
const ATUALIZAR_JANELA_MS = 10 * 60 * 1000; // ...por IP a cada 10 min
const RESOLVER_MAX = 30;                    // marcações de grupo resolvido...
const RESOLVER_JANELA_MS = 10 * 60 * 1000;  // ...por IP a cada 10 min

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

  const cfg = storageCfg();
  if (!cfg) return null;
  const { url, key } = cfg;

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
// Resolvidos manualmente — o administrador, com a senha, tira do painel um grupo
// sem pagamento que ele conferiu e sabe estar quitado (ex.: pago em outro Nr BI).
// O arquivo guarda a lista vigente e um log de tudo que foi marcado/desfeito.
// A lista vai para o painel anexada ao dados.js (o painel não faz requisições:
// CSP connect-src 'none'); o painel esconde o grupo cujos protocolos estejam
// TODOS na lista — se surgir protocolo novo no grupo, ele volta a aparecer.
// ---------------------------------------------------------------------------
interface Resolvido {
  id: string;
  protocolos: string[];
  nome: string;
  prec_cp: string;
  ano: string;
  nr_bi: string;
  segmento: string;
  aba: string;
  motivo: string;
  em: string;
  mes_folha?: string; // nos lançados: mês da folha; no SIPPES: mês de referência ("AAAA-MM")
  operador?: string;  // só no SIPPES: quem lançou (até 15 caracteres)
  // Só nos lançados: o lançamento no SIPPES de cada protocolo, copiado no registro.
  sippes?: Array<{ protocolo: string; mes_ref: string; operador: string; em: string }>;
}
interface ArquivoResolvidos {
  resolvidos: Resolvido[];
  log: Array<{
    acao: 'resolver' | 'desfazer' | 'alterar'; id: string; protocolos: string[]; nome: string; motivo: string; em: string;
    mes_folha?: string; operador?: string;
  }>;
}

// As duas listas manuais têm o mesmo formato; muda o arquivo e a chave da lista
// ("resolvidos" / "pendentes"), para o resolvidos.json continuar idêntico.
type TipoManual = 'resolvidos' | 'pendentes' | 'lancados' | 'sippes';
const MANUAL: Record<TipoManual, { path: string; local: string }> = {
  resolvidos: { path: DEA_RESOLVIDOS_PATH, local: 'resolvidos-manuais.json' },
  pendentes: { path: DEA_PENDENTES_PATH, local: 'pendentes-manuais.json' },
  lancados: { path: DEA_LANCADOS_PATH, local: 'lancados-manuais.json' },
  sippes: { path: DEA_SIPPES_PATH, local: 'sippes-manuais.json' },
};

function storageCfg(): { url: string; key: string } | null {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return url && key ? { url, key } : null;
}

// Em dev com DEA_DADOS_LOCAL, a lista fica num arquivo ao lado do dados.js local.
function manualLocal(tipo: TipoManual): string | null {
  const local = process.env.DEA_DADOS_LOCAL;
  return local && !process.env.VERCEL ? join(dirname(local), MANUAL[tipo].local) : null;
}

function arquivoVazio(): ArquivoResolvidos {
  return { resolvidos: [], log: [] };
}

function normalizarArquivo(obj: any, tipo: TipoManual): ArquivoResolvidos {
  return {
    resolvidos: Array.isArray(obj?.[tipo]) ? obj[tipo] : [],
    log: Array.isArray(obj?.log) ? obj.log : [],
  };
}

// null = não foi possível ler (o painel avisa, em vez de mostrar tudo como pendente em silêncio).
async function lerManual(tipo: TipoManual): Promise<ArquivoResolvidos | null> {
  const local = manualLocal(tipo);
  if (local) {
    if (!existsSync(local)) return arquivoVazio();
    try { return normalizarArquivo(JSON.parse(readFileSync(local, 'utf8')), tipo); } catch { return null; }
  }
  const cfg = storageCfg();
  if (!cfg) return null;
  const r = await fetch(`${cfg.url}/storage/v1/object/${DEA_BUCKET}/${MANUAL[tipo].path}?v=${Date.now()}`, {
    headers: { Authorization: `Bearer ${cfg.key}`, apikey: cfg.key, 'Cache-Control': 'no-cache' },
    cache: 'no-store',
  });
  if (r.ok) {
    try { return normalizarArquivo(await r.json(), tipo); } catch { return null; }
  }
  // O Storage responde 400/404 "not_found" para objeto inexistente: lista vazia.
  const corpo = (await r.text().catch(() => '')).toLowerCase();
  if (r.status === 404 || (r.status === 400 && corpo.includes('not') && corpo.includes('found'))) return arquivoVazio();
  console.error(`[dea] falha ao ler ${tipo} manuais:`, r.status);
  return null;
}

async function gravarManual(tipo: TipoManual, arq: ArquivoResolvidos): Promise<void> {
  const corpo = JSON.stringify({ [tipo]: arq.resolvidos, log: arq.log });
  const local = manualLocal(tipo);
  if (local) { writeFileSync(local, corpo, 'utf8'); return; }
  const cfg = storageCfg();
  if (!cfg) throw new Error('Storage não configurado');
  const r = await fetch(`${cfg.url}/storage/v1/object/${DEA_BUCKET}/${MANUAL[tipo].path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.key}`, apikey: cfg.key,
      'Content-Type': 'application/json', 'x-upsert': 'true', 'Cache-Control': 'no-store',
    },
    body: corpo,
  });
  if (!r.ok) {
    console.error(`[dea] falha ao gravar ${tipo} manuais:`, r.status, (await r.text().catch(() => '')).slice(0, 200));
    throw new Error(`Falha ao gravar a lista de ${tipo}.`);
  }
}

function texto(v: unknown, max: number): string {
  return String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

function idGrupo(protocolos: string[]): string {
  return createHash('sha256').update([...protocolos].sort().join('|')).digest('hex').slice(0, 16);
}

// Anexa as listas (só o necessário para exibir) e o papel ao dados.js entregue.
function anexarAoDados(
  dados: Buffer, res: ArquivoResolvidos | null, pen: ArquivoResolvidos | null, lan: ArquivoResolvidos | null,
  sip: ArquivoResolvidos | null, admin: boolean,
): Buffer {
  // "<" escapado: o conteúdo vem de texto digitado (motivo, nome).
  const json = (arq: ArquivoResolvidos | null) => JSON.stringify(arq ? arq.resolvidos : null).replace(/</g, '\\u003c');
  const js = `\nwindow.DEA_RESOLVIDOS=${json(res)};window.DEA_PENDENTES=${json(pen)};window.DEA_LANCADOS=${json(lan)};window.DEA_SIPPES=${json(sip)};window.DEA_ADMIN=${admin};\n`;
  return Buffer.concat([dados, Buffer.from(js, 'utf8')]);
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
//   POST /api/dea  {acao: 'resolver', senha, motivo, grupo}      (só admin + senha)
//   POST /api/dea  {acao: 'desfazer-resolvido', senha, id, motivo?} (só admin + senha)
//   POST /api/dea  {acao: 'manter-pendente', senha, motivo, grupo}  (só admin + senha)
//   POST /api/dea  {acao: 'desfazer-pendente', senha, id, motivo?}  (só admin + senha)
//   POST /api/dea  {acao: 'registrar-lancamento', senha, mes_folha, motivo?, grupo} (só admin + senha)
//   POST /api/dea  {acao: 'desfazer-lancamento', senha, id, motivo?} (só admin + senha)
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
      const [dados, resolvidos, pendentes, lancados, sippes] = await Promise.all([
        lerDadosJs(), lerManual('resolvidos').catch(() => null), lerManual('pendentes').catch(() => null),
        lerManual('lancados').catch(() => null), lerManual('sippes').catch(() => null),
      ]);
      if (!dados) {
        // Sem corpo JS: o painel mostra o próprio aviso de "dados indisponíveis".
        return send(res, 503, '/* dados indisponíveis */', { 'Content-Type': 'application/javascript; charset=utf-8', ...HEADERS_PRIVADOS });
      }
      const corpo = anexarAoDados(dados, resolvidos, pendentes, lancados, sippes, papelDaSessao(req) === 'admin');
      return send(res, 200, corpo, { 'Content-Type': 'application/javascript; charset=utf-8', ...HEADERS_PRIVADOS });
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

      // "Lançado no SIPPES" (05/10/2026): um protocolo por vez, só com a sessão de
      // administrador (sem redigitar a senha). Marcar de novo substitui o registro.
      if (body?.acao === 'registrar-sippes') {
        if (papelDaSessao(req) !== 'admin') {
          return sendJson(res, 403, { error: 'Apenas o administrador pode registrar o lançamento no SIPPES.' });
        }
        const rl = await checkRateLimitAsync('dea-resolver:' + getClientIp(req), RESOLVER_MAX, RESOLVER_JANELA_MS);
        if (!rl.allowed) {
          return sendJson(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' }, { 'Retry-After': String(rl.retryAfterSec) });
        }
        const g = body?.grupo || {};
        const protocolo = Array.isArray(g.protocolos) && g.protocolos.length === 1 ? texto(g.protocolos[0], 30) : '';
        if (!/^\d{1,30}$/.test(protocolo)) return sendJson(res, 400, { error: 'Protocolo inválido.' });
        const mesRef = texto(body?.mes_ref, 7);
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mesRef)) return sendJson(res, 400, { error: 'Informe o mês/ano de referência.' });
        const operador = texto(body?.operador, 15);
        if (!operador) return sendJson(res, 400, { error: 'Informe o nome do operador.' });
        const arq = await lerManual('sippes');
        if (!arq) return sendJson(res, 503, { error: 'Não foi possível ler a lista do SIPPES. Tente de novo.' });
        const em = new Date().toISOString();
        const id = idGrupo([protocolo]);
        const existia = arq.resolvidos.some((x) => x.id === id);
        const reg: Resolvido = {
          id, protocolos: [protocolo], motivo: '', em,
          nome: texto(g.nome, 200), prec_cp: texto(g.prec_cp, 30), ano: texto(g.ano, 40),
          nr_bi: texto(g.nr_bi, 60), segmento: texto(g.segmento, 20), aba: texto(g.aba, 80),
          mes_folha: mesRef, operador,
        };
        arq.resolvidos = arq.resolvidos.filter((x) => x.id !== id).concat(reg);
        arq.log.push({ acao: existia ? 'alterar' : 'resolver', id, protocolos: [protocolo], nome: reg.nome, motivo: '', em, mes_folha: mesRef, operador });
        await gravarManual('sippes', arq);
        return sendJson(res, 200, { ok: true, id });
      }

      // Resolvidos manualmente, mantidos pendentes e lançamentos registrados:
      // mesmo fluxo, listas separadas.
      const ACOES_MANUAIS: Record<string, { tipo: TipoManual; marcar: boolean }> = {
        'resolver': { tipo: 'resolvidos', marcar: true },
        'desfazer-resolvido': { tipo: 'resolvidos', marcar: false },
        'manter-pendente': { tipo: 'pendentes', marcar: true },
        'desfazer-pendente': { tipo: 'pendentes', marcar: false },
        'registrar-lancamento': { tipo: 'lancados', marcar: true },
        'desfazer-lancamento': { tipo: 'lancados', marcar: false },
      };
      const acaoManual = ACOES_MANUAIS[String(body?.acao || '')];
      if (acaoManual) {
        const { tipo, marcar } = acaoManual;
        const nomeLista = { resolvidos: 'resolvidos', pendentes: 'mantidos pendentes', lancados: 'lançamentos registrados', sippes: 'lançados no SIPPES' }[tipo];
        // Dupla trava: sessão de administrador E a senha de administrador digitada
        // de novo no momento da ação.
        if (papelDaSessao(req) !== 'admin') {
          return sendJson(res, 403, { error: `Apenas o administrador pode alterar os ${nomeLista}.` });
        }
        const rl = await checkRateLimitAsync('dea-resolver:' + getClientIp(req), RESOLVER_MAX, RESOLVER_JANELA_MS);
        if (!rl.allowed) {
          return sendJson(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' }, { 'Retry-After': String(rl.retryAfterSec) });
        }
        if (papelDaSenha(String(body?.senha || '')) !== 'admin') {
          return sendJson(res, 401, { error: 'Senha de administrador incorreta.' });
        }
        const arq = await lerManual(tipo);
        if (!arq) return sendJson(res, 503, { error: `Não foi possível ler a lista de ${nomeLista}. Tente de novo.` });
        const em = new Date().toISOString();

        if (marcar) {
          const g = body?.grupo || {};
          const protocolos = Array.isArray(g.protocolos)
            ? [...new Set(g.protocolos.map((p: unknown) => texto(p, 30)).filter((p: string) => /^\d{1,30}$/.test(p)))] as string[]
            : [];
          if (!protocolos.length || protocolos.length > 200 || protocolos.length !== g.protocolos.length) {
            return sendJson(res, 400, { error: 'Grupo inválido.' });
          }
          const motivo = texto(body?.motivo, 500);
          // Lançamento: exige o mês da folha ("AAAA-MM"); a observação é opcional.
          const mesFolha = texto(body?.mes_folha, 7);
          if (tipo === 'lancados') {
            if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mesFolha)) return sendJson(res, 400, { error: 'Informe o mês da folha.' });
          } else if (motivo.length < 5) {
            return sendJson(res, 400, { error: 'Informe o motivo (mínimo de 5 caracteres).' });
          }
          const id = idGrupo(protocolos);
          if (arq.resolvidos.some((x) => x.id === id)) {
            return sendJson(res, 409, { error: `Este grupo já está nos ${nomeLista}.` });
          }
          // Um protocolo não pode estar nas duas listas (resolvido E mantido pendente).
          if (tipo !== 'lancados') {
            const outro: TipoManual = tipo === 'resolvidos' ? 'pendentes' : 'resolvidos';
            const arqOutro = await lerManual(outro);
            if (!arqOutro) return sendJson(res, 503, { error: 'Não foi possível conferir a outra lista manual. Tente de novo.' });
            const naOutra = protocolos.filter((p) => arqOutro.resolvidos.some((x) => (x.protocolos || []).includes(p)));
            if (naOutra.length) {
              const rotulo = outro === 'resolvidos' ? 'Resolvidos manualmente' : 'Mantidos pendentes';
              return sendJson(res, 409, { error: `Protocolo(s) ${naOutra.join(', ')} já consta(m) em "${rotulo}". Desfaça lá antes.` });
            }
          }
          // Nem em dois registros da mesma lista de mantidos ou de lançados.
          if (tipo !== 'resolvidos') {
            const ja = protocolos.filter((p) => arq.resolvidos.some((x) => (x.protocolos || []).includes(p)));
            if (ja.length) return sendJson(res, 409, { error: `Protocolo(s) ${ja.join(', ')} já consta(m) nos ${nomeLista}.` });
          }
          // Lançamento: guarda junto o lançamento no SIPPES dos protocolos, se houver.
          let sippes: Resolvido['sippes'];
          if (tipo === 'lancados') {
            const arqSip = await lerManual('sippes').catch(() => null);
            sippes = (arqSip?.resolvidos || [])
              .filter((x) => protocolos.includes(String(x.protocolos?.[0])))
              .map((x) => ({ protocolo: String(x.protocolos[0]), mes_ref: x.mes_folha || '', operador: x.operador || '', em: x.em }));
          }
          const reg: Resolvido = {
            id, protocolos, motivo, em,
            nome: texto(g.nome, 200), prec_cp: texto(g.prec_cp, 30), ano: texto(g.ano, 40),
            nr_bi: texto(g.nr_bi, 60), segmento: texto(g.segmento, 20), aba: texto(g.aba, 80),
            ...(tipo === 'lancados' ? { mes_folha: mesFolha } : {}),
            ...(sippes?.length ? { sippes } : {}),
          };
          arq.resolvidos.push(reg);
          arq.log.push({ acao: 'resolver', id, protocolos, nome: reg.nome, motivo, em, ...(reg.mes_folha ? { mes_folha: reg.mes_folha } : {}) });
          await gravarManual(tipo, arq);
          return sendJson(res, 200, { ok: true, id });
        }

        const id = texto(body?.id, 32);
        const alvo = arq.resolvidos.find((x) => x.id === id);
        if (!alvo) return sendJson(res, 404, { error: 'Registro não encontrado (talvez já desfeito).' });
        const motivo = texto(body?.motivo, 500);
        arq.resolvidos = arq.resolvidos.filter((x) => x.id !== id);
        arq.log.push({ acao: 'desfazer', id, protocolos: alvo.protocolos, nome: alvo.nome, motivo, em });
        await gravarManual(tipo, arq);
        return sendJson(res, 200, { ok: true });
      }
    }

    return sendJson(res, 404, { error: 'Rota inexistente.' });
  } catch (e: any) {
    console.error('[dea] erro:', e?.message || e);
    if (e instanceof ErroGithub) return sendJson(res, 502, { error: e.message });
    return sendJson(res, 500, { error: 'Falha interna.' });
  }
}
