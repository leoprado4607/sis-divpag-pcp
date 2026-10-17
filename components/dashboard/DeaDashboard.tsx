import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Lock, LogOut, Loader2, RefreshCw } from 'lucide-react';

// "Exercícios Anteriores" — casca do Painel DEA.
//
// O painel em si (dea/app/painel.html) é uma página autocontida servida pelo
// servidor em /dea/painel, junto com /dea/dados.js. As duas rotas só respondem
// com um cookie de sessão HttpOnly emitido por /api/dea após validar a senha NO
// SERVIDOR (api/_dea.ts). Aqui ficam apenas o login e o <iframe>: nenhum dado
// pessoal passa pelo bundle React.
//
// O iframe isola o CSS do painel (classes curtas como .aba/.chip/.btn), que
// colidiria com o Tailwind do site se fosse embutido.
//
// Atualização: SÓ MANUAL. A sessão de administrador (DEA_ADMIN_PASSWORD) vê o
// botão "Atualizar", que pede ao /api/dea para disparar o workflow
// dea-atualizar.yml no GitHub Actions (a rodada leva ~1-2 min). Enquanto ela
// corre, a barra consulta o status; ao terminar com sucesso, recarrega o iframe.
//
// Resolvidos manualmente: o painel não faz requisições (CSP connect-src 'none').
// O botão "Enviar para resolvidos" (e o "Desfazer") do painel manda um
// postMessage para cá; esta casca pede o motivo, chama o /api/dea e recarrega
// o iframe. Nenhuma ação pede a senha de novo: basta a sessão de administrador.
// "Manter pendente" (e o "Desfazer" da aba "Mantidos pendentes") segue o mesmo
// caminho, gravando noutra lista (manual/pendentes.json).
// "Lançado no SIPPES" (Homologados para lançamento) pede o mês/ano de referência
// e o operador; manual/sippes.json.
// "Obs" (observação do grupo, até 150 caracteres): o painel manda o texto e esta
// casca grava direto no /api/dea, sem janela, e devolve o resultado ao painel
// por postMessage (o painel atualiza sem recarregar); manual/observacoes.json.

interface GrupoResolver {
  protocolos: string[];
  nome: string;
  prec_cp: string;
  ano: string;
  nr_bi: string;
  segmento: string;
  aba: string;
  total: string;
  pagos_pessoa: string[];
  pagos_grupo: string[];
  sippes: { mes_ref: string; operador: string } | null; // lançamento no SIPPES já registrado
}
interface RegistroDesfazer { id: string; nome: string; prec_cp: string; ano: string; protocolos: string[] }
type PedidoResolvido =
  | { tipo: 'resolver' | 'manter' | 'lancar' | 'sippes'; grupo: GrupoResolver }
  | { tipo: 'desfazer' | 'desfazer-pendente' | 'desfazer-lancamento'; registro: RegistroDesfazer };

// Textos e ação do /api/dea de cada pedido.
const PEDIDOS = {
  resolver: { titulo: 'Enviar para resolvidos', botao: 'Enviar para resolvidos', acao: 'resolver' },
  manter: { titulo: 'Manter pendente', botao: 'Manter pendente', acao: 'manter-pendente' },
  desfazer: { titulo: 'Desfazer resolvido manual', botao: 'Desfazer', acao: 'desfazer-resolvido' },
  'desfazer-pendente': { titulo: 'Desfazer mantido pendente', botao: 'Desfazer', acao: 'desfazer-pendente' },
  lancar: { titulo: 'Registrar mês da folha', botao: 'Registrar', acao: 'registrar-lancamento' },
  sippes: { titulo: 'Lançado no SIPPES', botao: 'Registrar', acao: 'registrar-sippes' },
  'desfazer-lancamento': { titulo: 'Desfazer lançamento registrado', botao: 'Desfazer', acao: 'desfazer-lancamento' },
} as const;

