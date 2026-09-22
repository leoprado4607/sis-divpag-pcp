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
// postMessage para cá; esta casca pede o motivo e a senha de administrador,
// chama o /api/dea e recarrega o iframe.

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
}
interface RegistroDesfazer { id: string; nome: string; prec_cp: string; ano: string; protocolos: string[] }
type PedidoResolvido =
  | { tipo: 'resolver'; grupo: GrupoResolver }
  | { tipo: 'desfazer'; registro: RegistroDesfazer };

function listaTexto(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)).slice(0, 200) : [];
}

// A mensagem vem do iframe do painel: só se aceita a do próprio iframe, na mesma origem.
function lerPedido(data: any): PedidoResolvido | null {
  if (data?.tipo === 'dea-resolver' && data.grupo) {
    const g = data.grupo;
    const protocolos = listaTexto(g.protocolos);
    if (!protocolos.length) return null;
    return {
      tipo: 'resolver',
      grupo: {
        protocolos, pagos_pessoa: listaTexto(g.pagos_pessoa),
        nome: String(g.nome || ''), prec_cp: String(g.prec_cp || ''), ano: String(g.ano || ''),
        nr_bi: String(g.nr_bi || ''), segmento: String(g.segmento || ''), aba: String(g.aba || ''),
        total: String(g.total || ''),
      },
    };
  }
  if (data?.tipo === 'dea-desfazer-resolvido' && data.registro?.id) {
    const r = data.registro;
    return {
      tipo: 'desfazer',
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
  const [senhaAcao, setSenhaAcao] = useState('');
  const [erroAcao, setErroAcao] = useState('');
  const [enviandoAcao, setEnviandoAcao] = useState(false);

  useEffect(() => {
    if (!admin) return;
    const aoReceber = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== iframeRef.current?.contentWindow) return;
      const p = lerPedido(e.data);
      if (!p) return;
      setPedido(p);
      setMotivo('');
      setSenhaAcao('');
      setErroAcao('');
    };
    window.addEventListener('message', aoReceber);
    return () => window.removeEventListener('message', aoReceber);
  }, [admin]);

  const fecharPedido = () => { if (!enviandoAcao) setPedido(null); };

  const confirmarPedido = async () => {
    if (!pedido || enviandoAcao) return;
    if (pedido.tipo === 'resolver' && motivo.trim().length < 5) { setErroAcao('Informe o motivo (mínimo de 5 caracteres).'); return; }
    if (!senhaAcao) { setErroAcao('Digite a senha de administrador.'); return; }
    setEnviandoAcao(true);
    setErroAcao('');
    try {
      const corpo = pedido.tipo === 'resolver'
        ? { acao: 'resolver', senha: senhaAcao, motivo: motivo.trim(), grupo: pedido.grupo }
        : { acao: 'desfazer-resolvido', senha: senhaAcao, motivo: motivo.trim(), id: pedido.registro.id };
      const r = await postDea(corpo);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErroAcao(d?.error || 'Não foi possível concluir.'); return; }
      setPedido(null);
      setSenhaAcao('');
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-army-green animate-spin" aria-label="Carregando" />
      </div>
    );
  }

  if (status === 'login') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full border-t-8 border-army-green shadow-2xl">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-army-green/5 text-army-green rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner"><Lock size={36} /></div>
              <h3 className="text-2xl font-bold text-slate-800 font-montserrat">Acesso Restrito</h3>
              <p className="text-xs text-slate-400 mt-1 uppercase font-bold tracking-wider">Exercícios Anteriores</p>
            </div>
            <div className="space-y-4">
                <input type="password" aria-label="Senha de acesso" placeholder="Digite a credencial..." value={senha} onChange={e => setSenha(e.target.value)} autoFocus className="w-full border-2 border-slate-100 p-4 rounded-2xl mb-2 text-center text-lg focus:border-army-green outline-none transition-colors bg-slate-50" onKeyDown={e => e.key === 'Enter' && entrar()}/>
                {erro && <p role="alert" className="text-center text-sm font-semibold text-red-600">{erro}</p>}
                <div className="flex gap-3">
                    <button onClick={onBack} className="flex-1 py-4 text-slate-400 font-bold hover:text-slate-600 transition-colors uppercase text-xs tracking-widest">VOLTAR</button>
                    <button onClick={entrar} disabled={enviando} className="flex-1 bg-army-green text-white py-4 rounded-2xl font-black shadow-lg hover:bg-green-900 transition-all uppercase text-xs tracking-widest disabled:opacity-60">{enviando ? 'VERIFICANDO...' : 'AUTENTICAR'}</button>
                </div>
            </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#faf9f5]">
      <div className="bg-army-green text-white border-b-4 border-army-gold flex items-center justify-between px-3 py-1.5 shrink-0">
        <button onClick={onBack} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/10 transition-colors text-sm font-semibold">
          <ArrowLeft className="w-4 h-4 text-army-gold" /> Início
        </button>
        <div className="flex items-center gap-2">
          {admin && (
            <>
              <span className="hidden sm:inline text-xs text-white/80" aria-live="polite">
                {textoStatus}
                {falhou && !msgAtualizacao && atual?.ultima?.url && (
                  <> <a href={atual.ultima.url} target="_blank" rel="noopener noreferrer" className="underline text-army-gold">ver log</a></>
                )}
              </span>
              <button
                onClick={atualizar}
                disabled={rodando || atual?.configurado === false}
                title="Baixa a planilha e regera o painel (apenas administrador)"
                className="flex items-center gap-2 px-3 py-1 rounded-lg bg-army-gold text-army-green hover:brightness-110 transition text-sm font-bold disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 ${rodando ? 'animate-spin' : ''}`} /> {rodando ? 'Atualizando' : 'Atualizar'}
              </button>
            </>
          )}
          <button onClick={sair} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/10 transition-colors text-sm font-semibold">
            <LogOut className="w-4 h-4 text-army-gold" /> Sair
          </button>
        </div>
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
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={fecharPedido}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dea-pedido-titulo"
            className="bg-white rounded-2xl w-full max-w-lg p-6 border-t-8 border-army-green shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === 'Escape' && fecharPedido()}
          >
            <h3 id="dea-pedido-titulo" className="text-lg font-bold text-slate-800">
              {pedido.tipo === 'resolver' ? 'Enviar grupo para resolvidos' : 'Desfazer resolvido manual'}
            </h3>
            {pedido.tipo === 'resolver' ? (
              <dl className="mt-3 text-sm text-slate-700 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="font-semibold">Nome</dt><dd>{pedido.grupo.nome || '—'}</dd>
                <dt className="font-semibold">Prec-cp</dt><dd>{pedido.grupo.prec_cp}</dd>
                <dt className="font-semibold">Ano · Nr BI</dt><dd>{pedido.grupo.ano} · {pedido.grupo.nr_bi}</dd>
                <dt className="font-semibold">Protocolos</dt><dd className="break-words">{pedido.grupo.protocolos.join(', ')} ({pedido.grupo.total})</dd>
                <dt className="font-semibold">Aba</dt><dd>{pedido.grupo.aba}</dd>
                {pedido.grupo.pagos_pessoa.length > 0 && (
                  <><dt className="font-semibold">Pago em outro BI</dt><dd>{pedido.grupo.pagos_pessoa.join(', ')}</dd></>
                )}
              </dl>
            ) : (
              <p className="mt-3 text-sm text-slate-700">
                {pedido.registro.nome} · Prec-cp {pedido.registro.prec_cp} · {pedido.registro.ano}<br />
                Protocolos {pedido.registro.protocolos.join(', ')} voltarão a aparecer nas abas de grupos.
              </p>
            )}
            <label className="block mt-4 text-xs font-bold uppercase tracking-wider text-slate-500" htmlFor="dea-motivo">
              Motivo{pedido.tipo === 'desfazer' ? ' (opcional)' : ''}
            </label>
            <textarea
              id="dea-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={500}
              rows={3}
              autoFocus
              placeholder={pedido.tipo === 'resolver' ? 'ex.: crédito pago no protocolo 123456, em outro Nr BI' : ''}
              className="mt-1 w-full border-2 border-slate-200 rounded-xl p-2 text-sm focus:border-army-green outline-none"
            />
            <label className="block mt-3 text-xs font-bold uppercase tracking-wider text-slate-500" htmlFor="dea-senha-acao">
              Senha de administrador
            </label>
            <input
              id="dea-senha-acao"
              type="password"
              autoComplete="current-password"
              value={senhaAcao}
              onChange={(e) => setSenhaAcao(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmarPedido()}
              className="mt-1 w-full border-2 border-slate-200 rounded-xl p-2 text-sm focus:border-army-green outline-none"
            />
            {erroAcao && <p role="alert" className="mt-3 text-sm font-semibold text-red-600">{erroAcao}</p>}
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={fecharPedido} disabled={enviandoAcao} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">
                Cancelar
              </button>
              <button
                onClick={confirmarPedido}
                disabled={enviandoAcao}
                className="px-4 py-2 rounded-xl bg-army-green text-white text-sm font-bold hover:bg-green-900 disabled:opacity-60"
              >
                {enviandoAcao ? 'Enviando…' : pedido.tipo === 'resolver' ? 'Enviar para resolvidos' : 'Desfazer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeaDashboard;
