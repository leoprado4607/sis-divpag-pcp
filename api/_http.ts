// Utilitário compartilhado para ler o corpo JSON de uma requisição serverless,
// com fallback à leitura crua do stream quando req.body não vem populado.
import { MAX_BODY_BYTES } from './_gemini';

export async function readJsonBody(req: any): Promise<any> {
  // O Vercel normalmente já popula req.body para JSON.
  if (req.body != null) {
    if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
    return req.body;
  }
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk: any) => {
      raw += chunk;
      if (raw.length > MAX_BODY_BYTES) {
        reject(new Error('Payload excede o tamanho máximo permitido.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}