const TIPO_MARCAR: Record<string, 'resolver' | 'manter' | 'lancar' | 'sippes'> = {
  'dea-resolver': 'resolver', 'dea-manter-pendente': 'manter', 'dea-lancar': 'lancar', 'dea-sippes': 'sippes',
};
const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const OBS_MAX = 150;
const OPERADOR_MAX = 15;
const TIPO_DESFAZER: Record<string, 'desfazer' | 'desfazer-pendente' | 'desfazer-lancamento'> = {
  'dea-desfazer-resolvido': 'desfazer', 'dea-desfazer-pendente': 'desfazer-pendente',
  'dea-desfazer-lancamento': 'desfazer-lancamento',
};

// Mês anterior ao atual, "AAAA-MM": a folha costuma ser a do mês que passou.
// Com recuo 0, o mês atual (referência do lançamento no SIPPES).
function mesAnterior(recuo = 1): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - recuo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function listaTexto(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)).slice(0, 200) : [];
}

// A mensagem vem do iframe do painel: só se aceita a do próprio iframe, na mesma origem.
function lerPedido(data: any): PedidoResolvido | null {
  if (TIPO_MARCAR[data?.tipo] && data.grupo) {
    const g = data.grupo;
    const protocolos = listaTexto(g.protocolos);
    if (!protocolos.length) return null;
    const sip = g.sippes && MES_RE.test(String(g.sippes.mes_ref))
      ? { mes_ref: String(g.sippes.mes_ref), operador: String(g.sippes.operador || '').slice(0, OPERADOR_MAX) }
      : null;
    return {
      tipo: TIPO_MARCAR[data.tipo],
      grupo: {
        protocolos, pagos_pessoa: listaTexto(g.pagos_pessoa), pagos_grupo: listaTexto(g.pagos_grupo),
        nome: String(g.nome || ''), prec_cp: String(g.prec_cp || ''), ano: String(g.ano || ''),
        nr_bi: String(g.nr_bi || ''), segmento: String(g.segmento || ''), aba: String(g.aba || ''),
        total: String(g.total || ''), sippes: sip,
      },
    };
  }
  if (TIPO_DESFAZER[data?.tipo] && data.registro?.id) {
    const r = data.registro;
    return {
      tipo: TIPO_DESFAZER[data.tipo],
      registro: {
        id: String(r.id), nome: String(r.nome || ''), prec_cp: String(r.prec_cp || ''),
        ano: String(r.ano || ''), protocolos: listaTexto(r.protocolos),
      },
    };
  }
  return null;
}

interface DeaDashboardProps {
  onBack: () => void;
}

