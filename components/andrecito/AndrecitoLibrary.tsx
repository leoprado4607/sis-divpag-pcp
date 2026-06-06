
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Folder, FileText, Download, ChevronRight, ChevronDown, Clock, Trash2, ArrowLeft, Bot, Search, Library, Settings, LogOut, Menu, X, Edit, Save, Eraser, Database } from 'lucide-react';
import { andrecitoService } from '../../services/andrecitoService';
import { AndrecitoCategory, AndrecitoSubcategory, AndrecitoDocument } from '../../types';
import { ViewState, UserRole } from './AndrecitoApp';

interface AndrecitoLibraryProps {
  onBack: () => void;
  onLogout: () => void;
  onNavigate: (view: ViewState) => void;
  currentView: ViewState;
  userRole: UserRole;
}

// Helpers puros em escopo de módulo: não dependem de props/estado, então não
// precisam ser recriados a cada render nem entrar nas deps dos useCallback.
const normalizeText = (text: string) => {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
};

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const AndrecitoLibrary: React.FC<AndrecitoLibraryProps> = ({ onBack, onLogout, onNavigate, currentView, userRole }) => {
  const [categories, setCategories] = useState<AndrecitoCategory[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [subcategories, setSubcategories] = useState<AndrecitoSubcategory[]>([]);
  const [documents, setDocuments] = useState<AndrecitoDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [uniqueFileCount, setUniqueFileCount] = useState(0);

  const loadCategories = useCallback(() => {
    andrecitoService.getCategories().then(setCategories);
  }, []);

  const calculateUniqueFiles = useCallback(async () => {
    try {
      const allDocs = await andrecitoService.searchAllDocuments();
      const uniqueNames = new Set(allDocs.map(doc => doc.name));
      setUniqueFileCount(uniqueNames.size);
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    loadCategories();
    calculateUniqueFiles();
  }, [loadCategories, calculateUniqueFiles]);

  const handleClearSearch = useCallback(() => {
    setSearchTerm('');
    setIsSearching(false);
    setDocuments([]);
    setActiveCat(null);
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchTerm.trim()) {
      handleClearSearch();
      return;
    }
    setLoadingDocs(true);
    setIsSearching(true);
    setActiveCat(null);
    try {
      const allDocs = await andrecitoService.searchAllDocuments();
      const searchTokens = normalizeText(searchTerm).split(/\s+/).filter(Boolean);
      const results = allDocs.filter(doc => {
        const normalizedDocName = normalizeText(doc.name);
        return searchTokens.every(token => normalizedDocName.includes(token));
      });
      setDocuments(results);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDocs(false);
    }
  }, [searchTerm, handleClearSearch]);

  const handleExpandCategory = useCallback(async (catId: string) => {
    if (activeCat === catId) {
      setActiveCat(null);
      setDocuments([]);
    } else {
      setActiveCat(catId);
      setIsSearching(false);
      setSearchTerm('');
      const subs = await andrecitoService.getSubcategories(catId);
      setSubcategories(subs);
      setLoadingDocs(true);
      const rootDocs = await andrecitoService.getDocumentsByCategory(catId);
      setDocuments(rootDocs);
      setLoadingDocs(false);
    }
  }, [activeCat]);

  const handleSubSelect = useCallback(async (subId: string) => {
    setLoadingDocs(true);
    const docs = await andrecitoService.getDocuments(subId);
    setDocuments(docs);
    setLoadingDocs(false);
  }, []);

  // Memoiza os cards de documento: digitar no campo de busca atualiza searchTerm
  // a cada tecla; sem isso, toda a grade de resultados seria re-renderizada.
  const documentCards = useMemo(() => documents.map(doc => (
    <a
      key={doc.id}
      href={doc.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-army-green transition-all flex items-center gap-4 relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-1 h-full bg-army-green/20 group-hover:bg-army-green transition-colors"></div>
      <div className="p-3 bg-slate-50 text-slate-400 group-hover:bg-army-green group-hover:text-white rounded-lg transition-all">
        <FileText size={24} />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-bold text-slate-800 truncate mb-1" title={doc.name}>{doc.name}</h4>
        <div className="flex items-center gap-3 text-[10px] text-slate-400 font-medium">
          <span className="flex items-center gap-1"><Database size={10} /> {formatSize(doc.size)}</span>
          <span className="flex items-center gap-1"><Clock size={10} /> {new Date(doc.created_at).toLocaleDateString()}</span>
        </div>
      </div>
      <Download size={18} className="text-slate-300 group-hover:text-army-green transition-colors" />
    </a>
  )), [documents]);

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans overflow-hidden">
      <header className="bg-army-green text-white shadow-xl border-b-[6px] border-army-gold sticky top-0 z-50">
        <div className="absolute inset-0 opacity-20 pointer-events-none select-none" 
             style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}>
        </div>

        <div className="max-w-[1600px] mx-auto px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors flex-shrink-0" title="Voltar ao Portal">
              <ArrowLeft className="w-6 h-6 text-army-gold" />
            </button>
            <div className="flex items-center gap-3 overflow-hidden">
               <Bot className="w-10 h-10 text-white opacity-90" />
               <div className="text-left min-w-0">
                 <h1 className="text-lg md:text-xl font-montserrat font-bold leading-none tracking-tight truncate">Sistema de Consultas</h1>
                 <p className="text-army-gold text-[10px] md:text-xs font-bold tracking-widest uppercase mt-1 truncate">Biblioteca Digital</p>
               </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
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
             <button onClick={onLogout} className="p-2 text-red-300 hover:text-white hover:bg-red-900/30 rounded-lg ml-2 transition-colors"><LogOut size={18} /></button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 bg-white border-r border-gray-200 flex flex-col h-full shadow-sm z-10 no-print overflow-y-auto custom-scrollbar">
          <div className="p-6">
            <h2 className="text-[10px] font-black text-army-green uppercase tracking-[0.2em] mb-4 border-b pb-2">Departamentos</h2>
            <div className="space-y-1">
              {categories.map(cat => (
                <div key={cat.id} className="mb-2">
                  <button 
                    onClick={() => handleExpandCategory(cat.id)}
                    className={`w-full flex items-center justify-between py-2.5 px-3 rounded-lg text-sm font-bold transition-all ${activeCat === cat.id ? 'bg-army-green text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    <span className="flex items-center gap-2 truncate"><Folder size={16} /> {cat.name}</span>
                    {activeCat === cat.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  {activeCat === cat.id && (
                    <div className="mt-1 space-y-1 pl-3">
                      {subcategories.map(sub => (
                        <button 
                          key={sub.id} 
                          onClick={() => handleSubSelect(sub.id)}
                          className="w-full text-left py-2 px-4 text-xs font-medium text-slate-500 hover:text-army-green hover:bg-slate-50 rounded-md transition-all truncate"
                        >
                          {sub.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
          <div className="p-4 bg-white border-b border-slate-200">
            <div className="max-w-4xl mx-auto flex gap-3">
              <div className="relative flex-1">
                <input 
                  type="text" 
                  placeholder="Pesquisar por nome do arquivo em todo o acervo..."
                  className="w-full bg-slate-50 border border-slate-200 py-3 pl-12 pr-4 rounded-xl text-sm focus:ring-2 focus:ring-army-green/20 outline-none transition-all"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
                <Search className="absolute left-4 top-3.5 text-slate-400" size={18} />
              </div>
              <button 
                onClick={handleSearch}
                className="bg-army-green text-white px-6 py-3 rounded-xl font-bold text-sm shadow-md hover:bg-green-900 transition-all flex items-center gap-2"
              >
                Buscar
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div className="max-w-6xl mx-auto">
              <div className="mb-6 flex justify-between items-center">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  {isSearching ? `Resultados da busca por "${searchTerm}"` : activeCat ? 'Documentos na pasta' : 'Acervo Digital'}
                </h3>
                <span className="text-[10px] font-bold text-army-green bg-army-green/10 px-2 py-1 rounded-full border border-army-green/20">
                  {uniqueFileCount} Arquivos Únicos
                </span>
              </div>

              {loadingDocs ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm animate-pulse h-24"></div>
                  ))}
                </div>
              ) : documents.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {documentCards}
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-slate-300 gap-4">
                  <FileText size={48} className="opacity-20" />
                  <p className="text-sm font-medium">Nenhum documento encontrado.</p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AndrecitoLibrary;
