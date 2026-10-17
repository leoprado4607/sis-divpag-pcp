
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Send, FileText, CheckCircle2, AlertCircle, Printer, Download, BookOpen, ChevronDown, ChevronRight, CheckSquare, Square, Filter, X, ArrowLeft, Library, Settings, LogOut, Bot, Folder, RefreshCw, Trash2, Cpu, Info, Lock, Users, ShieldCheck } from 'lucide-react';
import { andrecitoService } from '../../services/andrecitoService';
import AndrecitoHeader from './AndrecitoHeader';
import { AndrecitoCategory, AndrecitoSubcategory, AndrecitoDocument } from '../../types';
import { ViewState, UserRole } from './AndrecitoApp';
import ReactMarkdown from 'react-markdown';
import jsPDF from 'jspdf';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─────────────────────────────────────────────────────────────────────────────
// PÚBLICO-ALVO → SUBCATEGORIAS
// Cada opção de público-alvo seleciona automaticamente (e trava) um conjunto fixo
// de subcategorias. Os IDs abaixo são os reais do banco de produção (tabela
// subcategories), casados pelo par categoria+subcategoria — cravar por ID evita a
// ambiguidade das várias subcategorias chamadas "Geral" (SIPPES, SIAPPES, SIAPE…).
// ─────────────────────────────────────────────────────────────────────────────
interface AudienceOption {
  key: string;
  label: string;
  /** IDs das subcategorias marcadas/travadas ao selecionar este público-alvo. */
  subcatIds: string[];
}

const AUDIENCE_OPTIONS: AudienceOption[] = [
  {
    key: 'militar_ativa',
    label: 'Militar da Ativa',
    subcatIds: [
      'f7dd0839-f465-434a-ba97-016a7dbe61f8', // Cadernos de Orientações (SEF) › Pagamento de Pessoal
      '4931ac14-0ac8-4800-93a4-0fcfb47e3059', // Estágio IEFEx › 1 - Militar da Ativa
      '922f8cbf-d1bf-4de1-9e32-a9a332c2ff38', // Orientações Técnicas CPEx › 1 - Militar da Ativa
      '35678ecf-c75b-4cd4-b717-cf34298b3b24', // SIPPES › Geral
    ],
  },
  {
    key: 'veterano',
    label: 'Veterano',
    subcatIds: [
      'f7dd0839-f465-434a-ba97-016a7dbe61f8', // Cadernos de Orientações (SEF) › Pagamento de Pessoal
      '24ef64a3-eec1-49cd-885c-3908ced5ca5b', // Estágio IEFEx › 2 - Veteranos
      '06472cdb-5c33-4990-963a-f9c06bb87b7c', // Orientações Técnicas CPEx › 2 - Veterano
      '59b690cd-1794-4f16-9736-b897c0974841', // SIAPPES › Geral
    ],
  },
  {
    key: 'pensionista',
    label: 'Pensionista',
    subcatIds: [
      'f7dd0839-f465-434a-ba97-016a7dbe61f8', // Cadernos de Orientações (SEF) › Pagamento de Pessoal
      '79887ae5-e33e-4684-ac61-7440ab198224', // Estágio IEFEx › 3 - Pensionistas
      '3bf2db77-3fea-42de-a66c-2b7cda875e6c', // Orientações Técnicas CPEx › 3 - Pensionista militar
      '59b690cd-1794-4f16-9736-b897c0974841', // SIAPPES › Geral
    ],
  },
  {
    key: 'servidor_civil',
    label: 'Servidor Civil',
    subcatIds: [
      'f7dd0839-f465-434a-ba97-016a7dbe61f8', // Cadernos de Orientações (SEF) › Pagamento de Pessoal
      '93a03d44-4693-42c0-bfbd-d59ab7172eae', // Servidor civil › Geral
      'c7381683-566d-4480-8429-7aee53639619', // SIAPE › Geral
    ],
  },
];

interface AndrecitoQueryProps {
  onBack: () => void;
  onLogout: () => void;
  onNavigate: (view: ViewState) => void;
  currentView: ViewState;
  userRole: UserRole;
}

