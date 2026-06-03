import React, { useEffect, useState, useRef } from 'react';
import { ArrowLeft, Search, Copy, Check, Printer, FileText, Filter, X } from 'lucide-react';
import { notesService } from '../../services/notesService';
import { GeneralSubject, SpecificSubject, Note } from '../../types';

interface NotesPublicProps {
  onBack: () => void;
}

const NotesPublic: React.FC<NotesPublicProps> = ({ onBack }) => {
  const [generals, setGenerals] = useState<GeneralSubject[]>([]);
  const [specifics, setSpecifics] = useState<SpecificSubject[]>([]);
  const [currentNote, setCurrentNote] = useState<Note | null>(null);
  
  const [selectedGenId, setSelectedGenId] = useState('');
  const [selectedSpecId, setSelectedSpecId] = useState('');
  const [copied, setCopied] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);

  // Load General Subjects on mount
  useEffect(() => {
    notesService.getGeneralSubjects().then(setGenerals);
  }, []);

  // Load Specific Subjects when General changes
  useEffect(() => {
    if (selectedGenId) {
      notesService.getSpecificSubjects(selectedGenId).then(setSpecifics);
      setSelectedSpecId('');
      setCurrentNote(null);
    } else {
      setSpecifics([]);
    }
  }, [selectedGenId]);

  // Load Note when Specific changes
  useEffect(() => {
    if (selectedSpecId && selectedGenId) {
      notesService.getNote(selectedGenId, selectedSpecId).then(setCurrentNote);
      // No mobile, esconde filtros ao selecionar
      setShowMobileFilters(false);
    }
  }, [selectedSpecId]);

  const handleCopy = () => {
    if (!contentRef.current) return;
    
    const range = document.createRange();
    range.selectNode(contentRef.current);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    document.execCommand('copy');
    window.getSelection()?.removeAllRanges();
    
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden font-sans">
      {/* HEADER PADRÃO INSTITUCIONAL */}
      <header className="bg-army-green text-white shadow-xl border-b-[6px] border-army-gold sticky top-0 z-50">
        <div className="absolute inset-0 opacity-10 pointer-events-none" 
             style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}>
        </div>
        
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-4 relative z-10">
          {/* Lado Esquerdo: Voltar + Título */}
          <div className="flex items-center gap-4 w-full md:w-auto">
            <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors flex-shrink-0" title="Voltar ao Menu">
              <ArrowLeft className="w-6 h-6 text-army-gold" />
            </button>
            <div className="flex items-center gap-3 overflow-hidden">
               <FileText className="w-10 h-10 text-white opacity-90" />
               <div className="text-left min-w-0">
                 <h1 className="text-lg md:text-xl font-montserrat font-bold leading-none tracking-tight truncate">Repositório de Notas</h1>
                 <p className="text-army-gold text-[10px] md:text-xs font-bold tracking-widest uppercase mt-1 truncate">Divisão de Pagamento de Pessoal</p>
               </div>
            </div>
          </div>
          
          {/* Lado Direito: Ações */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
             <button 
               className="md:hidden p-2 bg-white/10 hover:bg-white/20 rounded-lg flex items-center gap-2 border border-white/10 transition-colors"
               onClick={() => setShowMobileFilters(!showMobileFilters)}
             >
               {showMobileFilters ? <X size={18} /> : <Filter size={18} />}
               <span className="text-xs font-bold">Filtros</span>
             </button>

             <div className="text-right hidden md:block border-l border-white/20 pl-4 ml-2">
                <span className="text-[10px] text-gray-300 block uppercase font-medium">Módulo</span>
                <span className="text-xs font-bold text-white">Consulta Pública</span>
             </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar Filters */}
        <aside className={`
            absolute md:relative z-10 w-full md:w-80 bg-white border-r border-gray-200 flex flex-col h-full transition-transform duration-300 shadow-lg md:shadow-none
            ${showMobileFilters ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
          <div className="p-6 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-xs font-bold text-army-green uppercase tracking-wider mb-4 flex items-center gap-2">
               <Filter size={14} /> Filtros de Busca
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Assunto Geral</label>
                <div className="relative">
                  <select 
                    className="w-full bg-white border border-gray-300 text-gray-700 text-sm rounded-lg focus:ring-2 focus:ring-army-green/20 focus:border-army-green block p-2.5 appearance-none font-medium"
                    value={selectedGenId}
                    onChange={(e) => setSelectedGenId(e.target.value)}
                  >
                    <option value="">Selecione...</option>
                    {generals.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                  <Search className="absolute right-3 top-3 text-gray-400 pointer-events-none" size={16} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Assunto Específico</label>
                <select 
                  className="w-full bg-white border border-gray-300 text-gray-700 text-sm rounded-lg focus:ring-2 focus:ring-army-green/20 focus:border-army-green block p-2.5 disabled:opacity-50 font-medium"
                  value={selectedSpecId}
                  onChange={(e) => setSelectedSpecId(e.target.value)}
                  disabled={!selectedGenId}
                >
                  <option value="">Selecione...</option>
                  {specifics.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="p-6 bg-white flex-1">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
              <h3 className="text-blue-800 font-bold text-sm mb-1">Dica de uso</h3>
              <p className="text-blue-600 text-xs">Selecione os assuntos acima para visualizar o modelo. Use o botão "Copiar" para levar a formatação correta para o Word/Outlook.</p>
            </div>
          </div>
        </aside>

        {/* Main Content (Note Viewer) */}
        <main className="flex-1 overflow-auto bg-gray-100 p-4 md:p-8 flex justify-center w-full">
          {currentNote ? (
            <div className="w-full max-w-4xl animate-fade-in-up">
              {/* Actions Toolbar */}
              <div className="flex justify-end gap-2 mb-4">
                <button 
                  onClick={handlePrint}
                  className="bg-white text-gray-600 hover:text-army-green border border-gray-200 hover:border-army-green px-3 py-2 md:px-4 md:py-2 rounded-lg text-xs md:text-sm font-bold flex items-center gap-2 transition-all shadow-sm uppercase tracking-wide"
                >
                  <Printer size={16} /> <span className="hidden md:inline">Imprimir</span>
                </button>
                <button 
                  onClick={handleCopy}
                  className={`
                    px-3 py-2 md:px-4 md:py-2 rounded-lg text-xs md:text-sm font-bold flex items-center gap-2 transition-all shadow-sm uppercase tracking-wide
                    ${copied ? 'bg-green-600 text-white border border-green-600' : 'bg-army-green text-white hover:bg-green-900 border border-army-green'}
                  `}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? 'Copiado!' : 'Copiar Texto'}
                </button>
              </div>

              {/* Document Paper */}
              <div 
                ref={contentRef}
                className="bg-white shadow-xl rounded-none min-h-[600px] md:min-h-[800px] p-8 md:p-16 text-gray-900 leading-relaxed print:shadow-none print:w-full flex flex-col justify-between print:p-0"
              >
                <div>
                  <div className="text-center mb-8 border-b-2 border-gray-900 pb-4">
                    <h2 className="text-lg md:text-xl font-bold uppercase mb-1">Modelo de Nota para Aditamento</h2>
                    <p className="text-xs md:text-sm text-gray-500 uppercase font-bold">
                      {generals.find(g => g.id === selectedGenId)?.name} &bull; {specifics.find(s => s.id === selectedSpecId)?.name}
                    </p>
                  </div>

                  {/* Rich Content Render (Main) */}
                  <div 
                    className="prose max-w-none mb-12 text-sm md:text-base text-justify"
                    dangerouslySetInnerHTML={{ __html: currentNote.main_text }}
                  />
                </div>

                {/* Rich Content Render (Closing) */}
                <div 
                  className="mt-12 pt-8 border-t border-gray-100 text-sm font-medium prose max-w-none"
                  dangerouslySetInnerHTML={{ __html: currentNote.closing_text }}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 p-4 text-center">
              <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mb-6">
                 <FileText className="text-gray-400 w-10 h-10" />
              </div>
              <p className="text-base md:text-lg font-bold text-gray-500">
                {showMobileFilters ? "Use os filtros para buscar." : "Abra os filtros e selecione um assunto."}
              </p>
              <p className="text-sm text-gray-400 mt-2">O documento aparecerá aqui para visualização e cópia.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default NotesPublic;