
// Manually define ImportMetaEnv to avoid 'vite/client' dependency issues in some environments
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_API_KEY: string;
  readonly VITE_GEMINI_MODEL?: string;
  readonly VITE_DEA_AI_PASSWORD?: string;
  [key: string]: any;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// O cliente usa import.meta.env, mas supabaseClient mantém um fallback
// `typeof process !== 'undefined'` para contextos Node/SSR. Esta declaração mínima
// satisfaz o type-checker sem trazer todos os tipos do Node para o código de browser.
// Em runtime no navegador `process` é de fato undefined e o guard simplesmente pula.
declare const process: { env: Record<string, string | undefined> } | undefined;
