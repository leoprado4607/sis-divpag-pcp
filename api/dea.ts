// Função serverless (Vercel) do Painel DEA — login e entrega protegida do painel
// e do dados.js. Toda a lógica vive em _dea.ts (compartilhada com o dev do Vite).
// Rotas públicas /dea/painel e /dea/dados.js são reescritas para cá no vercel.json.
import { handleDea } from './_dea.js';

export default async function handler(req: any, res: any) {
  return handleDea(req, res);
}
