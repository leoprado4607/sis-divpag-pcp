// Cliente das operações de escrita protegidas (/api/admin). O navegador nunca vê
// a SERVICE_ROLE key: ele só envia o token de admin e a ação desejada.
import { getAdminToken } from './adminAuth';

// Erro indicando que o backend admin não está disponível (sem rede, endpoint
// inexistente em dev = 404, ou não configurado = 503). Nesses casos o chamador
// pode cair para o modo local. Erros "reais" (401, 409, 400, 500) são surgidos
// ao usuário e NÃO devem virar gravação local silenciosa.
export class AdminUnavailableError extends Error {}

export async function adminRequest<T = any>(action: string, payload: Record<string, any> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api/admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': getAdminToken(),
      },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch (e: any) {
    throw new AdminUnavailableError(e?.message || 'Backend administrativo inacessível.');
  }

  let data: any = {};
  try { data = await res.json(); } catch { /* sem corpo JSON (ex.: 404 HTML do dev) */ }

  if (res.status === 404 || res.status === 503) {
    throw new AdminUnavailableError(data?.error || 'Backend administrativo indisponível.');
  }
  if (!res.ok) {
    throw new Error(data?.error || `Erro ${res.status} na operação administrativa.`);
  }
  return data as T;
}
