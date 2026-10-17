
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Folder, FileText, Download, ChevronRight, ChevronDown, Clock, Trash2, ArrowLeft, Bot, Search, Library, Settings, LogOut, Menu, X, Edit, Save, Eraser, Database } from 'lucide-react';
import { andrecitoService } from '../../services/andrecitoService';
import { AndrecitoCategory, AndrecitoSubcategory, AndrecitoDocument } from '../../types';
import { ViewState, UserRole } from './AndrecitoApp';
import AndrecitoHeader from './AndrecitoHeader';

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
  // No celular os departamentos viram gaveta sobre a lista de documentos.
  const [acervoAberto, setAcervoAberto] = useState(false);
  const [activeSub, setActiveSub] = useState<string | null>(null);

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
    setActiveSub(null);
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
    setActiveSub(null);
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
    setActiveSub(subId);
    setAcervoAberto(false);
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
      className="group bg-white p-4 border border-army-green/10 hover:border-army-gold/50 transition-colors flex items-center gap-4 relative overflow-hidden"
    >
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-army-green scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-300" />
      <div className="p-3 bg-army-cream text-army-green/75 group-hover:bg-army-green group-hover:text-white transition-all">
        <FileText size={24} />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-bold text-army-charcoal truncate mb-1" title={doc.name}>{doc.name}</h4>
        <div className="flex items-center gap-3 text-[11px] text-army-green/75 font-medium">
          <span className="flex items-center gap-1"><Database size={10} /> {formatSize(doc.size)}</span>
          <span className="flex items-center gap-1"><Clock size={10} /> {new Date(doc.created_at).toLocaleDateString()}</span>
        </div>
      </div>
      <Download size={18} className="text-army-green/75 group-hover:text-army-green transition-colors" />
    </a>
  )), [documents]);

  return (
    <div className="flex flex-col h-screen bg-army-cream font-sans overflow-hidden">
      <AndrecitoHeader onBack={onBack} onLogout={onLogout} onNavigate={onNavigate} currentView={currentView} userRole={userRole} />

      <div className="flex flex-1 overflow-hidden relative">
        <aside
          id="acervo-biblioteca"
          aria-label="Departamentos"
          className={`${acervoAberto ? 'flex' : 'hidden'} md:flex absolute inset-0 md:static w-full md:w-72 bg-white border-r border-army-green/10 flex-col h-full z-30 no-print overflow-y-auto custom-scrollbar`}
        >
          <div className="p-5 md:p-6">
            <div className="flex items-center justify-between gap-3 mb-4 border-b border-army-green/10 pb-3">
              <h2 className="font-cormorant font-semibold text-xl text-army-green">Departamentos</h2>
              <button
                type="button"
                onClick={() => setAcervoAberto(false)}
                className="md:hidden flex-shrink-0 min-h-[44px] px-3 bg-army-green text-white text-[13px] font-semibold"
              >
                Ver documentos
              </button>
            </div>
            <div className="space-y-1">
              {categories.map(cat => (
                <div key={cat.id} className="mb-2">
                  <button
                    type="button"
                    aria-expanded={activeCat === cat.id}
                    onClick={() => handleExpandCategory(cat.id)}
                    className={`w-full flex items-center justify-between py-2.5 px-3 text-sm font-bold transition-all ${activeCat === cat.id ? 'bg-army-green text-white' : 'text-army-charcoal/80 hover:bg-army-cream'}`}
                  >
                    <span className="flex items-center gap-2 min-w-0 text-left"><Folder size={16} className="flex-shrink-0" /> <span className="truncate">{cat.name}</span></span>
                    {activeCat === cat.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  {activeCat === cat.id && (
                    <div className="mt-1 space-y-1 pl-3">
                      {subcategories.map(sub => (
                        <button
                          key={sub.id}
                          type="button"
                          aria-pressed={activeSub === sub.id}
                          onClick={() => handleSubSelect(sub.id)}
                          className={`w-full text-left min-h-[40px] py-2 px-4 text-[13px] font-medium transition-colors truncate ${activeSub === sub.id ? 'bg-army-cream text-army-green font-semibold' : 'text-army-green/75 hover:text-army-green hover:bg-army-cream'}`}
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

        <main className="flex-1 flex flex-col bg-army-cream overflow-hidden">
          <div className="p-4 bg-white border-b border-army-green/10">
            <button
              type="button"
              onClick={() => setAcervoAberto(true)}
              aria-controls="acervo-biblioteca"
              aria-expanded={acervoAberto}
              className="md:hidden w-full mb-3 min-h-[44px] flex items-center gap-2 px-4 border border-army-green/15 bg-army-cream text-[13px] font-semibold text-army-green"
            >
              <Folder size={15} className="text-army-gold-deep" /> Departamentos
            </button>
            <div className="max-w-4xl mx-auto flex gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Pesquisar por nome do arquivo em todo o acervo..."
                  aria-label="Pesquisar no acervo"
                  className="w-full bg-army-cream border border-army-green/10 py-3 pl-12 pr-4 text-sm outline-none transition-all"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
                <Search className="absolute left-4 top-3.5 text-army-green/75" size={18} />
              </div>
              <button
                onClick={handleSearch}
                className="flex-shrink-0 bg-army-green text-white px-5 sm:px-6 min-h-[44px] font-semibold text-sm hover:bg-army-mid transition-colors flex items-center gap-2"
              >
                Buscar
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar" aria-busy={loadingDocs}>
            <div className="max-w-6xl mx-auto">
              <div className="mb-6 flex justify-between items-center gap-3 flex-wrap">
                <h3 className="text-xs font-semibold text-army-green/75 uppercase tracking-widest">
                  {isSearching ? `Resultados da busca por "${searchTerm}"` : activeCat ? 'Documentos na pasta' : 'Acervo Digital'}
                </h3>
                <span className="text-[11px] font-bold text-army-green bg-army-green/10 px-2 py-1 rounded-full border border-army-green/20">
                  {uniqueFileCount} Arquivos Únicos
                </span>
              </div>

              {loadingDocs ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="bg-white p-4 border border-army-green/10 animate-pulse h-24"></div>
                  ))}
                </div>
              ) : documents.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {documentCards}
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-center text-army-green/75 gap-4 px-4">
                  <FileText size={48} className="opacity-20" aria-hidden="true" />
                  <p className="text-sm font-medium max-w-sm" role="status">
                    {isSearching
                      ? `Nenhum arquivo com "${searchTerm}" no nome.`
                      : activeCat
                        ? 'Esta pasta não tem documentos soltos. Escolha uma subpasta.'
                        : 'Escolha um departamento ou pesquise pelo nome do arquivo.'}
                  </p>
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
