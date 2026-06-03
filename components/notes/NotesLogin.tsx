
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Lock, ShieldCheck, Database, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { supabase, checkConnection, ConnectionStatus } from '../../services/supabaseClient';

interface NotesLoginProps {
  onBack: () => void;
  onLoginSuccess: () => void;
}

const NotesLogin: React.FC<NotesLoginProps> = ({ onBack, onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Estados de diagnóstico
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('missing_keys');
  const [connMessage, setConnMessage] = useState('Verificando...');

  useEffect(() => {
    checkConnection().then(result => {
      setConnStatus(result.status);
      setConnMessage(result.message || '');
    });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Bypass/Mock login para demonstração se não tiver supabase configurado ou se user for admin/admin
    if (!supabase || (email === 'admin' && password === 'admin')) {
      setTimeout(() => {
        setLoading(false);
        onLoginSuccess();
      }, 1000);
      return;
    }

    // Fix: Using type assertion to any to resolve 'signInWithPassword' not being recognized on SupabaseAuthClient type
    const { error } = await (supabase.auth as any).signInWithPassword({
      email,
      password,
    });

    setLoading(false);
    if (error) {
      // Detecção específica para erro de URL inválida que retorna HTML em vez de JSON
      if (error.message && error.message.includes('JSON')) {
         alert('Erro Crítico de Conexão: O cliente Supabase recebeu uma resposta inválida. Verifique se a URL do projeto (VITE_SUPABASE_URL) está correta e começa com "https://".');
      } else {
         alert('Erro de autenticação: ' + error.message);
      }
    } else {
      onLoginSuccess();
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <button 
        onClick={onBack}
        className="absolute top-8 left-8 text-gray-500 hover:text-divpag-900 flex items-center gap-2 transition-colors"
      >
        <ArrowLeft size={20} /> Voltar
      </button>

      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-fade-in-up">
        <div className="bg-divpag-900 p-8 text-center">
          <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
            <Lock className="text-army-gold" size={32} />
          </div>
          <h2 className="text-2xl font-montserrat font-bold text-white">Acesso Administrativo</h2>
          <p className="text-divpag-300 text-sm mt-2">Área restrita a oficiais da DivPag</p>
        </div>

        <form onSubmit={handleLogin} className="p-8 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Usuário / Email</label>
            <input 
              type="text" 
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-divpag-500 focus:border-divpag-500 outline-none transition-all"
              placeholder="admin@divpag.eb.mil.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <input 
              type="password" 
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-divpag-500 focus:border-divpag-500 outline-none transition-all"
              placeholder="••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-divpag-600 hover:bg-divpag-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {loading ? 'Verificando...' : (
              <>
                <ShieldCheck size={20} /> Entrar
              </>
            )}
          </button>
        </form>

        {/* Diagnóstico de Conexão */}
        <div className="bg-gray-50 px-8 py-4 border-t border-gray-100 flex justify-between items-center">
          <div className="flex flex-col">
             <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Status do Banco</span>
             <span className="text-[10px] text-gray-400 truncate max-w-[150px]" title={connMessage}>{connMessage}</span>
          </div>
          
          <div className="flex items-center gap-2">
            {connStatus === 'success' && (
              <span className="flex items-center gap-1 text-xs text-green-600 font-bold bg-green-50 px-2 py-1 rounded-full border border-green-200">
                <CheckCircle2 size={12} /> Conectado
              </span>
            )}
            {connStatus === 'missing_keys' && (
              <span className="flex items-center gap-1 text-xs text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded-full border border-amber-200" title="Verifique VITE_SUPABASE_URL">
                <AlertTriangle size={12} /> Chaves Inválidas (Demo)
              </span>
            )}
            {connStatus === 'error' && (
              <span className="flex items-center gap-1 text-xs text-red-600 font-bold bg-red-50 px-2 py-1 rounded-full border border-red-200">
                <XCircle size={12} /> Erro de Conexão (Demo)
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotesLogin;
