-- ====================================================================
-- SIPP — HARDENING DE SEGURANÇA (RLS + STORAGE)
-- Rode este script no SQL Editor do Supabase APÓS criar as tabelas.
-- É idempotente (pode rodar de novo sem erro).
--
-- Modelo de segurança:
--   • LEITURA pública (anon)         -> o portal é majoritariamente consulta.
--   • ESCRITA/EXCLUSÃO bloqueadas    -> nenhuma policy para anon = negado.
--     As gravações de admin passam pela função serverless /api/admin usando a
--     SERVICE_ROLE key (que ignora RLS por padrão). A anon key (pública, no
--     bundle) deixa de poder inserir/alterar/apagar dados ou arquivos.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1) TABELAS: habilitar RLS e permitir SOMENTE leitura pública
-- --------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'categories', 'subcategories', 'documents', 'document_texts',
    'general_subjects', 'specific_subjects', 'notes'
  ] LOOP
    -- Só age se a tabela existir
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

      -- Policy de leitura pública (recriada de forma idempotente)
      EXECUTE format('DROP POLICY IF EXISTS "public_read_%1$s" ON public.%1$s;', t);
      EXECUTE format(
        'CREATE POLICY "public_read_%1$s" ON public.%1$s FOR SELECT TO anon, authenticated USING (true);',
        t
      );

      -- Garante que NÃO existam policies antigas de escrita pública
      EXECUTE format('DROP POLICY IF EXISTS "public_write_%1$s" ON public.%1$s;', t);
      EXECUTE format('DROP POLICY IF EXISTS "public_insert_%1$s" ON public.%1$s;', t);
      EXECUTE format('DROP POLICY IF EXISTS "public_update_%1$s" ON public.%1$s;', t);
      EXECUTE format('DROP POLICY IF EXISTS "public_delete_%1$s" ON public.%1$s;', t);
    END IF;
  END LOOP;
END $$;

-- OBS: a SERVICE_ROLE ignora RLS automaticamente, então /api/admin grava normalmente.
-- Se futuramente você adotar Supabase Auth e quiser permitir escrita a usuários
-- logados, crie policies "TO authenticated" do tipo INSERT/UPDATE/DELETE conforme o caso.

-- --------------------------------------------------------------------
-- 2) STORAGE: bucket 'documents' com leitura pública e escrita protegida
-- --------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Remove QUALQUER policy antiga (inclusive as de escrita/exclusão públicas inseguras)
DROP POLICY IF EXISTS "Leitura Pública de Documentos" ON storage.objects;
DROP POLICY IF EXISTS "Envio Público de Documentos" ON storage.objects;
DROP POLICY IF EXISTS "Exclusão Pública de Documentos" ON storage.objects;
DROP POLICY IF EXISTS "documents_public_read" ON storage.objects;

-- Mantém apenas LEITURA pública (bucket é público para servir os PDFs).
CREATE POLICY "documents_public_read" ON storage.objects
    FOR SELECT TO public USING (bucket_id = 'documents');

-- Sem policies de INSERT/UPDATE/DELETE para anon: uploads/remoções só via
-- SERVICE_ROLE (api/admin) ou via Signed Upload URL gerada pelo servidor.
