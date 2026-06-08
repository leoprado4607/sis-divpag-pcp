
import React, { useState } from 'react';
import {
  Shield, User, Bot, Search, FileText, ArrowLeft,
  ChevronRight, Briefcase, ChevronLeft
} from 'lucide-react';
import { setAdminToken } from '../../services/adminAuth';

interface AndrecitoLoginProps {
  onLogin: (role: 'admin' | 'guest') => void;
  onBack: () => void;
}

const AndrecitoLogin: React.FC<AndrecitoLoginProps> = ({ onLogin, onBack }) => {
  const [view, setView] = useState<'selection' | 'admin'>('selection');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (username.toLowerCase() !== 'admin') {
      alert('Credenciais inválidas. Verifique o usuário e a senha.');
      return;
    }
    setLoading(true);

    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': password },
        body: JSON.stringify({ action: '__verify__' }),
      });
      if (res.status === 401) {
        alert('Credenciais inválidas. Verifique o usuário e a senha.');
        setLoading(false);
        return;
      }
    } catch {
      /* sem rede: modo local */
    }

    setAdminToken(password);
    onLogin('admin');
  };

  return (
    <div className="min-h-[100dvh] w-full flex overflow-hidden">

      {/* ── LEFT: Branding (desktop only) ── */}
      <div className="hidden lg:flex lg:w-3/5 bg-army-green relative flex-col text-white">

        {/* Dot texture */}
        <div
          className="absolute inset-0 opacity-[0.12] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,.9) 1px, transparent 0)', backgroundSize: '28px 28px' }}
        />

        {/* Back button */}
        <div className="relative z-10 px-12 pt-10">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-white/40 hover:text-army-gold transition-colors text-[11px] font-medium tracking-[0.14em] uppercase"
          >
            <ArrowLeft size={13} />
            Voltar ao Portal
          </button>
        </div>

        {/* Center content */}
        <div className="flex-1 flex flex-col items-center justify-center relative z-10 px-14 -mt-8">

          {/* Crest circle */}
          <div className="w-[68px] h-[68px] rounded-full bg-white/[0.07] border border-army-gold/35 flex items-center justify-center mb-7 transition-all hover:border-army-gold/70">
            <img
              src="https://lh3.googleusercontent.com/d/1z58eVvaJZ55IAZ_ebEeLXzpPZCXO2fBU=s240"
              referrerPolicy="no-referrer"
              alt="Brasão DivPag"
              className="w-[54px] h-[54px] object-contain drop-shadow-lg"
            />
          </div>

          <p className="text-[9px] tracking-[0.2em] uppercase text-army-gold/75 font-medium mb-3 text-center">
            Divisão de Pagamento de Pessoal
          </p>
          <h1 className="font-cormorant font-semibold text-[2.6rem] xl:text-5xl text-white text-center leading-[1.1] mb-10">
            Sistema de <span className="italic">Pesquisas</span>
          </h1>

          {/* Feature card */}
          <div className="w-full max-w-md border border-white/[0.1] bg-white/[0.04] p-7">
            <div className="border-l-2 border-army-gold pl-4 mb-6">
              <p className="text-[10px] tracking-[0.14em] uppercase text-army-gold/65 font-medium mb-1.5">
                Plataforma Integrada
              </p>
              <p className="text-sm text-white/50 leading-relaxed">
                Inteligência artificial aplicada à legislação militar.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 border-t border-white/[0.1] pt-5">
              {([
                { Icon: Bot, label: 'IA RAG' },
                { Icon: Search, label: 'Busca' },
                { Icon: FileText, label: 'Acervo' },
              ] as const).map(({ Icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-2">
                  <div className="w-9 h-9 bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
                    <Icon size={16} className="text-army-gold" />
                  </div>
                  <span className="text-[9px] font-medium tracking-[0.12em] uppercase text-white/35">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 px-12 py-4 border-t border-white/[0.08]">
          <p className="text-[10px] text-white/25 tracking-wide">
            © {new Date().getFullYear()} Divisão de Pagamento de Pessoal / B Adm Gu Natal
          </p>
        </div>
      </div>

      {/* ── RIGHT: Login ── */}
      <div className="w-full lg:w-2/5 relative flex items-center justify-center bg-army-cream">

        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.025] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(46,61,26,.9) 1px, transparent 1px), linear-gradient(90deg, rgba(46,61,26,.9) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* Mobile back */}
        <button
          onClick={onBack}
          className="lg:hidden absolute top-6 left-6 flex items-center gap-1.5 text-army-green/40 hover:text-army-green transition-colors text-[11px] font-medium tracking-[0.12em] uppercase"
        >
          <ArrowLeft size={13} /> Portal
        </button>

        {/* Card */}
        <div className="relative z-10 w-full max-w-sm px-6">
          <div className="bg-white border border-army-gold/20 shadow-[0_12px_48px_rgba(46,61,26,0.10)]">
            <div className="h-[3px] w-full bg-army-gold" />

            <div className="p-8">
              <div className="mb-7">
                <p className="text-[9px] tracking-[0.18em] uppercase text-army-gold font-medium mb-2">
                  {view === 'selection' ? 'Acesso ao Sistema' : 'Área Restrita'}
                </p>
                <h2 className="font-cormorant font-semibold text-[1.6rem] text-army-green leading-tight">
                  {view === 'selection' ? 'Bem-vindo' : 'Acesso Restrito'}
                </h2>
              </div>

              {view === 'selection' ? (
                <div className="space-y-3">
                  {/* Guest button */}
                  <button
                    onClick={() => onLogin('guest')}
                    className="group w-full bg-white border border-army-green/15 hover:border-army-green hover:bg-army-green p-4 flex items-center justify-between transition-all duration-200"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-9 h-9 bg-army-cream group-hover:bg-white/[0.12] flex items-center justify-center transition-colors">
                        <User size={17} className="text-army-green group-hover:text-white transition-colors" />
                      </div>
                      <div className="text-left">
                        <span className="block font-medium text-army-green group-hover:text-white text-sm transition-colors">Consultas</span>
                        <span className="block text-[11px] text-army-green/45 group-hover:text-white/55 transition-colors">Consulta Pública</span>
                      </div>
                    </div>
                    <ChevronRight size={15} className="text-army-green/25 group-hover:text-white/50 transition-colors" />
                  </button>

                  {/* Admin button */}
                  <button
                    onClick={() => setView('admin')}
                    className="group w-full bg-white border border-army-gold/20 hover:border-army-gold hover:bg-army-gold p-4 flex items-center justify-between transition-all duration-200"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-9 h-9 bg-army-cream group-hover:bg-white/[0.15] flex items-center justify-center transition-colors">
                        <Shield size={17} className="text-army-gold group-hover:text-white transition-colors" />
                      </div>
                      <div className="text-left">
                        <span className="block font-medium text-army-charcoal group-hover:text-white text-sm transition-colors">Administrador</span>
                        <span className="block text-[11px] text-army-charcoal/40 group-hover:text-white/55 transition-colors">Gestão do Sistema</span>
                      </div>
                    </div>
                    <ChevronRight size={15} className="text-army-gold/35 group-hover:text-white/50 transition-colors" />
                  </button>
                </div>
              ) : (
                <form onSubmit={handleAdminLogin} className="space-y-4">
                  <div className="relative">
                    <User className="absolute left-3.5 top-3.5 text-army-green/30" size={15} />
                    <input
                      type="text"
                      className="w-full pl-10 pr-4 py-3 border border-army-green/20 bg-army-cream focus:border-army-green focus:bg-white outline-none transition-all text-sm text-army-charcoal placeholder-army-green/30"
                      placeholder="Usuário"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                    />
                  </div>
                  <div className="relative">
                    <Briefcase className="absolute left-3.5 top-3.5 text-army-green/30" size={15} />
                    <input
                      type="password"
                      className="w-full pl-10 pr-4 py-3 border border-army-green/20 bg-army-cream focus:border-army-green focus:bg-white outline-none transition-all text-sm text-army-charcoal placeholder-army-green/30"
                      placeholder="Senha"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-army-green hover:bg-army-mid text-white py-3 text-[11px] font-semibold tracking-[0.14em] uppercase transition-colors disabled:opacity-60 mt-1"
                  >
                    {loading ? 'Validando...' : 'Entrar no Sistema'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('selection')}
                    className="w-full flex items-center justify-center gap-1.5 text-army-green/35 hover:text-army-green text-[11px] transition-colors pt-1 uppercase font-medium tracking-wide"
                  >
                    <ChevronLeft size={13} /> Voltar
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AndrecitoLogin;