const AndrecitoQuery: React.FC<AndrecitoQueryProps> = ({ onBack, onLogout, onNavigate, currentView, userRole }) => {
  const [categories, setCategories] = useState<AndrecitoCategory[]>([]);
  const [subcategoriesMap, setSubcategoriesMap] = useState<Record<string, AndrecitoSubcategory[]>>({});
  // Seleção MANUAL de subcategorias (refinamento opcional). As subcategorias
  // travadas pelo público-alvo são controladas à parte (lockedSubcats) e não
  // entram aqui — assim o usuário nunca consegue desmarcá-las.
  const [selectedSubcats, setSelectedSubcats] = useState<string[]>([]);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  // Público-alvo escolhido (1 ou mais). Obrigatório para liberar a busca.
  const [selectedAudiences, setSelectedAudiences] = useState<string[]>([]);
  // Pop-up inicial com as instruções de uso (público-alvo obrigatório etc.).
  // Aparece apenas uma vez por sessão do navegador (sessionStorage): ao fechar,
  // marca-se a flag e ele não reabre até a aba/sessão ser encerrada.
  const [showIntro, setShowIntro] = useState(() => {
    try { return sessionStorage.getItem('andrecito_intro_seen') !== '1'; } catch { return true; }
  });

  const dismissIntro = useCallback(() => {
    setShowIntro(false);
    try { sessionStorage.setItem('andrecito_intro_seen', '1'); } catch { /* sessão sem storage */ }
  }, []);
  const [expandedCat, setExpandedCat] = useState<string>('');
  // No celular o acervo vira gaveta sobre a consulta (no desktop é a coluna fixa).
  const [acervoAberto, setAcervoAberto] = useState(false);
  const [estimatedDocCount, setEstimatedDocCount] = useState(0);
  const [query, setQuery] = useState('');
  const [lastQuery, setLastQuery] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [processingStep, setProcessingStep] = useState('');

  // Subcategorias travadas = união das subcategorias dos públicos-alvo marcados.
  const lockedSubcats = useMemo(() => {
    const set = new Set<string>();
    selectedAudiences.forEach(key => {
      const opt = AUDIENCE_OPTIONS.find(o => o.key === key);
      opt?.subcatIds.forEach(id => set.add(id));
    });
    return set;
  }, [selectedAudiences]);

  // Conjunto efetivo enviado à busca = travadas (público-alvo) ∪ manuais.
  const effectiveSubcats = useMemo(
    () => Array.from(new Set<string>([...lockedSubcats, ...selectedSubcats])),
    [lockedSubcats, selectedSubcats]
  );

  // Regra de obrigatoriedade: a busca só é liberada após escolher ao menos um
  // público-alvo. Categorias/subcategorias manuais são refinamento opcional.
  const canSearch = selectedAudiences.length > 0;

  const loadData = useCallback(async () => {
    try {
      // Carrega categorias e TODAS as subcategorias de uma vez. Preencher o mapa
      // completo (em vez de buscar sob demanda na expansão) permite refletir as
      // subcategorias travadas pelo público-alvo em qualquer categoria que o
      // usuário expandir, sem uma ida extra ao banco.
      const [cats, allSubs] = await Promise.all([
        andrecitoService.getCategories(),
        andrecitoService.getAllSubcategories(),
      ]);
      setCategories(cats);
      const grouped: Record<string, AndrecitoSubcategory[]> = {};
      allSubs.forEach(s => {
        (grouped[s.category_id] ||= []).push(s);
      });
      setSubcategoriesMap(grouped);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const updateDocCount = useCallback(async () => {
    try {
      const subPromises = effectiveSubcats.map(id => andrecitoService.getDocuments(id));
      const catPromises = selectedCats.map(id => andrecitoService.getDocumentsByCategory(id));
      const results = await Promise.all([...subPromises, ...catPromises]);
      setEstimatedDocCount(results.flat().length);
    } catch (e) {
      console.error(e);
    }
  }, [effectiveSubcats, selectedCats]);

  // Alterna um público-alvo. Ao desmarcar, suas subcategorias travadas saem
  // automaticamente (lockedSubcats é derivado de selectedAudiences).
  const toggleAudience = useCallback((key: string) => {
    setSelectedAudiences(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const t = setTimeout(() => { updateDocCount(); }, 300);
    return () => clearTimeout(t);
  }, [updateDocCount]);

  const handleSearch = useCallback(async () => {
    if (!query.trim() || !canSearch) return;

    setLoading(true);
    setResponse('');
    setLastQuery(query.trim());

    try {
      setProcessingStep('Localizando documentos...');
      const subPromises = effectiveSubcats.map(id => andrecitoService.getDocuments(id));
      const catPromises = selectedCats.map(id => andrecitoService.getDocumentsByCategory(id));
      const results = await Promise.all([...subPromises, ...catPromises]);
      const allDocs = results.flat();

      if (allDocs.length === 0) {
        setResponse("Nenhum documento encontrado nas pastas selecionadas.");
        setLoading(false);
        return;
      }

      setProcessingStep(`Analisando ${allDocs.length} arquivos com Inteligência Artificial...`);
      const aiResponse = await andrecitoService.queryGemini(query, allDocs, userRole || 'guest');
      setResponse(aiResponse);
    } catch (error: any) {
      console.error(error);
      setResponse("Ocorreu um problema na análise. Por favor, tente novamente.");
    } finally {
      setLoading(false);
      setProcessingStep('');
    }
  }, [query, canSearch, effectiveSubcats, selectedCats]);

  const handleDownloadPDF = useCallback(() => {
    if (!response) return;

    const C = {
      green: [26, 60, 26] as const,
      gold: [189, 156, 77] as const,
      text: [40, 40, 40] as const,
      muted: [125, 125, 125] as const,
      rule: [223, 227, 231] as const,
      link: [21, 101, 192] as const,
      box: [246, 247, 245] as const,
      white: [255, 255, 255] as const,
    };

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 48;
    const contentW = pageW - margin * 2;
    const bottomLimit = pageH - 60;
    let y = 0;

    const setFill = (c: readonly number[]) => doc.setFillColor(c[0], c[1], c[2]);
    const setText = (c: readonly number[]) => doc.setTextColor(c[0], c[1], c[2]);
    const setDraw = (c: readonly number[]) => doc.setDrawColor(c[0], c[1], c[2]);

    const runningHeader = () => {
      setFill(C.green); doc.rect(0, 0, pageW, 30, 'F');
      setFill(C.gold); doc.rect(0, 30, pageW, 2, 'F');
      setText(C.white); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
      doc.text('SISTEMA ANDRECITO', margin, 19);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.text('Análise de Legislação Militar', pageW - margin, 19, { align: 'right' });
      y = 56;
    };

    const newPage = () => { doc.addPage(); runningHeader(); };
    const ensure = (h: number) => { if (y + h > bottomLimit) newPage(); };

    const cleanInline = (s: string) =>
      s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[`*]/g, '').trim();

    const writeRich = (
      text: string,
      opts: { size: number; color?: readonly number[]; indent?: number; gap?: number; bold?: boolean }
    ) => {
      const indent = opts.indent || 0;
      const lineH = opts.size + 5;
      const startX = margin + indent;
      const maxW = contentW - indent;
      const color = opts.color || C.text;

      const segs: { t: string; b: boolean }[] = [];
      const re = /\*\*([^*]+)\*\*/g;
      let last = 0, m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        if (m.index > last) segs.push({ t: text.slice(last, m.index), b: !!opts.bold });
        segs.push({ t: m[1], b: true });
        last = m.index + m[0].length;
      }
      if (last < text.length) segs.push({ t: text.slice(last), b: !!opts.bold });

      const words: { t: string; b: boolean }[] = [];
      segs.forEach(s => {
        cleanInline(s.t).split(/(\s+)/).forEach(p => { if (p.length) words.push({ t: p, b: s.b }); });
      });

      setText(color);
      ensure(lineH);
      let x = startX;
      words.forEach(w => {
        doc.setFont('helvetica', w.b ? 'bold' : 'normal');
        const ww = doc.getTextWidth(w.t);
        const isSpace = !w.t.trim().length;
        if (x + ww > startX + maxW && !isSpace) { y += lineH; ensure(lineH); x = startX; }
        if (x === startX && isSpace) return;
        doc.text(w.t, x, y);
        x += ww;
      });
      y += lineH + (opts.gap || 0);
    };

    const sources: { name: string; url: string }[] = [];
    let body = response;
    const fIdx = response.indexOf('**Fontes Consultadas:**');
    if (fIdx !== -1) {
      body = response.slice(0, fIdx).replace(/\n*-{3,}\s*$/, '').trim();
      const block = response.slice(fIdx);
      const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
      let lm: RegExpExecArray | null;
      while ((lm = linkRe.exec(block)) !== null) sources.push({ name: lm[1], url: lm[2] });
    }

    setFill(C.green); doc.rect(0, 0, pageW, 82, 'F');
    setFill(C.gold); doc.rect(0, 82, pageW, 4, 'F');
    setText(C.white);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(19);
    doc.text('Sistema ANDRECITO', margin, 40);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    doc.text('Análise de Legislação Militar  ·  Divisão de Pagamento de Pessoal', margin, 60);
    doc.setFontSize(8.5); setText(C.gold);
    doc.text(new Date().toLocaleDateString('pt-BR'), pageW - margin, 40, { align: 'right' });
    y = 112;

    if (lastQuery) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); setText(C.gold);
      ensure(60); doc.text('CONSULTA', margin, y); y += 8;
      doc.setFont('helvetica', 'italic'); doc.setFontSize(10.5);
      const qLines = doc.splitTextToSize(lastQuery, contentW - 28) as string[];
      const boxH = qLines.length * 14 + 20;
      ensure(boxH);
      setFill(C.box); setDraw(C.rule); doc.setLineWidth(0.5);
      doc.roundedRect(margin, y, contentW, boxH, 5, 5, 'FD');
      setFill(C.gold); doc.rect(margin, y, 3.5, boxH, 'F');
      setText(C.text);
      let qy = y + 17;
      qLines.forEach(l => { doc.text(l, margin + 16, qy); qy += 14; });
      y += boxH + 20;
    }

    body.split(/\r?\n/).forEach(raw => {
      const line = raw.replace(/\s+$/, '');
      if (!line.trim()) { y += 5; return; }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        ensure(16); setDraw(C.rule); doc.setLineWidth(0.5);
        doc.line(margin, y, pageW - margin, y); y += 16; return;
      }
      const h = line.match(/^(#{1,4})\s+(.*)/);
      if (h) {
        const lvl = h[1].length;
        y += lvl <= 2 ? 8 : 5;
        writeRich(h[2], { size: lvl === 1 ? 15 : lvl === 2 ? 13 : 11.5, color: C.green, bold: true, gap: 5 });
        return;
      }
      const sub = line.match(/^\*\*(.+?)\*\*:?\s*$/);
      if (sub) {
        y += 6; writeRich(sub[1].replace(/:$/, ''), { size: 11.5, color: C.green, bold: true, gap: 4 });
        return;
      }
      const n = line.match(/^\s*(\d+)\.\s+(.*)/);
      if (n) {
        ensure(15);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); setText(C.green);
        doc.text(`${n[1]}.`, margin, y);
        writeRich(n[2], { size: 10, indent: 18, gap: 3 });
        return;
      }
      const b = line.match(/^\s*[-*]\s+(.*)/);
      if (b) {
        ensure(15); setFill(C.gold); doc.circle(margin + 4, y - 3, 1.7, 'F');
        writeRich(b[1], { size: 10, indent: 16, gap: 3 });
        return;
      }
      writeRich(line, { size: 10.5, gap: 6 });
    });

    if (sources.length) {
      y += 8; ensure(60);
      setDraw(C.rule); doc.setLineWidth(0.5); doc.line(margin, y, pageW - margin, y); y += 20;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); setText(C.green);
      doc.text('Fontes Consultadas', margin, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setText(C.muted);
      doc.text('Clique no nome do documento para abrir ou baixar.', pageW - margin, y, { align: 'right' });
      y += 18;
      sources.forEach(s => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
        const lines = doc.splitTextToSize(s.name, contentW - 18) as string[];
        ensure(lines.length * 13 + 6);
        setFill(C.gold); doc.circle(margin + 4, y - 3, 1.9, 'F');
        setText(C.link);
        let ly = y;
        lines.forEach(ln => { doc.textWithLink(ln, margin + 16, ly, { url: s.url }); ly += 13; });
        y = ly + 5;
      });
    }

    const total = doc.getNumberOfPages();
    const stamp = new Date().toLocaleString('pt-BR');
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      setDraw(C.rule); doc.setLineWidth(0.5); doc.line(margin, pageH - 40, pageW - margin, pageH - 40);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setText(C.muted);
      doc.text(`ANDRECITO · Gerado via IA · ${stamp}`, margin, pageH - 26);
      doc.text(`Página ${i} de ${total}`, pageW - margin, pageH - 26, { align: 'right' });
    }

    doc.save(`Andrecito_Consulta_${new Date().toISOString().slice(0, 10)}.pdf`);
  }, [response, lastQuery]);

  const categoryTree = useMemo(() => categories.map(cat => {
    // Quantas subcategorias desta categoria estão travadas pelo público-alvo.
    const lockedCount = (subcategoriesMap[cat.id] || []).filter(s => lockedSubcats.has(s.id)).length;
    return (
    <div key={cat.id} className="mb-1.5">
      <button
        type="button"
        aria-expanded={expandedCat === cat.id}
        onClick={() => {
          setExpandedCat(expandedCat === cat.id ? '' : cat.id);
          if (!subcategoriesMap[cat.id]) andrecitoService.getSubcategories(cat.id).then(subs => setSubcategoriesMap(p => ({ ...p, [cat.id]: subs })));
        }}
        className={`w-full min-h-[40px] flex items-center justify-between py-2 text-sm transition-colors ${expandedCat === cat.id ? 'text-army-green font-semibold' : 'text-army-green/75 hover:text-army-green font-medium'}`}
      >
        <span className="flex items-center gap-2 min-w-0 text-left">
          <Folder size={13} className={`flex-shrink-0 ${expandedCat === cat.id ? 'text-army-gold' : 'text-army-green/75'}`} />
          <span className="truncate">{cat.name}</span>
          {lockedCount > 0 && (
            <span
              className="flex items-center gap-0.5 text-[11px] font-bold text-army-gold-deep bg-army-gold/10 px-1.5 py-0.5 rounded-full"
              title={`${lockedCount} subcategoria(s) selecionada(s) pelo público-alvo`}
            >
              <Lock size={8} /> {lockedCount}
            </span>
          )}
        </span>
        {expandedCat === cat.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
      {expandedCat === cat.id && (
        <div className="pl-4 space-y-0.5 mt-0.5 border-l border-army-gold/25 ml-1.5">
          {subcategoriesMap[cat.id]?.map(sub => {
            const isLocked = lockedSubcats.has(sub.id);
            const isManual = selectedSubcats.includes(sub.id);
            const isChecked = isLocked || isManual;
            return (
              <button
                key={sub.id}
                type="button"
                aria-pressed={isChecked}
                disabled={isLocked}
                onClick={() => {
                  // Itens travados pelo público-alvo não podem ser desmarcados.
                  if (isLocked) return;
                  setSelectedSubcats(p => p.includes(sub.id) ? p.filter(x => x !== sub.id) : [...p, sub.id]);
                }}
                title={isLocked ? 'Selecionado automaticamente pelo público-alvo (não editável)' : undefined}
                className={`w-full flex items-center gap-2 py-1.5 text-xs transition-all ${isLocked ? 'text-army-green font-semibold cursor-not-allowed' : isManual ? 'text-army-green font-semibold' : 'text-army-green/75 hover:text-army-green'}`}
              >
                {isChecked
                  ? <CheckSquare size={13} className="text-army-gold flex-shrink-0" />
                  : <Square size={13} className="text-army-green/75 flex-shrink-0" />}
                <span className="text-left flex-1">{sub.name}</span>
                {isLocked && <Lock size={10} className="text-army-gold flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
    );
  }), [categories, expandedCat, subcategoriesMap, selectedSubcats, lockedSubcats]);

  const renderedResponse = useMemo(() => (
    <ReactMarkdown
      components={{
        h1: ({ children }) => <h1 className="font-cormorant font-bold text-2xl text-army-green mt-6 mb-3 first:mt-0 border-b border-army-gold/20 pb-2">{children}</h1>,
        h2: ({ children }) => <h2 className="font-cormorant font-semibold text-xl text-army-green mt-5 mb-2 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="font-semibold text-base text-army-green mt-4 mb-1.5">{children}</h3>,
        h4: ({ children }) => <h4 className="font-semibold text-sm text-army-green/80 mt-3 mb-1">{children}</h4>,
        p: ({ children }) => <p className="mb-4 last:mb-0 leading-relaxed text-army-charcoal/80">{children}</p>,
        ul: ({ children }) => <ul className="my-3 space-y-2 pl-0">{children}</ul>,
        ol: ({ children }) => <ol className="my-3 space-y-2 pl-5 list-decimal">{children}</ol>,
        li: ({ children, ...props }) => {
          const ordered = (props as any).ordered;
          return ordered ? (
            <li className="leading-relaxed text-army-charcoal/80 pl-1">{children}</li>
          ) : (
            <li className="flex items-start gap-2.5 leading-relaxed text-army-charcoal/80">
              <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-army-gold flex-shrink-0" />
              <span>{children}</span>
            </li>
          );
        },
        strong: ({ children }) => <strong className="font-semibold text-army-green">{children}</strong>,
        em: ({ children }) => <em className="italic text-army-charcoal/70">{children}</em>,
        code: ({ children }) => <code className="bg-army-cream text-army-green/90 text-xs px-1.5 py-0.5 rounded font-mono border border-army-green/10">{children}</code>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-army-gold pl-4 py-1 my-4 bg-army-cream/60 text-army-charcoal/80 italic">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-5 border-army-green/10" />,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-army-green font-medium underline underline-offset-2 hover:text-army-gold transition-colors">
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-4">
            <table className="w-full text-sm border-collapse">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="bg-army-green text-white px-3 py-2 text-left font-semibold text-xs tracking-wide">{children}</th>,
        td: ({ children }) => <td className="border border-army-green/10 px-3 py-2 text-army-charcoal/80">{children}</td>,
      }}
    >
      {response}
    </ReactMarkdown>
  ), [response]);

  return (
    <div className="flex flex-col h-screen bg-army-cream overflow-hidden">

      <AndrecitoHeader onBack={onBack} onLogout={onLogout} onNavigate={onNavigate} currentView={currentView} userRole={userRole} />

      <div className="flex flex-1 overflow-hidden relative">

        {/* ── Sidebar (gaveta no celular) ── */}
        <aside
          id="acervo-consulta"
          aria-label="Acervo de documentos"
          className={`${acervoAberto ? 'flex' : 'hidden'} md:flex absolute inset-0 md:static w-full md:w-74 bg-white border-r border-army-green/10 flex-col md:h-9/10 z-30 no-print`}
        >
          <div className="px-5 pt-5 pb-3 border-b border-army-green/8 flex items-center justify-between gap-3">
            <h2 className="font-cormorant font-semibold text-xl text-army-green leading-tight">Acervo de documentos</h2>
            <button
              type="button"
              onClick={() => setAcervoAberto(false)}
              className="md:hidden flex-shrink-0 min-h-[44px] px-3 bg-army-green text-white text-[13px] font-semibold"
            >
              Voltar à consulta
            </button>
          </div>

          <div className="p-5 overflow-y-auto flex-1 custom-scrollbar">
            {categoryTree}
          </div>

          {/* Doc count - Footer */}
          <div className="h-20 flex flex-col items-center justify-center px-5 py-3 border-t-2 border-army-gold/30 bg-army-cream/50">
            <div className="w-full flex flex-col items-center justify-center text-center gap-1">
              <p className="text-[11px] tracking-[0.14em] uppercase text-army-green/75 font-medium">Escopo de Análise</p>
              <p className="font-cormorant font-semibold text-2xl text-army-green leading-none">{estimatedDocCount}</p>
              <p className="text-xs font-sans font-normal text-army-green/75">arquivos</p>
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="flex-1 flex flex-col bg-army-cream/40 overflow-hidden relative">

          {/* ── Input bar ── */}
          <div className="px-4 md:px-10 py-4 md:py-5 bg-white border-b border-army-green/10 relative z-10 no-print">
            <button
              type="button"
              onClick={() => setAcervoAberto(true)}
              aria-controls="acervo-consulta"
              aria-expanded={acervoAberto}
              className="md:hidden w-full mb-3 min-h-[44px] flex items-center justify-between px-4 border border-army-green/15 bg-army-cream text-[13px] font-semibold text-army-green"
            >
              <span className="flex items-center gap-2"><Folder size={15} className="text-army-gold-deep" /> Acervo e categorias</span>
              <span className="text-army-green/75 font-medium tabular-nums">{estimatedDocCount} arquivos</span>
            </button>
            <div className="max-w-4xl mx-auto flex items-center gap-3">
              <button
                onClick={() => { setQuery(''); setResponse(''); }}
                className="flex-shrink-0 w-11 h-11 border border-army-green/15 hover:border-red-200 hover:bg-red-50 text-army-green/75 hover:text-red-400 transition-all flex items-center justify-center"
                title="Limpar"
                aria-label="Limpar consulta"
              >
                <Trash2 size={16} />
              </button>
              <div className="flex-1 relative">
                <input
                  type="text"
                  className="w-full bg-army-cream border border-army-green/15 focus:border-army-green focus:bg-white py-3.5 pl-5 pr-20 outline-none text-sm text-army-charcoal placeholder-army-green/75 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  aria-label="Sua pergunta"
                  placeholder={canSearch ? 'Sobre o que deseja pesquisar hoje?' : 'Selecione ao menos um público-alvo abaixo para liberar a pesquisa…'}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  disabled={loading || !canSearch}
                />
                <button
                  onClick={handleSearch}
                  disabled={loading || !canSearch || !query.trim()}
                  aria-label="Pesquisar"
                  className="absolute right-0 top-0 bottom-0 bg-army-green hover:bg-army-mid text-white px-5 font-medium transition-colors disabled:opacity-30 flex items-center justify-center"
                >
                  <Send size={17} />
                </button>
              </div>
            </div>

            {/* ── Público-alvo (obrigatório) ── */}
            <div className="max-w-4xl mx-auto mt-4">
              <div className="flex items-center gap-2 mb-2.5">
                <Users size={13} className="text-army-gold" />
                <p className="text-[11px] font-semibold tracking-[0.14em] uppercase text-army-green/75">
                  Público-alvo da consulta
                </p>
                <span className="text-[11px] font-bold text-army-gold-deep uppercase tracking-wide">· obrigatório</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {AUDIENCE_OPTIONS.map(opt => {
                  const active = selectedAudiences.includes(opt.key);
                  return (
                    <button
                      key={opt.key}
                      onClick={() => toggleAudience(opt.key)}
                      aria-pressed={active}
                      className={`flex items-center gap-2 px-3 py-2.5 border text-xs font-medium transition-all ${active
                        ? 'border-army-green bg-army-green/[0.06] text-army-green'
                        : 'border-army-green/15 bg-army-cream/40 text-army-green/75 hover:border-army-green/40 hover:text-army-green'}`}
                    >
                      {active
                        ? <CheckSquare size={15} className="text-army-gold flex-shrink-0" />
                        : <Square size={15} className="text-army-green/75 flex-shrink-0" />}
                      <span className="text-left leading-tight">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
              {!canSearch && (
                <p className="flex items-center gap-1.5 text-[11px] text-army-green/75 mt-2.5">
                  <Info size={12} className="text-army-gold flex-shrink-0" />
                  Escolha pelo menos um público-alvo. As pastas correspondentes serão selecionadas automaticamente; o refinamento por categorias é opcional.
                </p>
              )}
            </div>
          </div>

          {/* Results area */}
          <p className="sr-only" role="status" aria-live="polite">
            {loading ? processingStep || 'Processando a consulta…' : response ? 'Resposta pronta.' : ''}
          </p>
          <div className="flex-1 overflow-y-auto p-4 md:p-10 custom-scrollbar" aria-busy={loading}>
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center gap-5">
                <div className="relative">
                  <RefreshCw className="w-14 h-14 text-army-gold animate-spin" />
                  <Bot className="absolute inset-0 m-auto text-army-green" size={22} />
                </div>
                <div className="text-center">
                  <h3 className="font-cormorant font-semibold text-xl text-army-green">{processingStep}</h3>
                  <p className="text-xs text-army-green/75 mt-1.5 font-medium">Aguarde, a IA está processando seu pedido.</p>
                </div>
              </div>
            ) : response ? (
              <div className="max-w-4xl mx-auto bg-white border border-army-green/10 border-t-2 border-t-army-gold print:border-none print:shadow-none print:max-w-full">
                {/* Response header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-5 sm:px-8 pt-6 sm:pt-7 pb-5 border-b border-army-green/8 gap-4 no-print">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-army-green flex items-center justify-center flex-shrink-0">
                      <Bot size={16} className="text-white" />
                    </div>
                    <div>
                      <p className="font-cormorant font-semibold text-army-green text-lg leading-none">Resultado da consulta</p>
                      <p className="text-[11px] text-army-green/75 uppercase tracking-widest font-medium mt-0.5">Baseado em Legislação Federal e Normas do EB</p>
                    </div>
                  </div>
                  <div className="flex gap-2 self-end">
                    <button
                      onClick={handleDownloadPDF}
                      className="flex items-center gap-1.5 px-3.5 py-2 border border-army-green/15 hover:border-army-gold hover:bg-army-gold/5 text-army-green/75 hover:text-army-gold transition-all text-xs font-medium"
                      title="Baixar PDF"
                      aria-label="Baixar PDF"
                    >
                      <Download size={14} /> <span className="hidden lg:inline">PDF</span>
                    </button>
                    <button
                      onClick={() => window.print()}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-army-green hover:bg-army-mid text-white transition-all text-xs font-medium"
                      title="Imprimir"
                      aria-label="Imprimir"
                    >
                      <Printer size={14} /> <span className="hidden lg:inline">Imprimir</span>
                    </button>
                  </div>
                </div>
                <div className="max-w-none px-5 sm:px-8 py-6 sm:py-7 text-sm print:text-black overflow-visible">
                  {renderedResponse}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-start text-center px-6 no-print pt-12">
                <div className="w-16 h-16 border border-army-gold/25 bg-white flex items-center justify-center mb-6">
                  <Search size={28} className="text-army-green/75" />
                </div>
                <h3 className="font-cormorant font-semibold text-2xl text-army-green mb-2">Central de Inteligência</h3>
                <p className="text-xs text-army-green/75 max-w-sm leading-relaxed font-medium">
                  Comece escolhendo o <span className="font-semibold text-army-green">público-alvo</span> da sua consulta, logo acima.
                  As pastas relacionadas serão selecionadas automaticamente — você ainda pode refinar pelas categorias do acervo — e então digite sua dúvida.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ── Pop-up inicial de instruções ── */}
      {showIntro && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 no-print">
          <div className="absolute inset-0 bg-army-charcoal/50 backdrop-blur-sm" onClick={dismissIntro} />
          <div
            className="relative bg-white w-full max-w-lg border-t-4 border-army-gold shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="intro-titulo"
            onKeyDown={e => {
              if (e.key === 'Escape') dismissIntro();
              // único controle do pop-up: Tab não deixa o foco escapar para a página atrás
              else if (e.key === 'Tab') e.preventDefault();
            }}
          >
            <div className="flex items-start gap-4 px-7 pt-7 pb-5 border-b border-army-green/10">
              <div className="w-11 h-11 bg-army-green flex items-center justify-center flex-shrink-0">
                <ShieldCheck size={22} className="text-army-gold" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] tracking-[0.16em] uppercase text-army-gold-deep font-semibold">Como realizar sua consulta</p>
                <h2 id="intro-titulo" className="font-cormorant font-semibold text-2xl text-army-green leading-tight">Antes de pesquisar</h2>
              </div>
            </div>

            <div className="px-7 py-6 space-y-4">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 flex-shrink-0 bg-army-green text-white text-xs font-bold flex items-center justify-center">1</span>
                <p className="text-sm text-army-charcoal/80 leading-relaxed">
                  <span className="font-semibold text-army-green">Escolha o público-alvo (obrigatório).</span> Marque um ou mais entre
                  Militar da Ativa, Veterano, Pensionista e Servidor Civil. As pastas correspondentes serão selecionadas automaticamente.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 flex-shrink-0 bg-army-green text-white text-xs font-bold flex items-center justify-center">2</span>
                <p className="text-sm text-army-charcoal/80 leading-relaxed">
                  <span className="font-semibold text-army-green">Refine as categorias (opcional).</span> Se desejar, selecione no acervo ao lado
                  outras categorias/subcategorias que tenham relação direta com a sua consulta.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 flex-shrink-0 bg-army-green text-white text-xs font-bold flex items-center justify-center">3</span>
                <p className="text-sm text-army-charcoal/80 leading-relaxed">
                  <span className="font-semibold text-army-green">Seja específico no texto.</span> Quanto mais detalhada e objetiva for a sua pergunta,
                  mais precisa será a resposta da Inteligência Artificial.
                </p>
              </div>
            </div>

            <div className="px-7 pb-7 pt-1">
              <button
                onClick={dismissIntro}
                autoFocus
                className="w-full bg-army-green hover:bg-army-mid text-white py-3.5 font-medium text-sm transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={16} /> Entendi, vamos começar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AndrecitoQuery;
