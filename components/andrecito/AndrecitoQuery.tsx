
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Send, FileText, CheckCircle2, AlertCircle, Printer, Download, BookOpen, ChevronDown, ChevronRight, CheckSquare, Square, Filter, X, ArrowLeft, Library, Settings, LogOut, Bot, Folder, RefreshCw, Trash2, Cpu, Info } from 'lucide-react';
import { andrecitoService } from '../../services/andrecitoService';
import { AndrecitoCategory, AndrecitoSubcategory, AndrecitoDocument } from '../../types';
import { ViewState, UserRole } from './AndrecitoApp';
import ReactMarkdown from 'react-markdown';
import jsPDF from 'jspdf';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
  const [selectedSubcats, setSelectedSubcats] = useState<string[]>([]);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [expandedCat, setExpandedCat] = useState<string>('');
  const [estimatedDocCount, setEstimatedDocCount] = useState(0);
  const [query, setQuery] = useState('');
  const [lastQuery, setLastQuery] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [processingStep, setProcessingStep] = useState('');

  const hasSelection = selectedSubcats.length > 0 || selectedCats.length > 0;

  const loadData = useCallback(async () => {
    try {
      const cats = await andrecitoService.getCategories();
      setCategories(cats);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const updateDocCount = useCallback(async () => {
    try {
      const subPromises = selectedSubcats.map(id => andrecitoService.getDocuments(id));
      const catPromises = selectedCats.map(id => andrecitoService.getDocumentsByCategory(id));
      const results = await Promise.all([...subPromises, ...catPromises]);
      setEstimatedDocCount(results.flat().length);
    } catch (e) {
      console.error(e);
    }
  }, [selectedSubcats, selectedCats]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const t = setTimeout(() => { updateDocCount(); }, 300);
    return () => clearTimeout(t);
  }, [updateDocCount]);

  const handleSearch = useCallback(async () => {
    if (!query.trim() || !hasSelection) return;

    setLoading(true);
    setResponse('');
    setLastQuery(query.trim());

    try {
      setProcessingStep('Localizando documentos...');
      const subPromises = selectedSubcats.map(id => andrecitoService.getDocuments(id));
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
  }, [query, hasSelection, selectedSubcats, selectedCats]);

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

  const categoryTree = useMemo(() => categories.map(cat => (
    <div key={cat.id} className="mb-1.5">
      <button
        onClick={() => {
          setExpandedCat(expandedCat === cat.id ? '' : cat.id);
          if (!subcategoriesMap[cat.id]) andrecitoService.getSubcategories(cat.id).then(subs => setSubcategoriesMap(p => ({ ...p, [cat.id]: subs })));
        }}
        className={`w-full flex items-center justify-between py-2 text-sm transition-colors ${expandedCat === cat.id ? 'text-army-green font-semibold' : 'text-army-green/60 hover:text-army-green font-medium'}`}
      >
        <span className="flex items-center gap-2">
          <Folder size={13} className={expandedCat === cat.id ? 'text-army-gold' : 'text-army-green/30'} />
          {cat.name}
        </span>
        {expandedCat === cat.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
      {expandedCat === cat.id && (
        <div className="pl-4 space-y-0.5 mt-0.5 border-l border-army-gold/25 ml-1.5">
          {subcategoriesMap[cat.id]?.map(sub => (
            <button
              key={sub.id}
              onClick={() => setSelectedSubcats(p => p.includes(sub.id) ? p.filter(x => x !== sub.id) : [...p, sub.id])}
              className={`w-full flex items-center gap-2 py-1.5 text-xs transition-all ${selectedSubcats.includes(sub.id) ? 'text-army-green font-semibold' : 'text-army-green/50 hover:text-army-green'}`}
            >
              {selectedSubcats.includes(sub.id)
                ? <CheckSquare size={13} className="text-army-gold flex-shrink-0" />
                : <Square size={13} className="text-army-green/20 flex-shrink-0" />}
              {sub.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )), [categories, expandedCat, subcategoriesMap, selectedSubcats]);

  const renderedResponse = useMemo(() => <ReactMarkdown>{response}</ReactMarkdown>, [response]);

  return (
    <div className="flex flex-col h-screen bg-army-cream overflow-hidden">

      {/* ── Header ── */}
      <header className="bg-army-green text-white sticky top-0 z-50 border-b-2 border-army-gold no-print">
        <div className="max-w-[1600px] mx-auto px-5 sm:px-8 h-[64px] flex items-center gap-4">

          {/* Back + system name */}
          <div className="flex items-center gap-3.5 flex-shrink-0">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-white/40 hover:text-army-gold transition-colors text-[11px] font-medium tracking-[0.14em] uppercase"
            >
              <ArrowLeft size={13} />
              <span className="hidden sm:inline">Portal</span>
            </button>
            <div className="h-4 w-px bg-white/15" />
            <Bot size={20} className="text-army-gold/60 flex-shrink-0" />
            <div className="leading-tight min-w-0">
              <p className="text-[8.5px] tracking-[0.16em] uppercase text-white/35 font-medium">Sistema de Pesquisas</p>
              <p className="font-cormorant font-semibold text-[1rem] text-white leading-none tracking-tight">ANDRECITO</p>
            </div>
          </div>

          {/* Nav pills */}
          <div className="flex-1 flex items-center justify-center">
            <div className="hidden sm:flex items-center gap-0.5 bg-white/[0.06] p-1">
              {([
                { id: 'query' as ViewState, icon: Search, label: 'Pesquisa' },
                { id: 'library' as ViewState, icon: Library, label: 'Biblioteca' },
                ...(userRole === 'admin' ? [{ id: 'admin' as ViewState, icon: Settings, label: 'Admin' }] : []),
              ]).map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => onNavigate(id)}
                  className={`px-3.5 py-1.5 text-[11px] font-medium tracking-wide flex items-center gap-1.5 transition-all ${currentView === id ? 'bg-white text-army-green' : 'text-white/45 hover:text-white'}`}
                >
                  <Icon size={12} /> {label}
                </button>
              ))}
            </div>
          </div>

          {/* Logout */}
          <button
            onClick={onLogout}
            className="flex-shrink-0 flex items-center gap-1.5 text-white/35 hover:text-red-300 transition-colors text-[11px] font-medium tracking-wide uppercase"
          >
            <LogOut size={13} />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ── */}
        <aside className="w-72 bg-white border-r border-army-green/10 flex flex-col h-full z-10 no-print">
          <div className="px-5 pt-6 pb-2 border-b border-army-green/8">
            <p className="text-[9px] font-semibold tracking-[0.2em] uppercase text-army-gold mb-0.5">Acervo</p>
            <h3 className="font-cormorant font-semibold text-[1.1rem] text-army-green leading-tight">Documentos</h3>
          </div>

          <div className="p-5 overflow-y-auto flex-1 custom-scrollbar">
            {categoryTree}
          </div>

          {/* Doc count */}
          <div className="p-4 border-t border-army-green/10 bg-army-cream/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[9px] tracking-[0.14em] uppercase text-army-green/40 font-medium mb-0.5">Escopo de Análise</p>
                <p className="font-cormorant font-semibold text-xl text-army-green leading-none">{estimatedDocCount} <span className="text-sm font-sans font-normal text-army-green/50">arquivos</span></p>
              </div>
              <Bot size={20} className="text-army-gold/40" />
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="flex-1 flex flex-col bg-army-cream/40 overflow-hidden relative">

          {/* Results area */}
          <div className="flex-1 overflow-y-auto p-5 md:p-10 custom-scrollbar">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center gap-5">
                <div className="relative">
                  <RefreshCw className="w-14 h-14 text-army-gold/70 animate-spin" />
                  <Bot className="absolute inset-0 m-auto text-army-green" size={22} />
                </div>
                <div className="text-center">
                  <h3 className="font-cormorant font-semibold text-xl text-army-green">{processingStep}</h3>
                  <p className="text-xs text-army-green/40 mt-1.5 font-medium">Aguarde, a IA está processando seu pedido.</p>
                </div>
              </div>
            ) : response ? (
              <div className="max-w-4xl mx-auto bg-white border-l-4 border-army-gold shadow-[0_4px_24px_rgba(46,61,26,0.08)] print:border-none print:shadow-none print:max-w-full">
                {/* Response header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-8 pt-7 pb-5 border-b border-army-green/8 gap-4 no-print">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-army-green flex items-center justify-center flex-shrink-0">
                      <Bot size={16} className="text-white" />
                    </div>
                    <div>
                      <p className="font-cormorant font-semibold text-army-green text-lg leading-none">Resultado da consulta</p>
                      <p className="text-[9px] text-army-green/40 uppercase tracking-widest font-medium mt-0.5">Baseado em Legislação Federal e Normas do EB</p>
                    </div>
                  </div>
                  <div className="flex gap-2 self-end">
                    <button
                      onClick={handleDownloadPDF}
                      className="flex items-center gap-1.5 px-3.5 py-2 border border-army-green/15 hover:border-army-gold hover:bg-army-gold/5 text-army-green/50 hover:text-army-gold transition-all text-xs font-medium"
                      title="Baixar PDF"
                    >
                      <Download size={14} /> <span className="hidden lg:inline">PDF</span>
                    </button>
                    <button
                      onClick={() => window.print()}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-army-green hover:bg-army-mid text-white transition-all text-xs font-medium"
                      title="Imprimir"
                    >
                      <Printer size={14} /> <span className="hidden lg:inline">Imprimir</span>
                    </button>
                  </div>
                </div>
                <div className="prose prose-slate max-w-none px-8 py-7 text-army-charcoal/80 leading-relaxed text-sm print:text-black overflow-visible">
                  {renderedResponse}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center px-6 no-print">
                <div className="w-16 h-16 border border-army-gold/25 bg-white flex items-center justify-center mb-6">
                  <Search size={28} className="text-army-green/25" />
                </div>
                <h3 className="font-cormorant font-semibold text-2xl text-army-green/40 mb-2">Central de Inteligência</h3>
                <p className="text-xs text-army-green/30 max-w-xs leading-relaxed font-medium">
                  Selecione as pastas de documentos ao lado e digite sua dúvida jurídica ou administrativa abaixo.
                </p>
              </div>
            )}
          </div>

          {/* ── Input bar ── */}
          <div className="px-5 md:px-10 py-5 bg-white border-t border-army-green/10 shadow-[0_-4px_24px_rgba(46,61,26,0.06)] relative z-10 no-print">
            <div className="max-w-4xl mx-auto flex items-center gap-3">
              <button
                onClick={() => { setQuery(''); setResponse(''); }}
                className="flex-shrink-0 w-11 h-11 border border-army-green/15 hover:border-red-200 hover:bg-red-50 text-army-green/30 hover:text-red-400 transition-all flex items-center justify-center"
                title="Limpar"
              >
                <Trash2 size={16} />
              </button>
              <div className="flex-1 relative">
                <input
                  type="text"
                  className="w-full bg-army-cream border border-army-green/15 focus:border-army-green focus:bg-white py-3.5 pl-5 pr-20 outline-none text-sm text-army-charcoal placeholder-army-green/30 transition-all"
                  placeholder="Sobre o que deseja pesquisar hoje?"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  disabled={loading || !hasSelection}
                />
                <button
                  onClick={handleSearch}
                  disabled={loading || !hasSelection || !query.trim()}
                  className="absolute right-0 top-0 bottom-0 bg-army-green hover:bg-army-mid text-white px-5 font-medium transition-colors disabled:opacity-30 flex items-center justify-center"
                >
                  <Send size={17} />
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AndrecitoQuery;
