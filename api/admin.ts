// Função serverless (Vercel) para operações de ESCRITA do Andrecito.
// Usa a SERVICE_ROLE do Supabase (ignora RLS) e exige um token de administrador,
// validado contra ADMIN_PASSWORD (server-side). Assim a anon key pública deixa de
// poder gravar, e a escrita fica protegida de verdade.
//
// Env necessárias na Vercel:
//   SUPABASE_URL                 (ou VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY    (Settings → API → service_role secret)
//   ADMIN_PASSWORD               (senha que o admin digita no login)
import { timingSafeEqual } from 'node:crypto';
import { isRequestAllowed, getClientIp } from './_gemini.js';
import { checkRateLimitAsync } from './_ratelimit.js';
import { readJsonBody } from './_http.js';
import { getAdminSupabase, DOCUMENTS_BUCKET } from './_supabaseAdmin.js';

function sanitizeFileName(name: string): string {
  return (name || 'arquivo').replace(/[^a-zA-Z0-9.\-_]/g, '_');
}

// Comparação em tempo constante: evita que um atacante deduza a senha de admin
// medindo o tempo de resposta (timing attack) numa comparação de strings comum.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  // 1) Origem + rate limit (mesma proteção do proxy de IA).
  if (!isRequestAllowed(req, process.env.ALLOWED_ORIGINS)) {
    return res.status(403).json({ error: 'Origem não autorizada.' });
  }
  const max = Number(process.env.GEMINI_RATE_LIMIT) || 20;
  const windowMs = (Number(process.env.GEMINI_RATE_WINDOW_SEC) || 60) * 1000;
  const rl = await checkRateLimitAsync('admin:' + getClientIp(req), max, windowMs);
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    return res.status(429).json({ error: 'Muitas requisições. Tente novamente em instantes.' });
  }

  // 2) Autenticação de administrador (token = senha digitada no login).
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  if (!adminPassword) {
    return res.status(503).json({ error: 'Administração não configurada no servidor (ADMIN_PASSWORD ausente).' });
  }
  if (!safeEqual(req.headers['x-admin-token'] || '', adminPassword)) {
    return res.status(401).json({ error: 'Credenciais de administrador inválidas.' });
  }

  // 3) Cliente service_role.
  const db = getAdminSupabase();
  if (!db) {
    return res.status(503).json({ error: 'Supabase admin não configurado (SERVICE_ROLE/URL ausentes).' });
  }

  try {
    const body = await readJsonBody(req);
    const action = body?.action;

    switch (action) {
      case 'createCategory': {
        const { error } = await db.from('categories').insert({ name: body.name });
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }

      case 'deleteCategory': {
        // Validação de integridade no servidor (fonte da verdade).
        const subs = await db.from('subcategories').select('id').eq('category_id', body.id).limit(1);
        if ((subs.data || []).length > 0) {
          return res.status(409).json({ error: 'Existem subcategorias vinculadas a esta categoria.' });
        }
        const docs = await db.from('documents').select('id').eq('category_id', body.id).limit(1);
        if ((docs.data || []).length > 0) {
          return res.status(409).json({ error: 'Existem arquivos vinculados a esta categoria.' });
        }
        const { error } = await db.from('categories').delete().eq('id', body.id);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }

      case 'createSubcategory': {
        const { error } = await db.from('subcategories').insert({ category_id: body.categoryId, name: body.name });
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }

      case 'deleteSubcategory': {
        const docs = await db.from('documents').select('id').eq('subcategory_id', body.id).limit(1);
        if ((docs.data || []).length > 0) {
          return res.status(409).json({ error: 'Existem arquivos vinculados a esta subcategoria.' });
        }
        const { error } = await db.from('subcategories').delete().eq('id', body.id);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }

      case 'updateDocument': {
        const { error } = await db.from('documents').update(body.updates || {}).eq('id', body.id);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }

      case 'deleteDocument': {
        const { error: dbErr } = await db.from('documents').delete().eq('id', body.id);
        if (dbErr) throw dbErr;
        // Tenta remover o arquivo físico do storage.
        if (typeof body.url === 'string') {
          const parts = body.url.split(`/public/${DOCUMENTS_BUCKET}/`);
          if (parts.length > 1) {
            await db.storage.from(DOCUMENTS_BUCKET).remove([parts[1]]).catch(() => {});
          }
        }
        return res.status(200).json({ ok: true });
      }

      case 'createUploadUrl': {
        // Gera uma Signed Upload URL: o cliente envia o arquivo direto ao storage
        // (sem passar pela função → sem o limite de 4,5 MB de body da Vercel).
        const ts = Date.now();
        const safe = sanitizeFileName(body.fileName);
        const path = body.subcategoryId
          ? `${body.categoryId}/${body.subcategoryId}/${ts}_${safe}`
          : `${body.categoryId}/root/${ts}_${safe}`;
        const { data, error } = await db.storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
        if (error) throw error;
        const { data: pub } = db.storage.from(DOCUMENTS_BUCKET).getPublicUrl(path);
        return res.status(200).json({ path, token: data.token, publicUrl: pub.publicUrl });
      }

      case 'registerDocument': {
        const { error } = await db.from('documents').insert({
          name: body.name,
          url: body.url,
          size: body.size,
          mime_type: body.mime_type,
          category_id: body.category_id,
          subcategory_id: body.subcategory_id || null,
        });
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }

      case 'getAnalytics': {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const [totalRes, recentRes] = await Promise.all([
          db.from('andrecito_logs').select('*', { count: 'exact', head: true }),
          db.from('andrecito_logs')
            .select('query_text, ip_hash, tokens_estimated, user_type, created_at, documents_used')
            .gte('created_at', thirtyDaysAgo)
            .order('created_at', { ascending: false })
            .limit(500),
        ]);

        const rows: any[] = recentRes.data || [];

        const uniqueIps = new Set(rows.map((r) => r.ip_hash).filter(Boolean)).size;

        const dailyMap: Record<string, number> = {};
        rows.forEach((r) => {
          const day = (r.created_at as string).slice(0, 10);
          dailyMap[day] = (dailyMap[day] || 0) + 1;
        });
        const dailyUsage = Object.entries(dailyMap)
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => a.date.localeCompare(b.date));

        const tokensArr = rows.map((r) => r.tokens_estimated as number).filter(Boolean);
        const avgTokens = tokensArr.length
          ? Math.round(tokensArr.reduce((a, b) => a + b, 0) / tokensArr.length)
          : 0;

        return res.status(200).json({
          totalQueries: totalRes.count ?? 0,
          last30Days: rows.length,
          uniqueIps30Days: uniqueIps,
          avgTokens,
          dailyUsage,
          recentQueries: rows.slice(0, 50).map((r) => ({
            query_text: r.query_text,
            user_type: r.user_type,
            tokens_estimated: r.tokens_estimated,
            documents_used: r.documents_used,
            created_at: r.created_at,
          })),
        });
      }

      default:
        return res.status(400).json({ error: 'Ação desconhecida.' });
    }
  } catch (err: any) {
    console.error('Erro no /api/admin:', err?.message || err);
    return res.status(500).json({ error: 'Falha ao executar a operação administrativa.' });
  }
}
