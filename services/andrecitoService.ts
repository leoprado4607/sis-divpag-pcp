import { supabase } from './supabaseClient';
import { callGemini } from './geminiClient';
import { adminRequest, AdminUnavailableError } from './adminClient';
import { AndrecitoCategory, AndrecitoSubcategory, AndrecitoDocument } from '../types';

declare global {
  interface Window {
    pdfjsLib: any;
  }
}

// --- CARREGAMENTO SOB DEMANDA DO PDF.JS ---
// pdf.js é AUTO-HOSPEDADO em /vendor/pdfjs (same-origin), não mais via cdnjs:
// remove a dependência de terceiro em runtime (sem risco de supply-chain/SRI) e
// permite tirar o cdnjs da CSP. Só é injetado na 1ª vez que processamos um PDF.
// Para atualizar a versão, baixe pdf.min.js + pdf.worker.min.js correspondentes.
const PDFJS_SRC = '/vendor/pdfjs/pdf.min.js';
const PDFJS_WORKER_SRC = '/vendor/pdfjs/pdf.worker.min.js';
let pdfjsPromise: Promise<any> | null = null;

const ensurePdfJs = (): Promise<any> => {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfjsPromise) return pdfjsPromise;

  pdfjsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PDFJS_SRC;
    script.async = true;
    script.onload = () => {
      try {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
      } catch (e) { /* worker config best-effort */ }
      resolve(window.pdfjsLib);
    };
    script.onerror = () => {
      pdfjsPromise = null;
      reject(new Error('Falha ao carregar pdf.js'));
    };
    document.head.appendChild(script);
  });
  return pdfjsPromise;
};

// --- KEYS & CACHE CONFIG ---
const PDF_CACHE_KEY = 'andrecito_pdf_cache';
const MAX_CACHE_SIZE = 100;
// TTL reduzido de 3 dias → 1 dia: a legislação/normas mudam, e um cache longo
// arriscava servir texto desatualizado de um documento substituído. Há também
// limpeza manual disponível no painel Admin (andrecitoService.clearTextCache()).
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 dia

const LOCAL_CAT_KEY = 'andrecito_local_categories';
const LOCAL_SUB_KEY = 'andrecito_local_subcategories';
const LOCAL_DOC_KEY = 'andrecito_local_documents';

// Controle de custo de tokens: teto de texto enviado por documento ao Gemini e
// teto de tokens de saída. Evita prompts gigantes quando vários docs são selecionados.
// MAX_DOC_CHARS reduzido de 12k → 6k: análises jurídicas focadas não precisam de
// mais que os primeiros 6k chars de cada documento para responder com precisão.
const MAX_DOC_CHARS = 6000;
// MAX_OUTPUT_TOKENS: respostas jurídicas detalhadas com múltiplos artigos e fontes
// facilmente ultrapassam 2048 tokens — teto aumentado para evitar JSON truncado.
const MAX_OUTPUT_TOKENS = 4096;
// Teto do corpo enviado ao /api/gemini. A Vercel recusa (413) bodies acima de
// 4,5 MB e o próprio proxy aceita até 4 MB (MAX_BODY_BYTES em api/_gemini.ts);
// a folga cobre o systemInstruction, o schema e o escape do JSON. PDFs sem texto
// extraível vão inteiros em base64 e são os que estouram esse limite.
const MAX_PAYLOAD_BYTES = 3.5 * 1024 * 1024;

// Temperatura da IA: 0.15 era fria demais para análise jurídica (respostas
// repetitivas e rasas). 0.35 dá mais contexto interpretativo sem perder fidelidade
// aos documentos. Configurável via VITE_GEMINI_TEMPERATURE (0..1).
const GEMINI_TEMPERATURE = (() => {
  const raw = Number((import.meta as any).env?.VITE_GEMINI_TEMPERATURE);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0.35;
})();

// Seleção adaptativa de modelo: consultas simples (poucas palavras, poucos docs)
// usam gemini-2.5-flash-lite — mais barato. Consultas complexas usam
// gemini-2.5-flash. VITE_GEMINI_MODEL sobrescreve ambos.
// NOTA: gemini-1.5-flash e gemini-2.0-flash foram DESCONTINUADOS pelo Google
// (generateContent retorna 404 "no longer available") — não reintroduzir.
const SIMPLE_MODEL = 'gemini-2.5-flash-lite';
const COMPLEX_MODEL = 'gemini-2.5-flash';
// Modelos que suportam thinkingConfig. Adicione aqui ao adotar novos modelos.
const THINKING_MODELS = new Set(['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite']);

const selectModel = (query: string, docCount: number): string => {
  const envModel = (import.meta as any).env?.VITE_GEMINI_MODEL;
  if (envModel) return envModel;
  const wordCount = query.trim().split(/\s+/).length;
  // Threshold conservador: apenas consultas muito curtas com 1 documento usam o
  // modelo leve. Consultas jurídicas com ≥6 palavras exigem raciocínio mais profundo.
  return wordCount <= 5 && docCount <= 1 ? SIMPLE_MODEL : COMPLEX_MODEL;
};

// --- FILTRAGEM DE RELEVÂNCIA (pré-envio ao Gemini) ---
// Antes de mandar os documentos selecionados para a IA, pontuamos cada um pela
// presença dos termos da consulta no seu conteúdo (e nome do arquivo). Mantemos
// TODOS os documentos com alguma relevância — sem teto de quantidade — apenas
// descartando os de relevância ZERO, que só inflariam os tokens de entrada sem
// contribuir para a resposta. É um ranqueamento leve por sobreposição de termos
// (sem chamada extra de embeddings): rápido, gratuito e determinístico.
const SCORE_STOPWORDS_PT = new Set([
  'que','qual','quais','quanto','quantos','como','onde','quando','porque','por',
  'para','com','sem','sobre','dos','das','nos','nas','uma','uns','umas','ele',
  'ela','seu','sua','seus','suas','este','esta','isso','aos','pelo','pela','ser',
  'são','foi','tem','ter','meu','minha','nao','não','sim','mais','menos','muito'
]);

