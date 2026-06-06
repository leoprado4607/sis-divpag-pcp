
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

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    // Debounce: ao marcar/desmarcar várias pastas em sequência, evita disparar
    // uma rajada de requests Supabase a cada clique — só conta após estabilizar.
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
      const aiResponse = await andrecitoService.queryGemini(query, allDocs);
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

    // Paleta institucional (RGB).
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

    // Cabeçalho de continuação (páginas 2+): faixa fina verde com identificação.
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

    // Remove marcadores inline que não renderizamos diretamente (mantém _ de nomes
    // de arquivo). O **negrito** é tratado à parte em writeRich.
    const cleanInline = (s: string) =>
      s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[`*]/g, '').trim();

    // Escreve texto com quebra automática, suportando **negrito** inline.
    const writeRich = (
      text: string,
      opts: { size: number; color?: readonly number[]; indent?: number; gap?: number; bold?: boolean }
    ) => {
      const indent = opts.indent || 0;
      const lineH = opts.size + 5;
      const startX = margin + indent;
      const maxW = contentW - indent;
      const color = opts.color || C.text;

      // Tokeniza em segmentos preservando o estado de negrito.
      const segs: { t: string; b: boolean }[] = [];
      const re = /\*\*([^*]+)\*\*/g;
      let last = 0, m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        if (m.index > last) segs.push({ t: text.slice(last, m.index), b: !!opts.bold });
        segs.push({ t: m[1], b: true });
        last = m.index + m[0].length;
      }
      if (last < text.length) segs.push({ t: text.slice(last), b: !!opts.bold });

      // Quebra cada segmento em palavras (preservando espaços) já limpas.
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
        if (x === startX && isSpace) return; // descarta espaço no início da linha
        doc.text(w.t, x, y);
        x += ww;
      });
      y += lineH + (opts.gap || 0);
    };

    // --- Separa o corpo da resposta da seção "Fontes Consultadas" ---
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

    // --- Cabeçalho institucional (1ª página) ---
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

    // --- Box com a consulta realizada ---
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

    // --- Corpo (renderização leve de Markdown) ---
    body.split(/\r?\n/).forEach(raw => {
      const line = raw.replace(/\s+$/, '');
      if (!line.trim()) { y += 5; return; }

      // Divisor
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        ensure(16); setDraw(C.rule); doc.setLineWidth(0.5);
        doc.line(margin, y, pageW - margin, y); y += 16; return;
      }
      // Títulos markdown (#, ##, ###)
      const h = line.match(/^(#{1,4})\s+(.*)/);
      if (h) {
        const lvl = h[1].length;
        y += lvl <= 2 ? 8 : 5;
        writeRich(h[2], { size: lvl === 1 ? 15 : lvl === 2 ? 13 : 11.5, color: C.green, bold: true, gap: 5 });
        return;
      }
      // Subtítulo "em negrito puro" (ex.: **1. Natureza...:**) → destaque verde
      const sub = line.match(/^\*\*(.+?)\*\*:?\s*$/);
      if (sub) {
        y += 6; writeRich(sub[1].replace(/:$/, ''), { size: 11.5, color: C.green, bold: true, gap: 4 });
        return;
      }
      // Lista numerada
      const n = line.match(/^\s*(\d+)\.\s+(.*)/);
      if (n) {
        ensure(15);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); setText(C.green);
        doc.text(`${n[1]}.`, margin, y);
        writeRich(n[2], { size: 10, indent: 18, gap: 3 });
        return;
      }
      // Lista com marcador
      const b = line.match(/^\s*[-*]\s+(.*)/);
      if (b) {
        ensure(15); setFill(C.gold); doc.circle(margin + 4, y - 3, 1.7, 'F');
        writeRich(b[1], { size: 10, indent: 16, gap: 3 });
        return;
      }
      // Parágrafo
      writeRich(line, { size: 10.5, gap: 6 });
    });

    // --- Seção "Fontes Consultadas" com links clicáveis ---
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

    // --- Rodapé com numeração (todas as páginas) ---
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

  // Memoiza a árvore de categorias da sidebar: sem isso, cada tecla digitada na
  // caixa de consulta reconstrói toda a lista de pastas. Só recalcula quando o
  // próprio acervo/seleção/expansão muda.
  const categoryTree = useMemo(() => categories.map(cat => (
    <div key={cat.id} className="mb-2">
      <button
        onClick={() => {
          setExpandedCat(expandedCat === cat.id ? '' : cat.id);
          if (!subcategoriesMap[cat.id]) andrecitoService.getSubcategories(cat.id).then(subs => setSubcategoriesMap(p => ({...p, [cat.id]: subs})));
        }}
        className={`w-full flex items-center justify-between py-2 text-sm font-bold transition-colors ${expandedCat === cat.id ? 'text-army-green' : 'text-slate-600 hover:text-army-green'}`}
      >
        <span className="flex items-center gap-2"><Folder size={14} className={expandedCat === cat.id ? 'text-army-gold' : 'text-slate-400'} /> {cat.name}</span>
        {expandedCat === cat.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {expandedCat === cat.id && (
        <div className="pl-4 space-y-1 mt-1 border-l-2 border-slate-100 ml-1.5">
          {subcategoriesMap[cat.id]?.map(sub => (
            <button
              key={sub.id}
              onClick={() => setSelectedSubcats(p => p.includes(sub.id) ? p.filter(x => x !== sub.id) : [...p, sub.id])}
              className={`w-full flex items-center gap-2 py-1.5 text-xs transition-all ${selectedSubcats.includes(sub.id) ? 'text-army-green font-bold' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {selectedSubcats.includes(sub.id) ? <CheckSquare size={14} className="text-army-gold" /> : <Square size={14} className="text-slate-300" />}
              {sub.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )), [categories, expandedCat, subcategoriesMap, selectedSubcats]);

  // Memoiza o render do markdown: re-parsear a resposta inteira a cada tecla
  // digitada na caixa de consulta é caro para respostas longas.
  const renderedResponse = useMemo(() => <ReactMarkdown>{response}</ReactMarkdown>, [response]);

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden font-sans">
      <header className="bg-army-green text-white shadow-xl border-b-[6px] border-army-gold sticky top-0 z-50 no-print">
        <div className="absolute inset-0 opacity-20 pointer-events-none select-none" 
             style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}>
        </div>

        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors"><ArrowLeft className="w-6 h-6 text-army-gold" /></button>
            <div className="flex items-center gap-3">
               <Bot size={32} className="text-white opacity-90" />
               <div className="text-left">
                  <h1 className="text-lg md:text-xl font-montserrat font-bold leading-none">Sistema de Consultas</h1>
                  <p className="text-army-gold text-[10px] uppercase font-bold tracking-widest mt-1">Análise de Legislação Militar</p>
               </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-1 bg-black/20 p-1 rounded-lg">
                <button onClick={() => onNavigate('query')} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${currentView === 'query' ? 'bg-white text-army-green shadow-sm' : 'text-gray-300 hover:text-white'}`}>
                  <Search size={14} /> Pesquisa
                </button>
                <button onClick={() => onNavigate('library')} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${currentView === 'library' ? 'bg-white text-army-green shadow-sm' : 'text-gray-300 hover:text-white'}`}>
                  <Library size={14} /> Biblioteca
                </button>
                {userRole === 'admin' && (
                  <button onClick={() => onNavigate('admin')} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${currentView === 'admin' ? 'bg-white text-army-green shadow-sm' : 'text-gray-300 hover:text-white'}`}>
                    <Settings size={14} /> Admin
                  </button>
                )}
             </div>
             <button onClick={onLogout} className="p-2 text-red-300 hover:text-white hover:bg-red-900/20 rounded-lg ml-2 transition-colors"><LogOut size={20}/></button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 bg-white border-r border-gray-200 flex flex-col h-full shadow-sm z-10 no-print">
          <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
            <h2 className="text-[10px] font-black text-army-green uppercase tracking-[0.2em] mb-4 border-b pb-2">Acervo de Documentos</h2>
            {categoryTree}
          </div>
          
          <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
             <div className="bg-army-green/5 p-3 rounded-lg border border-army-green/10 flex justify-between items-center">
               <div>
                  <span className="text-[9px] font-black text-army-green uppercase block mb-1 tracking-wider opacity-60">Escopo de Análise</span>
                  <span className="text-base font-black text-army-green">{estimatedDocCount} Arquivos</span>
               </div>
               <Bot size={24} className="text-army-gold opacity-50" />
             </div>
          </div>
        </aside>

        <main className="flex-1 flex flex-col bg-slate-100 overflow-hidden relative">
          <div className="flex-1 overflow-y-auto p-4 md:p-10 custom-scrollbar">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center gap-6 animate-pulse">
                <div className="relative">
                    <RefreshCw className="w-16 h-16 text-army-gold animate-spin" />
                    <Bot className="absolute inset-0 m-auto text-army-green" size={24} />
                </div>
                <div className="text-center">
                    <h3 className="text-xl font-bold text-slate-700 font-montserrat">{processingStep}</h3>
                    <p className="text-sm text-slate-400 mt-2">Aguarde, a IA está processando seu pedido.</p>
                </div>
              </div>
            ) : response ? (
              <div className="max-w-4xl mx-auto bg-white p-6 md:p-10 rounded-2xl shadow-xl animate-fade-in-up border-l-[10px] border-army-green relative overflow-visible print:border-none print:shadow-none print:max-w-full print:p-0">
                <div className="absolute top-0 right-0 w-32 h-32 bg-army-gold/5 rounded-full -mr-16 -mt-16 pointer-events-none no-print"></div>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 border-b border-slate-100 pb-5 print:mb-4 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-army-green text-white rounded-lg shadow-md no-print"><Bot size={24}/></div>
                    <div>
                        <h3 className="font-bold text-army-green text-lg">Resultado da consulta</h3>
                        <p className="text-[10px] text-slate-400 uppercase font-bold">Baseado em Legislação Federal e Normas do EB</p>
                    </div>
                  </div>
                  <div className="flex gap-2 no-print self-end">
                    <button 
                      onClick={handleDownloadPDF} 
                      className="p-2.5 bg-slate-50 hover:bg-army-gold/10 rounded-xl text-slate-400 hover:text-army-gold transition-all border border-slate-100 flex items-center gap-2 text-xs font-bold" 
                      title="Baixar PDF"
                    >
                      <Download size={18}/> <span className="hidden lg:inline">PDF</span>
                    </button>
                    <button 
                      onClick={() => window.print()} 
                      className="p-2.5 bg-army-green hover:bg-green-900 rounded-xl text-white transition-all shadow-md flex items-center gap-2 text-xs font-bold" 
                      title="Imprimir"
                    >
                      <Printer size={18}/> <span className="hidden lg:inline">Imprimir</span>
                    </button>
                  </div>
                </div>
                <div className="prose prose-slate max-w-none text-slate-700 leading-relaxed text-sm md:text-base print:text-black overflow-visible">{renderedResponse}</div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-40 text-center px-6 no-print">
                <div className="w-24 h-24 bg-slate-200 rounded-full flex items-center justify-center mb-6 shadow-inner">
                    <Search size={48} className="text-slate-400" />
                </div>
                <h3 className="text-2xl font-bold font-montserrat text-slate-600 mb-2">Central de Inteligência</h3>
                <p className="text-sm max-w-xs leading-relaxed">Selecione as pastas de documentos ao lado e digite sua dúvida jurídica ou administrativa abaixo.</p>
              </div>
            )}
          </div>

          <div className="p-4 md:p-8 bg-white border-t border-slate-200 shadow-2xl relative z-10 no-print">
            <div className="max-w-4xl mx-auto flex items-center gap-4">
               <button 
                 onClick={() => { setQuery(''); setResponse(''); }}
                 className="p-4 bg-slate-50 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-2xl transition-all border border-slate-100"
                 title="Limpar Conversa"
               >
                 <Trash2 size={24}/>
               </button>
               <div className="flex-1 relative group">
                 <input 
                   type="text" 
                   className="w-full bg-slate-50 border border-slate-200 rounded-full py-6 pl-8 pr-24 focus:ring-4 focus:ring-army-green/5 focus:border-army-green outline-none text-base md:text-lg transition-all shadow-inner"
                   placeholder="Sobre o que deseja pesquisar hoje?"
                   value={query}
                   onChange={e => setQuery(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && handleSearch()}
                   disabled={loading || !hasSelection}
                 />
                 <button 
                   onClick={handleSearch}
                   disabled={loading || !hasSelection || !query.trim()}
                   className="absolute right-2 top-2 bottom-2 bg-army-green hover:bg-green-900 text-white px-8 rounded-full font-bold shadow-lg transition-all disabled:opacity-30 disabled:shadow-none flex items-center justify-center"
                 >
                   <Send size={24}/>
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
