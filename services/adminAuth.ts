// Guarda o token de administrador (a senha digitada no login) em sessionStorage,
// para que as chamadas de escrita ao /api/admin possam enviá-lo. A validação real
// acontece no servidor, contra ADMIN_PASSWORD.
const KEY = 'andrecito_admin_token';

export function setAdminToken(token: string): void {
  try { sessionStorage.setItem(KEY, token); } catch { /* ignore */ }
}

export function getAdminToken(): string {
  try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; }
}

export function clearAdminToken(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