const normalizeForScore = (text: string): string =>
  text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Extrai os termos significativos da consulta (≥3 chars, sem stopwords, sem
// duplicatas). Se a consulta só tiver palavras vazias, retorna [] → o chamador
// trata como "sem sinal" e envia todos os documentos (fallback seguro).
const extractQueryTokens = (query: string): string[] =>
  Array.from(new Set(
    normalizeForScore(query)
      .split(/[^a-z0-9]+/)
      .filter(t => t.length >= 3 && !SCORE_STOPWORDS_PT.has(t))
  ));

// Pontua um documento: soma as ocorrências (limitadas por termo, para que um
// único termo repetido não domine) de cada token da consulta no texto pesquisável
// (nome do arquivo + conteúdo). Score 0 = nenhum termo aparece.
const scoreRelevance = (queryTokens: string[], haystack: string): number => {
  if (queryTokens.length === 0) return 0;
  const normalized = normalizeForScore(haystack);
  let score = 0;
  for (const tok of queryTokens) {
    let idx = normalized.indexOf(tok);
    let count = 0;
    while (idx !== -1 && count < 25) {
      count++;
      idx = normalized.indexOf(tok, idx + tok.length);
    }
    score += count;
  }
  return score;
};

// --- INITIAL MOCK SEEDS ---
const INITIAL_CATEGORIES: AndrecitoCategory[] = [
  { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', name: 'Legislação de Pessoal' },
  { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', name: 'Portarias e Normas' },
  { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', name: 'Boletins Internos' },
  { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14', name: 'Manuais de Campanha' }
];

const INITIAL_SUBCATEGORIES: AndrecitoSubcategory[] = [
  { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', category_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', name: 'RDE - Regulamento Disciplinar' },
  { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', category_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', name: 'Estatuto dos Militares' },
  { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', category_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', name: 'Pagamento de Gratificações' },
  { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14', category_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', name: 'Diárias e Ajuda de Custo' },
  { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15', category_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', name: 'Boletins do Exército (BE)' }
];

const INITIAL_DOCUMENTS: AndrecitoDocument[] = [
  {
    id: 'd0ee0000-0000-0000-0000-000000000001',
    name: 'Estatuto_dos_Militares_L6880.pdf',
    url: 'https://www.defesa.gov.br/arquivos/legislacao/estatuto_dos_militares.pdf',
    size: 215400,
    mime_type: 'application/pdf',
    category_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    subcategory_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
    created_at: '2026-01-15T12:00:00.000Z'
  },
  {
    id: 'd0ee0000-0000-0000-0000-000000000002',
    name: 'Regulamento_Disciplinar_do_Exercito_R113.pdf',
    url: 'http://www.planalto.gov.br/ccivil_03/decreto/2002/d4346.htm',
    size: 145000,
    mime_type: 'application/pdf',
    category_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    subcategory_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    created_at: '2026-02-10T14:30:00.000Z'
  },
  {
    id: 'd0ee0000-0000-0000-0000-000000000003',
    name: 'Gratificacoes_e_Adicionais_Previnidos.pdf',
    url: 'https://sgex.eb.mil.br/gratificacoes.pdf',
    size: 98500,
    mime_type: 'application/pdf',
    category_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
    subcategory_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13',
    created_at: '2026-03-01T09:15:00.000Z'
  },
  {
    id: 'd0ee0000-0000-0000-0000-000000000004',
    name: 'Portaria_Diarias_Ajuda_Custo_2024.pdf',
    url: 'https://sgex.eb.mil.br/diarias.pdf',
    size: 124000,
    mime_type: 'application/pdf',
    category_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
    subcategory_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14',
    created_at: '2026-04-18T10:00:00.000Z'
  },
  {
    id: 'd0ee0000-0000-0000-0000-000000000005',
    name: 'Boletim_do_Exercito_N25_2025.pdf',
    url: 'https://sgex.eb.mil.br/be25_2025.pdf',
    size: 1845000,
    mime_type: 'application/pdf',
    category_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13',
    subcategory_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15',
    created_at: '2026-05-22T16:45:00.000Z'
  }
];

const INITIAL_TEXT_CACHE: Record<string, { text: string; timestamp: number }> = {
  'd0ee0000-0000-0000-0000-000000000001': {
    text: "O Estatuto dos Militares (Lei nº 6.880, de 9 de dezembro de 1980) dispõe sobre a situação, obrigações, deveres, direitos e prerrogativas dos membros das Forças Armadas brasileiros. Artigo 50 dispõe detalhadamente sobre os direitos dos militares, incluindo férias regulamentares remuneradas, assistência médica, odontológica e hospitalar gratuita no FUSEX, e estabilidade do praça que atinja 10 anos de efetivo serviço militar. Artigo 98 trata detalhadamente do processo e regras para a transferência de militares da guarnição para a reserva de forma remunerada.",
    timestamp: Date.now()
  },
  'd0ee0000-0000-0000-0000-000000000002': {
    text: "O Regulamento Disciplinar do Exército (R-113), aprovado pelo Decreto nº 4.346, de 26 de agosto de 2002, especifica as transgressões disciplinares no âmbito do Exército Brasileiro e estabelece a normatização técnica para aplicação de punições e recompensas. Artigo 14 elenca a lista completa de transgressões disciplinares em ordem de severidade, organizadas em leves, médias e graves, compreendendo falhas graves em serviço, ato de desrespeito a superiores e faltas injustificadas. Artigo 24 estabelece quais punições disciplinares podem ser legitimamente aplicadas eletronicamente pela autoridade: advertência, impedimento disciplinar, repreensão, detenção disciplinar, prisão disciplinar e licenciamento forçado das praças a bem da disciplina.",
    timestamp: Date.now()
  },
  'd0ee0000-0000-0000-0000-000000000003': {
    text: "Normas internas sobre Gratificações, Ajuda de Custo e Adicionais Financeiros de Pessoal do Exército Brasileiro. Descreve detalhadamente a Gratificação de Localidade Especial (categorias A e B) devida aos militares posicionados e prestando serviço permanente em guarnições isoladas, de fronteira ou caracterizadas de difícil acesso. Estabelece rigorosamente a aplicabilidade do Adicional de Habilitação Militar com percentuais indexados legalmente, variando substancialmente dependendo do nível de especialização: Altos Estudos I e II, Aperfeiçoamento profissional, Especialização de Sargentos/Oficiais e Formação Básica de Oficiais das Forças Armadas.",
    timestamp: Date.now()
  },
  'd0ee0000-0000-0000-0000-000000000004': {
    text: "Portaria DGP que regulamenta a concessão de Diárias administrativas e Ajuda de Custo destinadas a deslocamentos temporários e instalações por movimentação no Exército. A ajuda de custo destina-se expressamente a compensar e cobrir financeiramente despesas com mudanças residenciais e custos iniciais de instalação física do militar e suas respectivas famílias ao se transferir para uma nova sede militar de trabalho (regulamentado pelo artigo 53). As diárias são indenizações diárias de alimentação e estadia destinadas a cobrir custos extras ao se ausentar temporariamente da guarnição de origem por motivo regulamentar de serviço (artigo 62).",
    timestamp: Date.now()
  },
  'd0ee0000-0000-0000-0000-000000000005': {
    text: "Boletim Informativo do Exército nº 25 de 2025. Divulga resoluções de âmbito militar, decisões normativas do Comandante do Exército, promoções de praças por merecimento ou antiguidade e decisões do Departamento-Geral do Pessoal (DGP). Portaria DGP/CEx nº 544 dispõe especificamente sobre as novas instruções reguladoras e prazos de recadastramento anual e comprovação eletrônica de prova de vida obrigatória para pensionistas, reservistas remunerados, viúvas e militares inativos sob auditoria de proventos de pensão alimentícia da Divisão de Pagamento de Pessoal.",
    timestamp: Date.now()
  }
};

// --- INITIALIZATION OF LOCAL FALLBACK DATABASE ---
const initLocalDatabase = () => {
  try {
    if (!localStorage.getItem(LOCAL_CAT_KEY)) {
      localStorage.setItem(LOCAL_CAT_KEY, JSON.stringify(INITIAL_CATEGORIES));
    }
    if (!localStorage.getItem(LOCAL_SUB_KEY)) {
      localStorage.setItem(LOCAL_SUB_KEY, JSON.stringify(INITIAL_SUBCATEGORIES));
    }
    if (!localStorage.getItem(LOCAL_DOC_KEY)) {
      localStorage.setItem(LOCAL_DOC_KEY, JSON.stringify(INITIAL_DOCUMENTS));
    }
    
    const currentTextCache = JSON.parse(localStorage.getItem(PDF_CACHE_KEY) || '{}');
    let updated = false;
    Object.entries(INITIAL_TEXT_CACHE).forEach(([id, val]) => {
      if (!currentTextCache[id]) {
        currentTextCache[id] = val;
        updated = true;
      }
    });
    if (updated) {
      localStorage.setItem(PDF_CACHE_KEY, JSON.stringify(currentTextCache));
    }
  } catch (err) {
    console.warn("Erro ao instanciar banco de dados local cache:", err);
  }
};

initLocalDatabase();

// --- HELPER LOCAL STATE READ/WRITE ---
const getLocalCategories = (): AndrecitoCategory[] => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_CAT_KEY) || '[]');
  } catch {
    return INITIAL_CATEGORIES;
  }
};

const getLocalSubcategories = (): AndrecitoSubcategory[] => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_SUB_KEY) || '[]');
  } catch {
    return INITIAL_SUBCATEGORIES;
  }
};

