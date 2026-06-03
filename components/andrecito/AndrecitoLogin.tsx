
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

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Simulação de autenticação com restrição de usuário
    setTimeout(() => {
        const savedPass = localStorage.getItem('andrecito_admin_pass') || 'gs4607';
        // Apenas permite login se o usuário for 'admin' e a senha coincidir
        if (username.toLowerCase() === 'admin' && password === savedPass) {
            // Guarda a senha como token de admin: o /api/admin a revalida no servidor
            // (contra ADMIN_PASSWORD) antes de qualquer escrita com service_role.
            setAdminToken(password);
            onLogin('admin');
        } else {
            alert('Credenciais inválidas. Verifique o usuário e a senha.');
            setLoading(false);
        }
    }, 800);
  };

  return (
    <div className="min-h-[100dvh] w-full bg-[#1a3c1a] flex flex-row overflow-hidden font-sans">
      
      {/* 1. COLUNA DA ESQUERDA (BRANDING - DESKTOP ONLY) */}
      <div className="hidden lg:flex lg:w-3/5 bg-army-green relative flex-col text-white border-r border-white/10">
        
        {/* Textura de Fundo (Radial Dots - Igual ao Portal) */}
        <div className="absolute inset-0 opacity-30 pointer-events-none" 
             style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}>
        </div>
        
        {/* Topo: Navegação */}
        <div className="w-full flex justify-start relative z-10 p-12">
            <button 
                onClick={onBack} 
                className="flex items-center gap-3 text-army-gold hover:text-white transition-colors font-bold uppercase text-xs tracking-[0.15em] group"
            >
                <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> 
                Voltar ao Portal
            </button>
        </div>

        {/* CENTRO: Conteúdo Principal Agrupado */}
        <div className="flex-1 flex flex-col items-center justify-center relative z-10 w-full max-w-3xl mx-auto -mt-8 px-12">
            
            {/* Bloco de Identidade */}
            <div className="flex flex-col items-center text-center mb-10">
                {/* Brasão */}
                <div className="mb-6 filter drop-shadow-2xl transition-transform hover:scale-105 duration-500">
                    <img 
                        src="https://lh3.googleusercontent.com/d/1z58eVvaJZ55IAZ_ebEeLXzpPZCXO2fBU=s0" 
                        referrerPolicy="no-referrer"
                        alt="Brasão" 
                        className="w-24 h-24 object-contain"
                    />
                </div>

                {/* Títulos (Tipografia do Portal) */}
                <h2 className="text-army-gold font-roboto-slab font-bold text-xs tracking-[0.25em] uppercase mb-3 opacity-90">
                    Divisão de Pagamento de Pessoal
                </h2>
                <h1 className="text-4xl xl:text-5xl font-montserrat font-extrabold text-white leading-tight drop-shadow-lg tracking-tight">
                    Sistema de Pesquisas
                </h1>
            </div>

            {/* Card Institucional (Compacto e Elegante) */}
            <div className="w-full max-w-lg bg-white/5 backdrop-blur-md border border-white/10 p-8 rounded-2xl shadow-2xl relative overflow-hidden group hover:bg-white/10 transition-colors duration-500">
                <div className="absolute top-0 left-0 w-1 h-full bg-army-gold"></div>
                
                <div className="flex items-start justify-between mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-army-gold mb-1 font-montserrat">Plataforma Integrada</h3>
                        <p className="text-gray-300 text-xs leading-relaxed">
                            Inteligência artificial aplicada à legislação militar.
                        </p>
                    </div>
                    <Bot size={24} className="text-white/20" />
                </div>
                
                {/* Grid de Ícones Minimalista */}
                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/10">
                    <div className="flex flex-col items-center gap-2">
                        <div className="p-2 rounded-lg bg-white/5 text-army-gold shadow-inner">
                            <Bot size={20} />
                        </div>
                        <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wide">IA RAG</span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                        <div className="p-2 rounded-lg bg-white/5 text-army-gold shadow-inner">
                            <Search size={20} />
                        </div>
                        <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wide">Busca</span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                        <div className="p-2 rounded-lg bg-white/5 text-army-gold shadow-inner">
                            <FileText size={20} />
                        </div>
                        <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wide">Acervo</span>
                    </div>
                </div>
            </div>

        </div>

        {/* Rodapé Estilizado na Coluna Esquerda */}
        <footer className="w-full bg-army-light text-white py-[12px] border-t-[4px] border-army-gold relative overflow-hidden z-20">
            <div className="absolute inset-0 opacity-30 pointer-events-none" 
                 style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}>
            </div>
            <div className="max-w-7xl mx-auto px-4 text-center relative z-10">
                <p className="text-xs text-white/90 font-medium tracking-wide">
                  &copy; {new Date().getFullYear()} Divisão de Pagamento de Pessoal / B Adm Gu Natal.
                </p>
            </div>
        </footer>
      </div>

      {/* 2. COLUNA DA DIREITA (ACESSO - 40% Desktop / 100% Mobile) */}
      <div className="w-full lg:w-2/5 relative flex items-center justify-center bg-gray-900">
        
        {/* Background Image Container */}
        <div className="absolute inset-0 z-0 overflow-hidden">
            {/* Imagem com Ken Burns */}
            <div 
                className="absolute inset-0 bg-cover bg-center animate-ken-burns opacity-60"
                style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/d/19VJzsC8nHnsqNqKAlgJUuUS_22zkLmmy=s0")' }}
            ></div>
            
            {/* Overlays */}
            <div className="absolute inset-0 bg-gradient-to-b from-army-green/90 via-army-green/40 to-black/90 mix-blend-multiply"></div>
            <div className="absolute inset-0 bg-black/20"></div>
        </div>

        {/* 3. CARD DE LOGIN FLUTUANTE */}
        <div className="relative z-20 w-full max-w-sm px-6">
            
            <div className="bg-white/90 backdrop-blur-xl rounded-xl shadow-2xl overflow-hidden border border-white/50 animate-fade-in-up">
                {/* Faixa Superior Dourada */}
                <div className="h-2 w-full bg-army-gold"></div>

                <div className="p-8">
                    {/* CABEÇALHO DO CARD */}
                    <div className="text-center mb-8">
                        <h2 className="text-2xl font-bold text-army-green font-montserrat">
                            {view === 'selection' ? 'Bem-vindo' : 'Acesso Restrito'}
                        </h2>
                        <p className="text-gray-500 text-xs mt-1 uppercase tracking-wider">
                            {view === 'selection' ? 'Selecione seu perfil' : 'Credenciais Administrativas'}
                        </p>
                    </div>

                    {view === 'selection' ? (
                        /* ESTADO 1: SELEÇÃO */
                        <div className="space-y-4">
                            <button 
                                onClick={() => onLogin('guest')}
                                className="group w-full bg-white border border-gray-200 hover:border-army-green p-4 rounded-lg flex items-center justify-between transition-all duration-300 hover:shadow-md hover:-translate-y-1"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-gray-100 group-hover:bg-army-green text-gray-500 group-hover:text-white flex items-center justify-center transition-colors">
                                        <User size={20} />
                                    </div>
                                    <div className="text-left">
                                        <span className="block font-bold text-gray-800 text-sm">Consultas</span>
                                        <span className="block text-xs text-gray-500">Consulta Pública</span>
                                    </div>
                                </div>
                                <ChevronRight size={18} className="text-gray-300 group-hover:text-army-green" />
                            </button>

                            <button 
                                onClick={() => setView('admin')}
                                className="group w-full bg-white border border-gray-200 hover:border-army-gold p-4 rounded-lg flex items-center justify-between transition-all duration-300 hover:shadow-md hover:-translate-y-1"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-gray-100 group-hover:bg-army-gold text-gray-500 group-hover:text-white flex items-center justify-center transition-colors">
                                        <Shield size={20} />
                                    </div>
                                    <div className="text-left">
                                        <span className="block font-bold text-gray-800 text-sm">Administrador</span>
                                        <span className="block text-xs text-gray-500">Gestão do Sistema</span>
                                    </div>
                                </div>
                                <ChevronRight size={18} className="text-gray-300 group-hover:text-army-gold" />
                            </button>
                        </div>
                    ) : (
                        /* ESTADO 2: FORMULÁRIO ADMIN */
                        <form onSubmit={handleAdminLogin} className="space-y-5">
                            <div className="relative group">
                                <User className="absolute left-4 top-3.5 text-gray-400 group-focus-within:text-army-green transition-colors" size={18} />
                                <input 
                                    type="text" 
                                    className="w-full pl-12 pr-4 py-3 rounded-lg border border-gray-300 focus:border-army-green focus:ring-1 focus:ring-army-green outline-none transition-all bg-white text-gray-800 placeholder-gray-400 text-sm"
                                    placeholder="Usuário"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                />
                            </div>
                            
                            <div className="relative group">
                                <Briefcase className="absolute left-4 top-3.5 text-gray-400 group-focus-within:text-army-green transition-colors" size={18} />
                                <input 
                                    type="password" 
                                    className="w-full pl-12 pr-4 py-3 rounded-lg border border-gray-300 focus:border-army-green focus:ring-1 focus:ring-army-green outline-none transition-all bg-white text-gray-800 placeholder-gray-400 text-sm"
                                    placeholder="Senha"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>

                            <button 
                                type="submit" 
                                disabled={loading}
                                className="w-full bg-army-green hover:bg-green-900 text-white font-bold py-3 rounded-lg uppercase tracking-widest text-xs shadow-lg hover:shadow-xl transition-all disabled:opacity-70 mt-2"
                            >
                                {loading ? 'Validando...' : 'ENTRAR NO SISTEMA'}
                            </button>

                            <button 
                                type="button"
                                onClick={() => setView('selection')}
                                className="w-full flex items-center justify-center gap-2 text-gray-500 text-xs hover:text-army-green transition-colors pt-2 uppercase font-bold tracking-wide"
                            >
                                <ChevronLeft size={14} /> Voltar
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
