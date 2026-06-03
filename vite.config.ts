
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { runGemini, isRequestAllowed, checkRateLimit, getClientIp } from './api/_gemini'

// Plugin SÓ de desenvolvimento: replica o endpoint serverless /api/gemini (mesma
// lógica de origem + rate limit + chamada) para que `npm run dev` funcione sem
// `vercel dev`. A chave (API_KEY) fica no processo do servidor de dev, nunca no cliente.
function geminiDevApi(apiKey: string, allowedOrigins: string, rateMax: number, rateWindowMs: number) {
  return {
    name: 'gemini-dev-api',
    apply: 'serve' as const,
    configureServer(server: any) {
      // /api/admin não é servido em dev (precisa de service_role + ADMIN_PASSWORD).
      // Responde 503 JSON para que o cliente caia, de forma limpa, no modo local.
      server.middlewares.use('/api/admin', (req: any, res: any) => {
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Admin indisponível em dev (use Vercel ou vercel dev). Operando em modo local.' }));
      });

      server.middlewares.use('/api/gemini', (req: any, res: any) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Método não permitido.' }));
          return;
        }
        if (!isRequestAllowed(req, allowedOrigins)) {
          res.statusCode = 403;
          res.end(JSON.stringify({ error: 'Origem não autorizada.' }));
          return;
        }
        const rl = checkRateLimit(getClientIp(req), rateMax, rateWindowMs);
        if (!rl.allowed) {
          res.statusCode = 429;
          res.setHeader('Retry-After', String(rl.retryAfterSec));
          res.end(JSON.stringify({ error: 'Muitas requisições. Tente novamente em instantes.' }));
          return;
        }
        let raw = '';
        req.on('data', (c: any) => { raw += c; });
        req.on('end', async () => {
          // Dica de setup (sem segredo) é útil em dev e pode ser exibida.
          if (!apiKey) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Defina API_KEY no .env para usar a IA em dev.' }));
            return;
          }
          try {
            const body = raw ? JSON.parse(raw) : {};
            const text = await runGemini(apiKey, body);
            res.statusCode = 200;
            res.end(JSON.stringify({ text }));
          } catch (e: any) {
            // O erro do Gemini pode conter a chave (o Google a ecoa): logamos o detalhe
            // só no console do servidor e devolvemos mensagem genérica, igual à produção.
            console.error('[gemini-dev-api] Erro:', e?.message || e);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Falha ao processar a requisição de IA.' }));
          }
        });
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Fix: Cast process to any to avoid "Property 'cwd' does not exist on type 'Process'" error in some environments
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    // A chave do Gemini (API_KEY) é INTENCIONALMENTE deixada de fora do `define`:
    // ela só existe no servidor (função /api/gemini e plugin de dev acima).
    plugins: [
      react(),
      geminiDevApi(
        env.API_KEY || env.GEMINI_API_KEY || '',
        env.ALLOWED_ORIGINS || '',
        Number(env.GEMINI_RATE_LIMIT) || 20,
        (Number(env.GEMINI_RATE_WINDOW_SEC) || 60) * 1000,
      ),
    ],
    define: {
      'process.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''),
      'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || ''),
      'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '')
    },
    build: {
      chunkSizeWarningLimit: 900,
      cssCodeSplit: true,
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('jspdf') || id.includes('pdfjs')) {
                return 'vendor-pdf';
              }
              if (id.includes('recharts') || id.includes('d3-')) {
                return 'vendor-charts';
              }
              if (id.includes('lucide')) {
                return 'vendor-ui';
              }
              // Libs pesadas usadas SÓ nas views lazy (Andrecito/DEA): isoladas em
              // seus próprios chunks para não pesarem no carregamento da home.
              if (id.includes('@google/genai')) {
                return 'vendor-genai';
              }
              if (id.includes('@supabase')) {
                return 'vendor-supabase';
              }
              if (
                id.includes('react-markdown') || id.includes('remark') ||
                id.includes('micromark') || id.includes('mdast') ||
                id.includes('hast') || id.includes('unist') ||
                id.includes('unified') || id.includes('vfile') ||
                id.includes('property-information') || id.includes('decode-named-character-reference')
              ) {
                return 'vendor-markdown';
              }
              return 'vendor-base';
            }
          },
        },
      },
    },
    resolve: {
      // React/ReactDOM agora são empacotados localmente pelo Vite (sem CDN esm.sh),
      // o que permite tree-shaking, minificação e os manualChunks acima funcionarem.
      dedupe: ['react', 'react-dom']
    }
  }
})