const getLocalDocuments = (): AndrecitoDocument[] => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_DOC_KEY) || '[]');
  } catch {
    return INITIAL_DOCUMENTS;
  }
};

const saveLocalCategories = (data: AndrecitoCategory[]) => {
  localStorage.setItem(LOCAL_CAT_KEY, JSON.stringify(data));
};

const saveLocalSubcategories = (data: AndrecitoSubcategory[]) => {
  localStorage.setItem(LOCAL_SUB_KEY, JSON.stringify(data));
};

const saveLocalDocuments = (data: AndrecitoDocument[]) => {
  localStorage.setItem(LOCAL_DOC_KEY, JSON.stringify(data));
};

// --- PDF CACHING UTILS ---
// Antes cada leitura/gravação fazia JSON.parse + stringify do cache INTEIRO no
// localStorage (síncrono). No loop de queryGemini isso virava O(N²) e travava a
// main thread. Agora o cache vive em memória: lê do localStorage uma única vez e
// as gravações são agrupadas (debounce) num único write.
type CacheEntry = { text: string; timestamp: number };
let textCacheMem: Record<string, CacheEntry> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

const loadTextCache = (): Record<string, CacheEntry> => {
  if (textCacheMem) return textCacheMem;
  try {
    textCacheMem = JSON.parse(localStorage.getItem(PDF_CACHE_KEY) || '{}');
  } catch {
    textCacheMem = {};
  }
  return textCacheMem!;
};

const flushTextCache = () => {
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
  try {
    localStorage.setItem(PDF_CACHE_KEY, JSON.stringify(textCacheMem || {}));
  } catch (e) {
    try { localStorage.removeItem(PDF_CACHE_KEY); } catch {}
  }
};

