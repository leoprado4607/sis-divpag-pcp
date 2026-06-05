// Sanitização de HTML das Notas (módulo Notes).
//
// As notas guardam HTML rico (o admin cola tabelas e textos formatados do Word),
// que depois é injetado via dangerouslySetInnerHTML — tanto no editor quanto na
// Consulta Pública. Sem sanitização, isso seria um vetor de XSS armazenado:
// qualquer <script>, atributo on*= ou href "javascript:" rodaria no navegador de
// todos os usuários que abrissem a nota.
//
// DOMPurify remove scripts, handlers de evento e URLs perigosas, MAS preserva a
// formatação segura (tabelas, negrito, alinhamento via style etc.) — exatamente o
// que o fluxo de colar do Word precisa.
import DOMPurify from 'dompurify';

export function sanitizeNoteHtml(dirty: string | null | undefined): string {
  if (!dirty) return '';
  return DOMPurify.sanitize(dirty, {
    // Perfil HTML: permite marcação de texto/tabela e bloqueia SVG/MathML
    // (vetores menos óbvios). Scripts e on*= já são removidos por padrão.
    USE_PROFILES: { html: true },
  });
}
