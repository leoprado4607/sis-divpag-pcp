import React, { useEffect, useState } from 'react';
import { ArrowLeft, Lock, LogOut, Loader2 } from 'lucide-react';

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

const DeaDashboard: React.FC<DeaDashboardProps> = ({ onBack }) => {
  const [status, setStatus] = useState<'verificando' | 'login' | 'dentro'>('verificando');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Sessão ainda válida (cookie de até 8h) entra direto, sem pedir a senha de novo.
  useEffect(() => {
    let ativo = true;
    fetch('/api/dea?r=sessao', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { autenticado: false }))
      .then((d) => { if (ativo) setStatus(d?.autenticado ? 'dentro' : 'login'); })
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
        setSenha('');
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
    setStatus('login');
  };

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
        <button onClick={sair} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/10 transition-colors text-sm font-semibold">
          <LogOut className="w-4 h-4 text-army-gold" /> Sair
        </button>
      </div>
      <iframe
        src="/dea/painel"
        title="Painel DEA — Exercícios Anteriores"
        className="flex-1 w-full border-0"
        referrerPolicy="no-referrer"
      />
    </div>
  );
};

export default DeaDashboard;