const schedulePersist = () => {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(flushTextCache, 300);
};

// Garante que gravações pendentes não se percam ao fechar/ocultar a aba.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { if (persistTimer) flushTextCache(); });
}

const getCachedText = (docId: string): string | null => {
  const cache = loadTextCache();
  const cachedItem = cache[docId];
  if (cachedItem && (Date.now() - cachedItem.timestamp < CACHE_TTL_MS)) {
    return cachedItem.text;
  }
  return null;
};

const cacheText = (docId: string, text: string) => {
  const cache = loadTextCache();
  cache[docId] = { text, timestamp: Date.now() };
  const keys = Object.keys(cache);
  if (keys.length > MAX_CACHE_SIZE) {
    const oldest = keys.reduce((a, b) => cache[a].timestamp < cache[b].timestamp ? a : b);
    delete cache[oldest];
  }
  schedulePersist();
};

const urlToBase64 = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const parts = base64String.split(',');
        resolve(parts.length > 1 ? parts[1] : base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("Erro ao converter URL para Base64:", e);
    return "";
  }
};

const extractTextFromPdfUrl = async (url: string, pageLimit = 30): Promise<string> => {
  try {
    const pdfjsLib = await ensurePdfJs();
    if (!pdfjsLib) return "";
    const loadingTask = pdfjsLib.getDocument(url);
    const pdf = await loadingTask.promise;
    const maxPages = Math.min(pdf.numPages, pageLimit);

    // Processa as páginas em paralelo em vez de uma a uma (await sequencial),
    // reduzindo drasticamente o tempo de extração em PDFs com várias páginas.
    const pageNumbers = Array.from({ length: maxPages }, (_, i) => i + 1);
    const pageTexts = await Promise.all(
      pageNumbers.map(async (i) => {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        return `\n[Pag ${i}]\n${pageText}\n`;
      })
    );
    return pageTexts.join('');
  } catch (error) {
    console.error("Erro PDF.js:", error);
    return "";
  }
};

// Um PDF digitalizado devolve só os marcadores [Pag N] e, às vezes, um carimbo ou
// cabeçalho com camada de texto. Exige uma média mínima de caracteres por página
// para considerar que o pdf.js extraiu o documento de verdade.
const isUsefulText = (text: string | null | undefined): text is string => {
  if (!text) return false;
  const pages = Math.max(1, (text.match(/\[Pag \d+\]/g) || []).length);
  const chars = text.replace(/\[Pag \d+\]/g, '').replace(/\s+/g, '').length;
  return chars >= 50 && chars / pages >= 100;
};

// --- TEXTO INDEXADO NO SUPABASE (tabela document_texts) ---
// Extraído uma única vez por documento (pelo admin) e lido por todas as consultas.
// Tabela ausente ou erro de rede → mapa vazio, e a consulta segue pelo caminho antigo.
const MAX_STORED_TEXT_CHARS = 1_000_000;

const fetchStoredTexts = async (ids: string[]): Promise<Map<string, string>> => {
  const map = new Map<string, string>();
  if (!supabase || ids.length === 0) return map;
  try {
    // Lotes de 100 ids para não estourar o tamanho da URL do filtro "in".
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await supabase.from('document_texts')
        .select('document_id, content').in('document_id', ids.slice(i, i + 100));
      if (error) throw error;
      (data || []).forEach((r: any) => map.set(r.document_id, r.content));
    }
  } catch (e) {
    console.warn('Texto indexado indisponível, extraindo no navegador:', e);
  }
  return map;
};

// Upload "mock" local: usado quando não há Supabase configurado ou quando o
// backend admin está indisponível. Mantém o sistema funcional em modo offline/demo.
const localUploadFallback = async (file: File, categoryId: string, subcategoryId: string | null): Promise<void> => {
  const docId = `doc-${Date.now()}`;
  const objectUrl = URL.createObjectURL(file);

  let extractedText = "";
  if (file.type === 'text/plain') {
    extractedText = await file.text();
  } else if (file.type === 'application/pdf') {
    extractedText = await extractTextFromPdfUrl(objectUrl);
  } else {
    extractedText = `Esta é uma simulação de conteúdo para o arquivo carregado ${file.name} que pertence à categoria ID ${categoryId}`;
  }

  if (!extractedText || extractedText.length < 20) {
    extractedText = `Conteúdo indexado para consulta do arquivo '${file.name}'. Criado na data ${new Date().toLocaleDateString()}. Focado em decisões administrativas do Exército Brasileiro.`;
  }

  cacheText(docId, extractedText);

  const newDoc: AndrecitoDocument = {
    id: docId,
    name: file.name,
    url: objectUrl,
    size: file.size,
    mime_type: file.type || 'application/octet-stream',
    category_id: categoryId,
    subcategory_id: subcategoryId,
    created_at: new Date().toISOString()
  };
  saveLocalDocuments([...getLocalDocuments(), newDoc]);
};