async function postDea(body: Record<string, unknown>): Promise<Response> {
  return fetch('/api/dea', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
}

interface StatusAtualizacao {
  configurado: boolean;
  emAndamento?: boolean;
  ultima?: { status: string; conclusao: string | null; criadaEm: string | null; atualizadaEm: string | null; url: string | null } | null;
  ultimoSucesso?: string | null;
}

const POLL_MS = 10_000;
// O GitHub leva alguns segundos para listar a execução recém-disparada.
const JANELA_INICIO_MS = 90_000;

function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

const DeaDashboard: React.FC<DeaDashboardProps> = ({ onBack }) => {
  const [status, setStatus] = useState<'verificando' | 'login' | 'dentro'>('verificando');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [atual, setAtual] = useState<StatusAtualizacao | null>(null);
  const [disparadoEm, setDisparadoEm] = useState<number | null>(null);
  const [msgAtualizacao, setMsgAtualizacao] = useState('');
  const [versaoPainel, setVersaoPainel] = useState(0);
  const acompanhando = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [pedido, setPedido] = useState<PedidoResolvido | null>(null);
  const [motivo, setMotivo] = useState('');
  const [mesFolha, setMesFolha] = useState('');
  const [operador, setOperador] = useState('');
  const [erroAcao, setErroAcao] = useState('');
  const [enviandoAcao, setEnviandoAcao] = useState(false);

  useEffect(() => {
    if (!admin) return;
    const aoReceber = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== iframeRef.current?.contentWindow) return;
      if (e.data?.tipo === 'dea-obs') { salvarObs(e.data, e.source as Window); return; }
      const p = lerPedido(e.data);
      if (!p) return;
      setPedido(p);
      setMotivo('');
      // Mês da folha e "Lançado no SIPPES" partem do mês de referência já lançado no SIPPES.
      const sip = 'grupo' in p ? p.grupo.sippes : null;
      setMesFolha(sip?.mes_ref || mesAnterior(p.tipo === 'sippes' ? 0 : 1));
      setOperador(p.tipo === 'sippes' ? sip?.operador || '' : '');
      setErroAcao('');
    };
    window.addEventListener('message', aoReceber);
    return () => window.removeEventListener('message', aoReceber);
  }, [admin]);

  // Grava a observação e responde ao painel com {tipo:'dea-obs-resultado', pedido, ok, obs|error}.
  async function salvarObs(data: any, alvo: Window) {
    const responder = (r: Record<string, unknown>) =>
      alvo.postMessage({ tipo: 'dea-obs-resultado', pedido: data.pedido, ...r }, window.location.origin);
    const protocolos = listaTexto(data.protocolos);
    if (!protocolos.length) { responder({ ok: false, error: 'Grupo inválido.' }); return; }
    try {
      const r = await postDea({ acao: 'salvar-obs', protocolos, texto: String(data.texto ?? '').slice(0, OBS_MAX) });
      const d = await r.json().catch(() => ({}));
      responder(r.ok ? { ok: true, obs: d?.obs ?? null } : { ok: false, error: d?.error || 'Não foi possível salvar.' });
    } catch {
      responder({ ok: false, error: 'Falha de conexão. Tente novamente.' });
    }
  }

  const fecharPedido = () => { if (!enviandoAcao) setPedido(null); };

  const confirmarPedido = async () => {
    if (!pedido || enviandoAcao) return;
    const marcar = pedido.tipo === 'resolver' || pedido.tipo === 'manter';
    if (marcar && motivo.trim().length < 5) { setErroAcao('Informe o motivo (mínimo de 5 caracteres).'); return; }
    if (pedido.tipo === 'lancar' && !MES_RE.test(mesFolha)) { setErroAcao('Informe o mês da folha.'); return; }
    if (pedido.tipo === 'sippes') {
      if (!MES_RE.test(mesFolha)) { setErroAcao('Informe o mês/ano de referência.'); return; }
      if (!operador.trim()) { setErroAcao('Informe o nome do operador.'); return; }
    }
    setEnviandoAcao(true);
    setErroAcao('');
    try {
      const acao = PEDIDOS[pedido.tipo].acao;
      const corpo = pedido.tipo === 'sippes'
        ? { acao, grupo: pedido.grupo, mes_ref: mesFolha, operador: operador.trim() }
        : 'grupo' in pedido
        ? { acao, motivo: motivo.trim(), grupo: pedido.grupo, ...(pedido.tipo === 'lancar' ? { mes_folha: mesFolha } : {}) }
        : { acao, motivo: motivo.trim(), id: pedido.registro.id };
      const r = await postDea(corpo);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErroAcao(d?.error || 'Não foi possível concluir.'); return; }
      setPedido(null);
      setVersaoPainel((v) => v + 1); // recarrega o painel com a lista nova
    } catch {
      setErroAcao('Falha de conexão. Tente novamente.');
    } finally {
      setEnviandoAcao(false);
    }
  };

  // Sessão ainda válida (cookie de até 8h) entra direto, sem pedir a senha de novo.
  useEffect(() => {
    let ativo = true;
    fetch('/api/dea?r=sessao', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { autenticado: false }))
      .then((d) => {
        if (!ativo) return;
        setAdmin(Boolean(d?.admin));
        setStatus(d?.autenticado ? 'dentro' : 'login');
      })
      .catch(() => { if (ativo) setStatus('login'); });
    return () => { ativo = false; };
  }, []);

  const entrar = async () => {
    if (!senha || enviando) return;
    setEnviando(true);
    setErro('');
    try {
      const r = await postDea({ acao: 'entrar', senha });
      if (r.ok) {
        const d = await r.json().catch(() => ({}));
        setSenha('');
        setAdmin(Boolean(d?.admin));
        setStatus('dentro');
      } else {
        const d = await r.json().catch(() => ({}));
        setErro(d?.error || 'Não foi possível autenticar.');
      }
    } catch {
      setErro('Falha de conexão. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  };

  const sair = async () => {
    try { await postDea({ acao: 'sair' }); } catch { /* o cookie expira sozinho */ }
    setAdmin(false);
    setAtual(null);
    setStatus('login');
  };

  const carregarStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/dea?r=atualizacao', { credentials: 'same-origin' });
      if (r.ok) setAtual(await r.json());
      else setMsgAtualizacao((await r.json().catch(() => ({})))?.error || 'Não foi possível consultar o status no GitHub.');
    } catch { /* tenta de novo no próximo ciclo */ }
  }, []);

  useEffect(() => {
    if (status === 'dentro' && admin) carregarStatus();
  }, [status, admin, carregarStatus]);

  // A execução que disparamos já aparece na lista do GitHub?
  const execucaoApareceu = disparadoEm !== null
    && Boolean(atual?.ultima?.criadaEm && Date.parse(atual.ultima.criadaEm) >= disparadoEm - 5_000);
  // "Rodando" = o GitHub lista uma execução em andamento, OU acabamos de
  // disparar e ela ainda não apareceu.
  const aguardandoInicio = disparadoEm !== null && !execucaoApareceu && Date.now() - disparadoEm < JANELA_INICIO_MS;
  const rodando = Boolean(atual?.emAndamento) || aguardandoInicio;

  useEffect(() => {
    if (rodando) {
      acompanhando.current = true;
      const t = setTimeout(carregarStatus, POLL_MS);
      return () => clearTimeout(t);
    }
    // Terminou uma rodada que estávamos acompanhando.
    if (!acompanhando.current) return;
    acompanhando.current = false;
    setDisparadoEm(null);
    if (disparadoEm !== null && !execucaoApareceu) {
      setMsgAtualizacao('A execução não apareceu no GitHub. Tente de novo em instantes.');
    } else if (atual?.ultima?.conclusao === 'success') {
      setVersaoPainel((v) => v + 1); // recarrega o iframe com o dados.js novo
      setMsgAtualizacao(`Atualizado em ${formatarData(atual.ultima.atualizadaEm)}.`);
    } else {
      setMsgAtualizacao('');
    }
  }, [rodando, atual, disparadoEm, execucaoApareceu, carregarStatus]);

  const atualizar = async () => {
    if (rodando) return;
    if (!window.confirm('Baixar a planilha e atualizar o Painel DEA agora?\n\nA rodada leva cerca de 1 a 2 minutos.')) return;
    setMsgAtualizacao('');
    try {
      const r = await postDea({ acao: 'atualizar' });
      const d = await r.json().catch(() => ({}));
      if (r.ok) setDisparadoEm(Date.parse(d?.disparadoEm) || Date.now());
      else setMsgAtualizacao(d?.error || 'Não foi possível iniciar a atualização.');
    } catch {
      setMsgAtualizacao('Falha de conexão. Tente novamente.');
    }
    carregarStatus();
  };

  const falhou = !rodando && atual?.ultima?.status === 'completed' && atual.ultima.conclusao !== 'success';
  const textoStatus = atual && !atual.configurado
    ? 'Atualização não configurada no servidor.'
    : rodando
      ? 'Atualizando… (1 a 2 min)'
      : msgAtualizacao
        || (falhou ? 'A última atualização falhou.' : `Última atualização: ${formatarData(atual?.ultimoSucesso)}`);

  if (status === 'verificando') {
    return (
      <div className="min-h-[60vh] bg-army-cream flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-army-green animate-spin" aria-label="Carregando" />
      </div>
    );
  }

  if (status === 'login') {
    return (
      <div className="min-h-[calc(100vh-3rem)] bg-army-cream flex items-center justify-center p-4">
        <div className="bg-white p-8 sm:p-10 max-w-md w-full border border-army-green/10 border-t-2 border-t-army-gold">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-army-cream border border-army-green/10 flex-shrink-0"><Lock size={24} className="text-army-green" /></div>
              <div className="min-w-0">
                <h3 className="font-cormorant font-semibold text-3xl text-army-green leading-tight">Acesso Restrito</h3>
                <p className="text-[13px] text-army-green/75">Exercícios Anteriores</p>
              </div>
            </div>
            <div className="space-y-4">
                <div>
                  <label htmlFor="dea-senha" className="block text-sm font-semibold text-army-green mb-1.5">Senha de acesso</label>
                  <input
                    id="dea-senha"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Digite a credencial..."
                    value={senha}
                    onChange={e => setSenha(e.target.value)}
                    autoFocus
                    className="w-full border border-army-green/15 bg-army-cream focus:bg-white focus:border-army-green px-4 py-3 text-base text-army-charcoal placeholder-army-green/75 outline-none transition-colors"
                    onKeyDown={e => e.key === 'Enter' && entrar()}
                  />
                </div>
                {erro && <p role="alert" className="text-sm font-semibold text-red-700">{erro}</p>}
                <div className="flex gap-3 pt-2">
                    <button type="button" onClick={onBack} className="flex-1 min-h-[44px] border border-army-green/15 text-army-green hover:border-army-green text-[13px] font-semibold transition-colors">Voltar</button>
                    <button type="button" onClick={entrar} disabled={enviando} className="flex-1 min-h-[44px] bg-army-green hover:bg-army-mid text-white text-[13px] font-semibold transition-colors disabled:opacity-60">{enviando ? 'Verificando…' : 'Entrar'}</button>
                </div>
            </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-army-cream">
      <div className="bg-army-green text-white border-b-2 border-army-gold shrink-0">
        <div className="flex items-center justify-between gap-2 px-2 sm:px-3">
          <button type="button" onClick={onBack} className="min-h-[44px] flex items-center gap-2 px-2 hover:bg-white/10 transition-colors text-sm font-semibold">
            <ArrowLeft className="w-4 h-4 text-army-gold-light" /> Início
          </button>
          <div className="flex items-center gap-1 sm:gap-2">
            {admin && (
              <>
                <span className="hidden sm:inline text-xs text-white/80" aria-live="polite">
                {textoStatus}
                {falhou && !msgAtualizacao && atual?.ultima?.url && (
                  <> <a href={atual.ultima.url} target="_blank" rel="noopener noreferrer" className="underline text-army-gold-light">ver log</a></>
                )}
                </span>
                <button
                  type="button"
                  onClick={atualizar}
                  disabled={rodando || atual?.configurado === false}
                  title="Baixa a planilha e regera o painel (apenas administrador)"
                  className="min-h-[36px] my-1 flex items-center gap-2 px-3 bg-army-gold-light text-army-charcoal hover:bg-white transition-colors text-sm font-semibold disabled:opacity-60"
                >
                  <RefreshCw className={`w-4 h-4 ${rodando ? 'animate-spin' : ''}`} /> {rodando ? 'Atualizando' : 'Atualizar'}
                </button>
              </>
            )}
            <button type="button" onClick={sair} className="min-h-[44px] flex items-center gap-2 px-2 hover:bg-white/10 transition-colors text-sm font-semibold">
              <LogOut className="w-4 h-4 text-army-gold-light" /> Sair
            </button>
          </div>
        </div>
        {admin && (
          // no celular o status da atualização desce para uma linha própria
          <p className="sm:hidden px-4 pb-2 text-xs text-white/80" aria-hidden="true">
            {textoStatus}
                {falhou && !msgAtualizacao && atual?.ultima?.url && (
                  <> <a href={atual.ultima.url} target="_blank" rel="noopener noreferrer" className="underline text-army-gold-light">ver log</a></>
                )}
          </p>
        )}
      </div>
      <iframe
        key={versaoPainel}
        ref={iframeRef}
        src="/dea/painel"
        title="Painel DEA — Exercícios Anteriores"
        className="flex-1 w-full border-0"
        referrerPolicy="no-referrer"
      />
      {pedido && (
        <div className="fixed inset-0 z-50 bg-army-charcoal/60 flex items-center justify-center p-4" onClick={fecharPedido}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dea-pedido-titulo"
            className="bg-white w-full max-w-lg p-6 border-t-2 border-army-gold shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === 'Escape' && fecharPedido()}
          >
            <h3 id="dea-pedido-titulo" className="font-cormorant font-semibold text-2xl text-army-green leading-tight">
              {PEDIDOS[pedido.tipo].titulo}
            </h3>
            {pedido.tipo === 'lancar' || pedido.tipo === 'sippes' ? (
              <dl className="mt-3 text-sm text-army-charcoal/80 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="font-semibold">Nome</dt><dd>{pedido.grupo.nome || '—'}</dd>
                {pedido.grupo.prec_cp && <><dt className="font-semibold">Prec-cp</dt><dd>{pedido.grupo.prec_cp}</dd></>}
                <dt className="font-semibold">Protocolos</dt>
                <dd className="break-words">
                  {pedido.grupo.protocolos.length > 1 ? `${pedido.grupo.protocolos.length}: ` : ''}
                  {pedido.grupo.protocolos.join(', ')} ({pedido.grupo.total})
                </dd>
              </dl>
            ) : 'grupo' in pedido ? (
              <dl className="mt-3 text-sm text-army-charcoal/80 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="font-semibold">Nome</dt><dd>{pedido.grupo.nome || '—'}</dd>
                <dt className="font-semibold">Prec-cp</dt><dd>{pedido.grupo.prec_cp}</dd>
                <dt className="font-semibold">Ano · Nr BI</dt><dd>{pedido.grupo.ano} · {pedido.grupo.nr_bi}</dd>
                <dt className="font-semibold">Protocolos</dt><dd className="break-words">{pedido.grupo.protocolos.join(', ')} ({pedido.grupo.total})</dd>
                <dt className="font-semibold">Aba</dt><dd>{pedido.grupo.aba}</dd>
                {pedido.grupo.pagos_pessoa.length > 0 && (
                  <><dt className="font-semibold">Pago em outro BI</dt><dd>{pedido.grupo.pagos_pessoa.join(', ')}</dd></>
                )}
                {pedido.grupo.pagos_grupo.length > 0 && (
                  <><dt className="font-semibold">Pago no grupo</dt><dd>{pedido.grupo.pagos_grupo.join(', ')}</dd></>
                )}
              </dl>
            ) : (
              <p className="mt-3 text-sm text-army-charcoal/80">
                {pedido.registro.nome} · Prec-cp {pedido.registro.prec_cp} · {pedido.registro.ano}<br />
                {pedido.tipo === 'desfazer'
                  ? `Protocolos ${pedido.registro.protocolos.join(', ')} voltarão a aparecer nas abas de grupos.`
                  : pedido.tipo === 'desfazer-lancamento'
                    ? `Protocolos ${pedido.registro.protocolos.join(', ')} voltarão a "Homologados para lançamento".`
                    : `Protocolos ${pedido.registro.protocolos.join(', ')} perdem o selo "pendente confirmado"; o rejeitado de grupo pago volta para "Rejeitado em grupo pago".`}
              </p>
            )}
            {pedido.tipo === 'manter' && (
              <p className="mt-3 text-xs text-army-green/75">
                Confirma que é pendência própria, sem relação com outro protocolo pago. Ele segue nas abas de pendência com o selo
                "pendente confirmado" e sem o aviso de pago em outro BI.
              </p>
            )}
            {pedido.tipo === 'lancar' && (
              <>
                <p className="mt-3 text-xs text-army-green/75">
                  Confirma que o pagamento foi feito de fato. O protocolo sai de "Homologados para lançamento" e fica em
                  "Lançamentos registrados", onde pode ser desfeito.
                </p>
                <label className="block mt-4 text-sm font-semibold text-army-green" htmlFor="dea-mes-folha">
                  Mês da folha de pagamento
                </label>
                <input
                  id="dea-mes-folha"
                  type="month"
                  value={mesFolha}
                  onChange={(e) => setMesFolha(e.target.value)}
                  className="mt-1 w-full border border-army-green/15 p-2 text-sm focus:border-army-green outline-none"
                />
              </>
            )}
            {pedido.tipo === 'sippes' && (
              <>
                <p className="mt-3 text-xs text-army-green/75">
                  Registra que o pagamento foi lançado no SIPPES. O protocolo continua em "Homologados para lançamento" até
                  o registro do mês da folha, depois do pagamento de fato.
                </p>
                <label className="block mt-4 text-sm font-semibold text-army-green" htmlFor="dea-mes-ref">
                  Mês/ano de referência do pagamento
                </label>
                <input
                  id="dea-mes-ref"
                  type="month"
                  value={mesFolha}
                  onChange={(e) => setMesFolha(e.target.value)}
                  className="mt-1 w-full border border-army-green/15 p-2 text-sm focus:border-army-green outline-none"
                />
                <label className="block mt-3 text-sm font-semibold text-army-green" htmlFor="dea-operador">
                  Operador que realizou o registro
                </label>
                <input
                  id="dea-operador"
                  type="text"
                  value={operador}
                  maxLength={OPERADOR_MAX}
                  autoFocus
                  onChange={(e) => setOperador(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && confirmarPedido()}
                  className="mt-1 w-full border border-army-green/15 p-2 text-sm focus:border-army-green outline-none"
                />
                <p className="mt-1 text-right text-xs text-army-green/75">{operador.length}/{OPERADOR_MAX}</p>
              </>
            )}
            {pedido.tipo !== 'sippes' && (<>
            <label className="block mt-4 text-sm font-semibold text-army-green" htmlFor="dea-motivo">
              {pedido.tipo === 'lancar' ? 'Observação (opcional)' : `Motivo${'grupo' in pedido ? '' : ' (opcional)'}`}
            </label>
            <textarea
              id="dea-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={500}
              rows={pedido.tipo === 'lancar' ? 2 : 3}
              autoFocus={pedido.tipo !== 'lancar'}
              placeholder={pedido.tipo === 'resolver' ? 'ex.: crédito pago no protocolo 123456, em outro Nr BI'
                : pedido.tipo === 'manter' ? 'ex.: dívida diferente da paga no protocolo 123456; aguardando novo protocolo' : ''}
              className="mt-1 w-full border border-army-green/15 p-2 text-sm focus:border-army-green outline-none"
            />
            </>)}
            {erroAcao && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{erroAcao}</p>}
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={fecharPedido} disabled={enviandoAcao} className="px-4 py-2 text-sm font-bold text-army-green/75 hover:text-army-charcoal/80">
                Cancelar
              </button>
              <button
                onClick={confirmarPedido}
                disabled={enviandoAcao}
                className="px-4 py-2 bg-army-green text-white text-sm font-bold hover:bg-army-mid disabled:opacity-60"
              >
                {enviandoAcao ? 'Enviando…' : PEDIDOS[pedido.tipo].botao}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeaDashboard;
