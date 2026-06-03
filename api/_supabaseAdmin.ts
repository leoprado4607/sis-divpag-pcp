// Cliente Supabase com SERVICE_ROLE (lado servidor). Ignora RLS, então é usado
// SOMENTE na função /api/admin, após validar o token de administrador.
// A SERVICE_ROLE key NUNCA deve ir para o cliente — só existe em process.env.
import { createClient } from '@supabase/supabase-js';

let cached: any = null;

export function getAdminSupabase(): any {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export const DOCUMENTS_BUCKET = 'documents';