// --- SERVICE IMPLEMENTATION ---
export const andrecitoService = {
  // Limpa o cache de texto extraído dos PDFs (memória + localStorage). Útil quando
  // um documento é substituído e o texto antigo ainda está cacheado. Retorna a
  // quantidade de entradas removidas.
  clearTextCache(): number {
    try {
      const count = Object.keys(loadTextCache()).length;
      textCacheMem = {};
      if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
      try { localStorage.removeItem(PDF_CACHE_KEY); } catch {}
      return count;
    } catch {
      return 0;
    }
  },

  async getCategories(): Promise<AndrecitoCategory[]> {
    if (!supabase) return getLocalCategories();
    try {
      const { data, error } = await supabase.from('categories').select('*').order('name');
      if (error) throw error;
      return (data && data.length > 0) ? data : getLocalCategories();
    } catch (e) {
      console.warn("Andrecito SIPP: Falha na listagem remota, usando BD Local/Fallback:", e);
      return getLocalCategories();
    }
  },

  async getSubcategories(categoryId: string): Promise<AndrecitoSubcategory[]> {
    if (!supabase) return getLocalSubcategories().filter(s => s.category_id === categoryId);
    try {
      const { data, error } = await supabase.from('subcategories').select('*').eq('category_id', categoryId).order('name');
      if (error) throw error;
      return (data && data.length > 0) ? data : getLocalSubcategories().filter(s => s.category_id === categoryId);
    } catch (e) {
      console.warn("Andrecito SIPP: Usando subcategorias locaux debido a erro ou ausência de tabelas.");
      return getLocalSubcategories().filter(s => s.category_id === categoryId);
    }
  },

  async getAllSubcategories(): Promise<AndrecitoSubcategory[]> {
    if (!supabase) return getLocalSubcategories();
    try {
      const { data, error } = await supabase.from('subcategories').select('*').order('name');
      if (error) throw error;
      return (data && data.length > 0) ? data : getLocalSubcategories();
    } catch (e) {
      return getLocalSubcategories();
    }
  },

  async getDocuments(subcategoryId: string): Promise<AndrecitoDocument[]> {
    if (!supabase) return getLocalDocuments().filter(d => d.subcategory_id === subcategoryId);
    try {
      const { data, error } = await supabase.from('documents').select('*').eq('subcategory_id', subcategoryId);
      if (error) throw error;
      return (data && data.length > 0) ? data : getLocalDocuments().filter(d => d.subcategory_id === subcategoryId);
    } catch (e) {
      return getLocalDocuments().filter(d => d.subcategory_id === subcategoryId);
    }
  },

  async getDocumentsByCategory(categoryId: string): Promise<AndrecitoDocument[]> {
    if (!supabase) return getLocalDocuments().filter(d => d.category_id === categoryId && !d.subcategory_id);
    try {
      const { data, error } = await supabase.from('documents').select('*').eq('category_id', categoryId).is('subcategory_id', null);
      if (error) throw error;
      return (data && data.length > 0) ? data : getLocalDocuments().filter(d => d.category_id === categoryId && !d.subcategory_id);
    } catch (e) {
      return getLocalDocuments().filter(d => d.category_id === categoryId && !d.subcategory_id);
    }
  },

  async searchAllDocuments(): Promise<AndrecitoDocument[]> {
    if (!supabase) return getLocalDocuments();
    try {
      const { data, error } = await supabase.from('documents').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data && data.length > 0) ? data : getLocalDocuments();
    } catch (e) {
      return getLocalDocuments();
    }
  },

  async createCategory(name: string): Promise<void> {
    // Escrita protegida via /api/admin (service_role). Fallback local só se o
    // backend estiver indisponível (offline/demo); erros reais sobem ao usuário.
    try {
      await adminRequest('createCategory', { name });
      saveLocalCategories([...getLocalCategories(), { id: `cat-${Date.now()}`, name }]);
    } catch (err) {
      if (err instanceof AdminUnavailableError) {
        saveLocalCategories([...getLocalCategories(), { id: `cat-${Date.now()}`, name }]);
        console.warn('createCategory: backend indisponível, criado localmente.');
      } else { throw err; }
    }
  },

  async deleteCategory(id: string): Promise<void> {
    // Validação local rápida (UX). O servidor revalida como fonte da verdade.
    const subs = getLocalSubcategories().filter(s => s.category_id === id);
    const docs = getLocalDocuments().filter(d => d.category_id === id);
    if (subs.length > 0) throw new Error("Não é possível excluir: existem subcategorias vinculadas.");
    if (docs.length > 0) throw new Error("Não é possível excluir: existem arquivos vinculados a esta categoria.");

    try {
      await adminRequest('deleteCategory', { id });
      saveLocalCategories(getLocalCategories().filter(c => c.id !== id));
    } catch (err) {
      if (err instanceof AdminUnavailableError) {
        saveLocalCategories(getLocalCategories().filter(c => c.id !== id));
        console.warn('deleteCategory: backend indisponível, excluído localmente.');
      } else { throw err; }
    }
  },

  async createSubcategory(categoryId: string, name: string): Promise<void> {
    try {
      await adminRequest('createSubcategory', { categoryId, name });
      saveLocalSubcategories([...getLocalSubcategories(), { id: `sub-${Date.now()}`, category_id: categoryId, name }]);
    } catch (err) {
      if (err instanceof AdminUnavailableError) {
        saveLocalSubcategories([...getLocalSubcategories(), { id: `sub-${Date.now()}`, category_id: categoryId, name }]);
        console.warn('createSubcategory: backend indisponível, criado localmente.');
      } else { throw err; }
    }
  },

  async deleteSubcategory(id: string): Promise<void> {
    const docs = getLocalDocuments().filter(d => d.subcategory_id === id);
    if (docs.length > 0) throw new Error("Não é possível excluir: existem arquivos vinculados a esta subcategoria.");

    try {
      await adminRequest('deleteSubcategory', { id });
      saveLocalSubcategories(getLocalSubcategories().filter(s => s.id !== id));
    } catch (err) {
      if (err instanceof AdminUnavailableError) {
        saveLocalSubcategories(getLocalSubcategories().filter(s => s.id !== id));
        console.warn('deleteSubcategory: backend indisponível, excluído localmente.');
      } else { throw err; }
    }
  },

  async deleteDocument(id: string, url: string): Promise<void> {
    try {
      await adminRequest('deleteDocument', { id, url });
      saveLocalDocuments(getLocalDocuments().filter(d => d.id !== id));
    } catch (err) {
      if (err instanceof AdminUnavailableError) {
        saveLocalDocuments(getLocalDocuments().filter(d => d.id !== id));
        console.warn('deleteDocument: backend indisponível, excluído localmente.');
      } else { throw err; }
    }
  },

  async updateDocument(id: string, updates: Partial<AndrecitoDocument>): Promise<void> {
    try {
      await adminRequest('updateDocument', { id, updates });
      saveLocalDocuments(getLocalDocuments().map(d => d.id === id ? { ...d, ...updates } : d));
    } catch (err) {
      if (err instanceof AdminUnavailableError) {
        saveLocalDocuments(getLocalDocuments().map(d => d.id === id ? { ...d, ...updates } : d));
        console.warn('updateDocument: backend indisponível, atualizado localmente.');
      } else { throw err; }
    }
  },

  async uploadDocument(file: File, categoryId: string, subcategoryId: string | null): Promise<void> {
    // Sem cliente Supabase (modo demo) → upload mock local.
    if (!supabase) return localUploadFallback(file, categoryId, subcategoryId);

    try {
      // 1. Servidor (service_role) gera uma Signed Upload URL para o caminho.
      const { path, token, publicUrl } = await adminRequest<{ path: string; token: string; publicUrl: string }>(
        'createUploadUrl',
        { categoryId, subcategoryId, fileName: file.name }
      );

      // 2. Cliente envia o arquivo DIRETO ao storage (sem passar pela função →
      //    sem o limite de 4,5 MB de body da Vercel), autorizado pelo token.
      const { error: upErr } = await supabase.storage.from('documents').uploadToSignedUrl(path, token, file);
      if (upErr) throw new Error(`Falha no upload ao storage: ${upErr.message}`);

      // 3. Registra os metadados no banco (via service_role).
      await adminRequest('registerDocument', {
        name: file.name, url: publicUrl, size: file.size,
        mime_type: file.type, category_id: categoryId, subcategory_id: subcategoryId,
      });

      // 4. Best-effort: indexa o texto (extração ou transcrição) para as consultas.
      //    Se falhar, o documento fica "pendente" e pode ser indexado pelo painel.
      try {
        const { data } = await supabase.from('documents').select('*').eq('url', publicUrl).single();
        if (data?.id) await andrecitoService.indexDocumentText(data);
      } catch (e) {
        console.warn(`Indexação de ${file.name} ficou pendente:`, e);
      }
    } catch (err) {
      if (err instanceof AdminUnavailableError) {
        // Backend indisponível → cai para o upload mock local.
        return localUploadFallback(file, categoryId, subcategoryId);
      }
      throw err;
    }
  },

  // Situação do texto indexado de cada documento: id → 'pdfjs' | 'gemini'.
  // Documento ausente do mapa = pendente. Não traz o conteúdo (listagem leve).
  async getTextIndexStatus(): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (!supabase) throw new Error('Indexação indisponível no modo local (Supabase não configurado).');
    const { data, error } = await supabase.from('document_texts').select('document_id, source');
    if (error) throw new Error(`Tabela document_texts indisponível: ${error.message}`);
    (data || []).forEach((r: any) => map.set(r.document_id, r.source));
    return map;
  },

  // Indexa o texto de um documento no Supabase: tenta o pdf.js no navegador e, se
  // o PDF for digitalizado (sem texto útil), pede a transcrição ao servidor.
  async indexDocumentText(doc: AndrecitoDocument): Promise<'pdfjs' | 'gemini'> {
    if (doc.mime_type !== 'application/pdf') throw new Error('Só PDFs são indexados.');
    const text = await extractTextFromPdfUrl(doc.url, 1000);
    if (isUsefulText(text)) {
      await adminRequest('saveDocumentText', { id: doc.id, content: text.slice(0, MAX_STORED_TEXT_CHARS) });
      cacheText(doc.id, text);
      return 'pdfjs';
    }
    await adminRequest('transcribeDocument', { id: doc.id });
    return 'gemini';
  },

  async queryGemini(query: string, documents: AndrecitoDocument[], userType?: string): Promise<string> {
    const usedDocsMap = new Map<string, AndrecitoDocument>();
    const storedTexts = await fetchStoredTexts(documents.map(d => d.id));

    // Âncora inicial (query-sandwich): colocar a consulta ANTES dos documentos
    // direciona a atenção do modelo para o que é relevante durante a leitura.
    const parts: any[] = [
      { text: `CONSULTA: ${query}\n\nAnalise os documentos a seguir com foco específico nessa consulta:\n` }
    ];

    // Cada documento vira uma "entrada" com: as parts que iriam ao Gemini, o texto
    // usado para pontuar relevância (nome + conteúdo) e se é um anexo base64 (PDF
    // que não pôde ser extraído — sem texto para pontuar de forma confiável).
    type DocEntry = { doc: AndrecitoDocument; parts: any[]; scoreText: string; isBinary: boolean };

    const docPromises = documents.map(async (doc): Promise<DocEntry | null> => {
      try {
        // Ordem: texto indexado no Supabase → cache local → extração pelo pdf.js.
        let text = storedTexts.get(doc.id) || getCachedText(doc.id);
        if (!text) {
          // Se for mock/URL blob local, tenta extrair imediatamente, senão busca
          text = await extractTextFromPdfUrl(doc.url);
          if (isUsefulText(text)) cacheText(doc.id, text);
        }

        if (isUsefulText(text)) {
          // Limita o texto por documento para conter o custo de tokens de entrada.
          const capped = text.length > MAX_DOC_CHARS
            ? text.slice(0, MAX_DOC_CHARS) + '\n[...documento truncado para análise...]'
            : text;
          return {
            doc,
            parts: [{ text: `\nARQUIVO: ${doc.name}\nCONTEUDO: ${capped}\n` }],
            scoreText: `${doc.name} ${text}`,
            isBinary: false,
          };
        } else {
          // Fallback para conversão em base64 se for PDF e não conseguimos extrair texto puro
          if (doc.mime_type === 'application/pdf' && !doc.url.startsWith('blob:')) {
            const base64Data = await urlToBase64(doc.url);
            if (base64Data) {
              return {
                doc,
                parts: [
                  { text: `\n[Processando PDF: ${doc.name}]\n` },
                  { inlineData: { mimeType: 'application/pdf', data: base64Data } }
                ],
                // Sem texto extraído → só dá para pontuar pelo nome do arquivo.
                scoreText: doc.name,
                isBinary: true,
              };
            }
          }
        }
      } catch (err) {
        console.error(`Erro ao processar ${doc.name}:`, err);
      }
      return null;
    });

    const entries = (await Promise.all(docPromises)).filter((e): e is DocEntry => e !== null);

    // --- RANQUEAMENTO POR RELEVÂNCIA (sem limite de quantidade) ---
    const queryTokens = extractQueryTokens(query);
    const scored = entries.map(e => ({ entry: e, score: scoreRelevance(queryTokens, e.scoreText) }));

    // Anexos binários (base64) não têm texto confiável para pontuar; preservamos
    // os que casam pelo nome, mas nunca descartamos um binário só por score textual
    // baixo (não conseguimos avaliar seu conteúdo).
    const hasTextSignal = scored.some(s => !s.entry.isBinary && s.score > 0);

    // Se nenhum documento textual pontuou (ex.: consulta usa sinônimos), não temos
    // sinal de relevância — enviamos todos como fallback seguro. Caso contrário,
    // mantemos os relevantes (score > 0) e todos os binários, ordenados por score.
    const selected = (hasTextSignal
      ? scored.filter(s => s.score > 0 || s.entry.isBinary)
      : scored)
      .sort((a, b) => b.score - a.score)
      .map(s => s.entry);

    // Respeita o teto de tamanho do corpo: entra por ordem de relevância e pula o
    // que não couber (um PDF grande em base64 não impede os menores seguintes).
    const encoder = new TextEncoder();
    const omittedDocs: AndrecitoDocument[] = [];
    let payloadBytes = 64 * 1024; // reserva para instruções, schema e consulta
    selected.forEach(e => {
      const size = encoder.encode(JSON.stringify(e.parts)).length;
      if (payloadBytes + size > MAX_PAYLOAD_BYTES) {
        omittedDocs.push(e.doc);
        return;
      }
      payloadBytes += size;
      usedDocsMap.set(e.doc.id, e.doc);
      parts.push(...e.parts);
    });

    if (usedDocsMap.size === 0) {
      const names = documents.map(d => d.name).join(', ');
      parts.push({ text: `Os seguintes documentos foram selecionados como escopo: ${names}.\nConsiderando os assuntos de legislação militar e pagamento de pessoal do Exército e o nome dos arquivos, analise a seguinte consulta.` });
    }

    // Query-sandwich: repetir a consulta no fim ancora o modelo após processar os
    // documentos — reduz o efeito "lost in the middle" em contextos longos.
    parts.push({ text: `\nCONSULTA: ${query}\n\nResponda diretamente à consulta acima. Cite artigos, incisos ou parágrafos específicos quando disponíveis nos documentos. Se houver valores, percentuais ou prazos relevantes, mencione-os explicitamente.` });

    try {
      // Chamada via proxy serverless /api/gemini (a chave fica no servidor).
      // Saída ESTRUTURADA (JSON): em vez de pedir a citação só em prosa e depois
      // adivinhar as fontes por correspondência de texto (~85% confiável), o
      // modelo declara explicitamente quais arquivos usou no campo "fontesUtilizadas".
      const model = selectModel(query, documents.length);
      // thinkingConfig só é aplicado em modelos de raciocínio (gemini-2.5+).
      // Em modelos sem suporte a thinking o parâmetro é ignorado ou causa erro.
      const isThinkingModel = THINKING_MODELS.has(model);

      // thinkingBudget adaptativo: escala com complexidade da consulta para não
      // desperdiçar tokens em perguntas simples nem limitar análises complexas.
      const wordCount = query.trim().split(/\s+/).length;
      const thinkingBudget = wordCount > 15 || documents.length > 3 ? 3072
        : wordCount > 8 || documents.length > 1 ? 1536
        : 768;

      const profileNote = userType === 'admin'
        ? 'Você está respondendo a um gestor/administrador da DivPag: priorize precisão técnica, artigos específicos e implicações administrativas.'
        : 'Você está respondendo a um usuário da DivPag: seja claro e direto, explicando termos técnicos quando necessário.';

      const responseText = await callGemini({
        model,
        contents: { parts: parts },
        _meta: {
          query,
          documents: documents.map(d => d.name),
          userType: userType || 'guest',
        },
        config: {
          systemInstruction: `Você é o ANDRECITO, assistente virtual da Divisão de Pagamento do Exército (DivPag). ${profileNote}

REGRAS DE RESPOSTA:
1. Responda APENAS com base nos documentos fornecidos (identificados por 'ARQUIVO: <nome>').
2. Seja específico: cite artigos, incisos, parágrafos e valores numéricos quando presentes nos documentos.
3. Estruture a resposta: comece com a resposta direta à consulta (1-2 frases), depois a fundamentação legal detalhada.
4. Em cada afirmação relevante, cite o arquivo fonte (ex.: 'Conforme o arquivo Portaria_123...').
5. Se houver percentuais, prazos ou valores no documento, mencione-os explicitamente — não os omita.
6. Seja militar, direto, técnico e cortês.
7. Se a informação não constar nos documentos, diga que não encontrou e deixe 'fontesUtilizadas' vazia.

REGRA OBRIGATÓRIA PARA fontesUtilizadas: liste TODOS os arquivos citados ou usados no corpo da resposta — copie cada nome EXATAMENTE como aparece após 'ARQUIVO:', sem abreviar ou alterar.`,
          temperature: GEMINI_TEMPERATURE,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          ...(isThinkingModel ? { thinkingConfig: { thinkingBudget } } : {}),
          // Força resposta em JSON com forma fixa { resposta, fontesUtilizadas }.
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              resposta: {
                type: 'STRING',
                description: 'A resposta técnica completa, em texto (markdown permitido). Cite no corpo o nome do arquivo fonte de cada afirmação.'
              },
              fontesUtilizadas: {
                type: 'ARRAY',
                items: { type: 'STRING' },
                description: 'Nomes EXATOS dos arquivos efetivamente usados para fundamentar a resposta, copiados como aparecem após "ARQUIVO:".'
              }
            },
            required: ['resposta', 'fontesUtilizadas']
          }
        }
      });

      // Parse robusto da saída estruturada. Lida com três cenários comuns:
      //   1) JSON válido — caminho feliz;
      //   2) JSON envolto em ```json…``` — o modelo às vezes ignora responseMimeType;
      //   3) JSON truncado pelo limite de tokens — extrai o campo "resposta" via cursor
      //      manual, evitando exibir o JSON bruto ao usuário.
      let answer = '';
      let declaredSources: string[] = [];
      let parsedOk = false;

      let rawText = responseText.trim();
      // Caso 2: strip de code block markdown
      const codeBlock = rawText.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/);
      if (codeBlock) rawText = codeBlock[1].trim();

      try {
        const parsed = JSON.parse(rawText);
        if (parsed && typeof parsed === 'object') {
          answer = typeof parsed.resposta === 'string' ? parsed.resposta : '';
          declaredSources = Array.isArray(parsed.fontesUtilizadas)
            ? parsed.fontesUtilizadas.filter((s: any) => typeof s === 'string')
            : [];
          parsedOk = answer.length > 0;
        }
      } catch {
        // Caso 3: JSON inválido/truncado — extrai "resposta" percorrendo o cursor
        const keyIdx = rawText.indexOf('"resposta"');
        if (keyIdx !== -1) {
          const colonIdx = rawText.indexOf(':', keyIdx);
          const quoteStart = colonIdx !== -1 ? rawText.indexOf('"', colonIdx + 1) : -1;
          if (quoteStart !== -1) {
            let extracted = '';
            let i = quoteStart + 1;
            while (i < rawText.length) {
              const ch = rawText[i];
              if (ch === '\\' && i + 1 < rawText.length) {
                const esc = rawText[i + 1];
                if (esc === 'n') extracted += '\n';
                else if (esc === 't') extracted += '\t';
                else if (esc === '"') extracted += '"';
                else if (esc === '\\') extracted += '\\';
                else extracted += ch;
                i += 2;
              } else if (ch === '"') {
                break;
              } else {
                extracted += ch;
                i++;
              }
            }
            if (extracted.length > 20) {
              answer = extracted;
              parsedOk = true;
            }
          }
        }
      }

      let finalResponse = (parsedOk ? answer : responseText)
        || "Desculpe, não consegui obter uma resposta estratégica agora.";

      if (omittedDocs.length > 0) {
        finalResponse += `\n\n> ⚠️ ${omittedDocs.length} documento(s) ficaram de fora desta análise por excederem o tamanho máximo da consulta (PDFs digitalizados, sem texto extraível). Eles estão em "Fontes Consultadas", marcados como "não analisado", para download e conferência manual. Para incluí-los na análise, refaça a consulta selecionando menos documentos.`;
      }

      const citedDocs: AndrecitoDocument[] = [];
      if (usedDocsMap.size > 0) {

        // Normaliza para comparação: minúsculas, sem acentos, sem extensão e com
        // espaços colapsados — o modelo às vezes normaliza espaços duplos do nome
        // original ao copiá-lo, o que quebraria uma comparação literal.
        const normalize = (s: string) =>
          s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/\.[a-z0-9]+$/, '').replace(/\s+/g, ' ').trim();

        // UNIÃO de dois sinais para não perder nenhuma fonte citada:
        //  1) o que o modelo DECLAROU em fontesUtilizadas (saída estruturada); e
        //  2) o que ele MENCIONOU no corpo da resposta (nome do arquivo no texto).
        // Antes era um OU exclusivo (só um dos dois), então um documento citado na
        // prosa mas ausente da lista — ou vice-versa — não aparecia para download.
        const declared = declaredSources.map(normalize).filter(d => d.length > 0);
        const normResponse = normalize(finalResponse);

        usedDocsMap.forEach(doc => {
          const docN = normalize(doc.name);
          if (docN.length < 5) return; // nome curto demais → evita falso-positivo

          const inDeclared = declared.some(d => d === docN || d.includes(docN) || docN.includes(d));
          const inProse = normResponse.includes(docN);

          if (inDeclared || inProse) citedDocs.push(doc);
        });

      }

      // Os documentos que não couberam no envio também vão para download, marcados
      // no próprio texto do link (o PDF exportado reaproveita só nome e URL).
      if (citedDocs.length > 0 || omittedDocs.length > 0) {
        finalResponse += "\n\n---\n**Fontes Consultadas:**\n";
        citedDocs.forEach(d => {
          finalResponse += `- [${d.name}](${d.url})\n`;
        });
        omittedDocs.forEach(d => {
          finalResponse += `- [${d.name} (não analisado)](${d.url})\n`;
        });
      }
      return finalResponse;
    } catch (e: any) {
      console.error("Erro no Gemini:", e);
      const msg = e?.message || '';
      return `Ocorreu um erro ao consultar a IA.${msg ? `\n\n**Detalhe:** ${msg}` : ' Verifique se a chave de API é válida e tente novamente.'}`;
    }
  }
};
