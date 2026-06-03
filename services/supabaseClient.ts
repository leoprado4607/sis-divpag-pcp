
import { createClient } from '@supabase/supabase-js';

/**
 * Utilitário robusto para detecção de variáveis de ambiente.
 * Tenta buscar em múltiplas fontes comuns em ambientes Vite e Vercel.
 */
const getEnvVar = (key: string): string | undefined => {
  let value: string | undefined = undefined;

  // 1. Contexto Vite (import.meta.env)
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      value = import.meta.env[key];
    }
  } catch (e) {}

  // 2. Contexto process.env (Injetado pelo define do Vite ou ambiente Node)
  if (!value) {
    try {
      if (typeof process !== 'undefined' && process.env) {
        value = (process.env as any)[key];
      }
    } catch (e) {}
  }

  return value?.trim().replace(/^["']|["']$/g, '');
};

// Tenta variações comuns para garantir a conexão com o banco correto
const supabaseUrl = getEnvVar('VITE_SUPABASE_URL') || getEnvVar('SUPABASE_URL');
const supabaseKey = getEnvVar('VITE_SUPABASE_ANON_KEY') || getEnvVar('SUPABASE_ANON_KEY') || getEnvVar('SUPABASE_KEY');

if (!supabaseUrl || !supabaseKey) {
  console.warn("SIPP Alert: Supabase credentials not found. Using Mock Fallback mode. Please ensure SUPABASE_URL and SUPABASE_ANON_KEY are set in environment variables.");
} else {
  // Log discreto apenas para confirmar que a conexão está tentando usar chaves reais
  console.log("SIPP: Supabase credentials detected. Project URL:", supabaseUrl);
}

export const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      }
    })
  : null;

export type ConnectionStatus = 'success' | 'missing_keys' | 'error';

export const checkConnection = async (): Promise<{ status: ConnectionStatus; message?: string }> => {
  if (!supabase) {
    return { 
      status: 'missing_keys', 
      message: 'Chaves de conexão (URL/KEY) não detectadas no ambiente.' 
    };
  }

  try {
    // Teste de conexão minimalista para validar as chaves
    const { error } = await supabase.from('categories').select('id').limit(1);
    
    if (error) {
      return { 
        status: 'error', 
        message: `Erro na conexão com o banco: ${error.message}` 
      };
    }
    
    return { status: 'success', message: 'Conectado ao Supabase com sucesso.' };
  } catch (err: any) {
    return { 
      status: 'error', 
      message: `Erro de rede ao tentar acessar o Supabase.` 
    };
  }
};
