-- ====================================================================
-- SISTEMA ANDRECITO - MODELO DE DADOS DE LEGISLAÇÃO E RAG INTELIGENTE
-- INSTRUÇÕES DE INSTALAÇÃO NO SUPABASE
-- ====================================================================

-- 1. Criação da tabela de categorias (Grandes áreas / Subseções do acervo)
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Criação da tabela de subcategorias vinculadas à categoria mãe
CREATE TABLE IF NOT EXISTS public.subcategories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (category_id, name)
);

-- 3. Criação da tabela principal de documentos indexados
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    size BIGINT NOT NULL DEFAULT 0,
    mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    subcategory_id UUID REFERENCES public.subcategories(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Criação e liberação do Bucket 'documents' no Storage do Supabase:
-- Acesse a aba 'Storage' na barra de ferramentas do painel do seu Supabase,
-- clique em 'New Bucket', dê o nome de 'documents', e garanta que a opção
-- 'Public bucket' esteja ativada.
--
-- Para garantir funcionamento irrestrito nas requisições sem restrição de CORS,
-- execute as seguintes políticas de segurança (RLS Policies):

-- SEGURANÇA: somente LEITURA pública. Uploads/remoções passam pela função
-- serverless /api/admin (SERVICE_ROLE) ou por Signed Upload URL — NUNCA por
-- policy pública de INSERT/DELETE (a anon key é pública e iria ao bundle).
CREATE POLICY "documents_public_read" ON storage.objects
    FOR SELECT TO public USING (bucket_id = 'documents');

-- IMPORTANTE: rode também o script supabase_security.sql para habilitar RLS nas
-- tabelas (leitura pública + escrita protegida).

-- 5. Tabela de logs de consultas ao Andrecito (analytics de uso)
-- Execute no SQL Editor do Supabase para habilitar o painel de estatísticas.
CREATE TABLE IF NOT EXISTS public.andrecito_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_text TEXT NOT NULL,
    documents_used JSONB NOT NULL DEFAULT '[]'::jsonb,
    user_type TEXT NOT NULL DEFAULT 'guest',
    ip_hash TEXT,
    response_time_ms INTEGER,
    tokens_estimated INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Índice para ordenação e filtros de analytics (últimos N dias)
CREATE INDEX IF NOT EXISTS idx_andrecito_logs_created ON public.andrecito_logs(created_at DESC);

-- RLS habilitado: nenhuma policy pública — acesso apenas via service_role (API admin)
ALTER TABLE public.andrecito_logs ENABLE ROW LEVEL SECURITY;
