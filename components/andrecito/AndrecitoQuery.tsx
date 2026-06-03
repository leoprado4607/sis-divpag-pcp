
import React, { useState, useEffect } from 'react';
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
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [processingStep, setProcessingStep] = useState('');

  const hasSelection = selectedSubcats.length > 0 || selectedCats.length > 0;

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // Debounce: ao marcar/desmarcar várias pastas em sequência, evita disparar
    // uma rajada de requests Supabase a cada clique — só conta após estabilizar.
    const t = setTimeout(() => { updateDocCount(); }, 300);
    return () => clearTimeout(t);
  }, [selectedSubcats, selectedCats]);

  const loadData = async () => {
    try {
      const cats = await andrecitoService.getCategories();
      setCategories(cats);
    } catch (e) {
      console.error(e);
    }
  };

  const updateDocCount = async () => {
    try {
      const subPromises = selectedSubcats.map(id => andrecitoService.getDocuments(id));
      const catPromises = selectedCats.map(id => andrecitoService.getDocumentsByCategory(id));
      const results = await Promise.all([...subPromises, ...catPromises]);
      setEstimatedDocCount(results.flat().length);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSearch = async () => {
    if (!query.trim() || !hasSelection) return;
    
    setLoading(true);
    setResponse('');
    
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
  };

  const handleDownloadPDF = () => {
    if (!response) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);
    let cursorY = 40;

    const addHeader = (pdfDoc: jsPDF) => {
      pdfDoc.setFont("helvetica", "bold");
      pdfDoc.setFontSize(14);
      pdfDoc.setTextColor(26, 60, 26); // Army Green
      pdfDoc.text("SISTEMA ANDRECITO - ANÁLISE DE LEGISLAÇÃO MILITAR", pageWidth / 2, 15, { align: "center" });
      
      pdfDoc.setFontSize(9);
      pdfDoc.setTextColor(189, 156, 77); // Army Gold
      pdfDoc.text("DIVISÃO DE PAGAMENTO DE PESSOAL / B ADM GU NATAL", pageWidth / 2, 21, { align: "center" });
      
      pdfDoc.setDrawColor(189, 156, 77);
      pdfDoc.setLineWidth(0.5);
      pdfDoc.line(margin, 25, pageWidth - margin, 25);
    };

    addHeader(doc);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(50, 50, 50);

    const cleanText = response
      .replace(/[*#_]/g, '')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .trim();
    
    const lines = doc.splitTextToSize(cleanText, contentWidth);

    lines.forEach((line: string) => {
      if (cursorY > pageHeight - margin) {
        doc.addPage();
        addHeader(doc);
        cursorY = 40;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.setTextColor(50, 50, 50);
      }
      doc.text(line, margin, cursorY);
      cursorY += 6;
    });
    
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Gerado em ${new Date().toLocaleString('pt-BR')} - Página ${i} de ${pageCount}`, 
        pageWidth / 2, 
        pageHeight - 10, 
        { align: "center" }
      );
    }

    doc.save(`andrecito_consulta_${Date.now()}.pdf`);
  };

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
                  <h1 className="text-lg md:text-xl font-montserrat font-bold leading-none">Sistema ANDRECITO</h1>
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
            {categories.map(cat => (
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
            ))}
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
                <div className="prose prose-slate max-w-none text-slate-700 leading-relaxed text-sm md:text-base print:text-black overflow-visible"><ReactMarkdown>{response}</ReactMarkdown></div>
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
