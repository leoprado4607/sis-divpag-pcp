-- ====================================================================
-- SIPP - PORTAL DA DIVISÃO DE PAGAMENTO (DDL COMPLETO DE BANCO DE DADOS)
-- COPIE E COLE ESTE SCRIPT NO EDITOR SQL DO SEU PROJETO SUPABASE
-- ====================================================================

-- Habilitar a extensão pgcrypto para geração automática de UUIDs v4
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ====================================================================
-- SEÇÃO 1: SISTEMA E DIRETÓRIO DE OUTORGAS (ANDRECITO)
-- ====================================================================

-- 1. Tabela de Categorias (Departamentos) do Andrecito
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabela de Subcategorias do Andrecito
CREATE TABLE IF NOT EXISTS public.subcategories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (category_id, name)
);

-- 3. Tabela de Documentos do Andrecito
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

-- ====================================================================
-- SEÇÃO 2: SISTEMA DE COMPILADOR DE NOTAS DE BOLETIM (SIPP NOTES)
-- ====================================================================

-- 4. Tabela de Assuntos Gerais 
CREATE TABLE IF NOT EXISTS public.general_subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Tabela de Assuntos Específicos
CREATE TABLE IF NOT EXISTS public.specific_subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    general_subject_id UUID NOT NULL REFERENCES public.general_subjects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (general_subject_id, name)
);

-- 6. Tabela de Modelos de Notas de Boletim
CREATE TABLE IF NOT EXISTS public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    general_subject_id UUID NOT NULL REFERENCES public.general_subjects(id) ON DELETE CASCADE,
    specific_subject_id UUID NOT NULL REFERENCES public.specific_subjects(id) ON DELETE CASCADE,
    main_text TEXT NOT NULL,
    closing_text TEXT DEFAULT '',
    last_edited TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (general_subject_id, specific_subject_id)
);

-- ====================================================================
-- SEÇÃO 3: SEED DE DADOS INICIAIS (FACILITA DEMONSTRAÇÕES)
-- ====================================================================

-- Categorias do Andrecito
INSERT INTO public.categories (id, name) VALUES
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Legislação de Pessoal'),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'Portarias e Normas'),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 'Boletins Internos')
ON CONFLICT (name) DO NOTHING;

-- Subcategorias do Andrecito
INSERT INTO public.subcategories (id, category_id, name) VALUES
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'RDE - Regulamento Disciplinar'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Estatuto dos Militares'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'Pagamento de Gratificações')
ON CONFLICT (category_id, name) DO NOTHING;

-- Assuntos Gerais do SIPP Notes
INSERT INTO public.general_subjects (id, name) VALUES
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Administrativo'),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'Financeiro'),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 'Jurídico')
ON CONFLICT (name) DO NOTHING;

-- Assuntos Específicos do SIPP Notes
INSERT INTO public.specific_subjects (id, general_subject_id, name) VALUES
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Punição Disciplinar'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Elogio Individual'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'Desconto em Folha')
ON CONFLICT (general_subject_id, name) DO NOTHING;

-- ====================================================================
-- SEÇÃO 4: CONFIGURAÇÃO DO BUCKET DE DOCUMENTOS (STORAGE)
-- ====================================================================
-- NOTA: O Supabase exige que os buckets do storage sejam criados pela interface 
-- ou via funções do Postgres da API. Execute o comando abaixo no Editor SQL:

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- SEGURANÇA: apenas LEITURA pública no bucket. Uploads/remoções são feitos pela
-- função serverless /api/admin (SERVICE_ROLE) ou via Signed Upload URL.
-- NÃO crie policies de INSERT/DELETE públicas (a anon key é pública!).
CREATE POLICY "documents_public_read" ON storage.objects
    FOR SELECT TO public USING (bucket_id = 'documents');

-- ====================================================================
-- SEÇÃO 5: RLS — habilite a segurança por linha rodando supabase_security.sql
-- (leitura pública + escrita protegida). Sem isso, a anon key abre CRUD total.
-- ====================================================================
