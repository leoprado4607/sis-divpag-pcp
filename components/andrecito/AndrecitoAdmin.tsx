
import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, Bot, Search, Library, Settings, LogOut, Menu, X,
  FolderPlus, Upload, HardDrive, Trash2, Plus, FileText, CheckCircle, Database, Files, Trash, AlertCircle, Clock, FilterX, ChevronRight, Folder
} from 'lucide-react';
import { andrecitoService } from '../../services/andrecitoService';
import { AndrecitoCategory, AndrecitoSubcategory, AndrecitoDocument } from '../../types';
import { ViewState, UserRole } from './AndrecitoApp';

interface AndrecitoAdminProps {
  onBack: () => void;
  onLogout: () => void;
  onNavigate: (view: ViewState) => void;
  currentView: ViewState;
  userRole?: UserRole;
}

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const AndrecitoAdmin: React.FC<AndrecitoAdminProps> = ({ onBack, onLogout, onNavigate, currentView, userRole }) => {
  const [categories, setCategories] = useState<AndrecitoCategory[]>([]);
  const [subcategories, setSubcategories] = useState<AndrecitoSubcategory[]>([]);
  const [documents, setDocuments] = useState<AndrecitoDocument[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Estados de Gerenciamento
  const [docSearch, setDocSearch] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newSubNames, setNewSubNames] = useState<Record<string, string>>({});
  const [uploadCatId, setUploadCatId] = useState('');
  const [uploadSubId, setUploadSubId] = useState('');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [cacheMsg, setCacheMsg] = useState('');

  const handleClearCache = () => {
    const removed = andrecitoService.clearTextCache();
    setCacheMsg(removed > 0 ? `Cache limpo: ${removed} documento(s) removido(s).` : 'O cache já estava vazio.');
    setTimeout(() => setCacheMsg(''), 4000);
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Reset subcategory when category changes in upload section
  useEffect(() => {
    setUploadSubId('');
  }, [uploadCatId]);

  const fetchAllData = async () => {
    setLoadingData(true);
    try {
      const [cats, subs, docs] = await Promise.all([
        andrecitoService.getCategories(),
        andrecitoService.getAllSubcategories(),
        andrecitoService.searchAllDocuments()
      ]);
      setCategories(cats);
      setSubcategories(subs);
      setDocuments(docs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingData(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      await andrecitoService.createCategory(newCatName);
      setNewCatName('');
      fetchAllData();
    } catch (err: any) {
      alert(`Erro ao criar categoria: ${err.message}`);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (confirm("Deseja excluir categoria? Ela só poderá ser excluída se não houver subcategorias ou arquivos vinculados.")) {
      try {
        await andrecitoService.deleteCategory(id);
        fetchAllData();
      } catch (err: any) {
        alert(`Erro ao excluir: ${err.message}`);
      }
    }
  };

  const handleAddSubcategory = async (catId: string) => {
    const name = newSubNames[catId];
    if (!name?.trim()) return;
    try {
      await andrecitoService.createSubcategory(catId, name);
      setNewSubNames(prev => ({ ...prev, [catId]: '' }));
      fetchAllData();
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  };

  const handleDeleteSubcategory = async (id: string) => {
    if (confirm("Excluir subcategoria? Ela só poderá ser excluída se não houver arquivos vinculados.")) {
      try {
        await andrecitoService.deleteSubcategory(id);
        fetchAllData();
      } catch (err: any) {
        alert(`Erro: ${err.message}`);
      }
    }
  };

  const handleUpload = async () => {
    if (uploadFiles.length === 0 || !uploadCatId) {
      alert("Selecione pelo menos um arquivo e a categoria de destino.");
      return;
    }
    
    setIsUploading(true);
    let successCount = 0;
    let errors: string[] = [];

    for (let i = 0; i < uploadFiles.length; i++) {
      try {
        await andrecitoService.uploadDocument(uploadFiles[i], uploadCatId, uploadSubId || null);
        successCount++;
        setUploadProgress(Math.round(((i + 1) / uploadFiles.length) * 100));
      } catch (err: any) {
        console.error(`Falha no upload de ${uploadFiles[i].name}:`, err);
        errors.push(`${uploadFiles[i].name}: ${err.message}`);
      }
    }

    if (errors.length > 0) {
      alert(`Processamento finalizado com ressalvas:\n- Sucessos: ${successCount}\n- Falhas: ${errors.length}\n\nErros detalhados:\n${errors.join('\n')}`);
    } else {
      alert(`Todos os ${successCount} arquivos foram enviados e registrados com sucesso.`);
    }

    setUploadFiles([]);
    setUploadProgress(0);
    setIsUploading(false);
    fetchAllData();
  };

  const handleDeleteDocument = async (doc: AndrecitoDocument) => {
    if (confirm(`Tem certeza que deseja excluir permanentemente o arquivo "${doc.name}"? Esta ação não pode ser desfeita.`)) {
      try {
        await andrecitoService.deleteDocument(doc.id, doc.url);
        fetchAllData();
      } catch (err: any) {
        alert(`Erro ao excluir arquivo: ${err.message}`);
      }
    }
  };

  const filteredDocuments = useMemo(() => {
    let result = documents;

    // Filtro por Busca Textual apenas (Revertido filtro de categoria)
    if (docSearch.trim()) {
      const search = docSearch.toLowerCase();
      result = result.filter(d => d.name.toLowerCase().includes(search));
    }

    return result;
  }, [documents, docSearch]);

  const getDocCountForCat = (catId: string) => {
    return documents.filter(d => d.category_id === catId).length;
  };

  const getDocCountForSub = (subId: string) => {
    return documents.filter(d => d.subcategory_id === subId).length;
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans overflow-hidden">
      <header className="bg-army-green text-white shadow-xl border-b-[6px] border-army-gold sticky top-0 z-50">
        <div className="absolute inset-0 opacity-20 pointer-events-none select-none" 
             style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}>
        </div>
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors flex-shrink-0"><ArrowLeft className="w-6 h-6 text-army-gold" /></button>
            <div className="flex items-center gap-3">
               <Bot className="w-10 h-10 text-white opacity-90" />
               <div className="text-left">
                 <h1 className="text-lg md:text-xl font-montserrat font-bold leading-none">Sistema de Consultas</h1>
                 <p className="text-army-gold text-[10px] uppercase font-bold tracking-widest mt-1">Gestão Admin</p>
               </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
             <div className="flex items-center gap-1 bg-black/20 p-1 rounded-lg">
                <button onClick={() => onNavigate('query')} className="px-3 py-1.5 rounded-md text-xs font-bold text-gray-300 hover:text-white"><Search size={14} /> Pesquisa</button>
                <button onClick={() => onNavigate('library')} className="px-3 py-1.5 rounded-md text-xs font-bold text-gray-300 hover:text-white"><Library size={14} /> Biblioteca</button>
                <button onClick={() => onNavigate('admin')} className="px-3 py-1.5 rounded-md text-xs font-bold bg-white text-army-green shadow-sm"><Settings size={14} /> Admin</button>
             </div>
             <button onClick={onLogout} className="p-2 text-red-300 hover:text-white rounded-lg ml-2"><LogOut size={18} /></button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar bg-slate-100">
        <div className="max-w-7xl mx-auto space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Gestão de Estrutura */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-sm font-black text-army-green uppercase tracking-widest flex items-center gap-2">
                        <FolderPlus size={18} /> Estrutura de Pastas
                        </h3>
                    </div>
                    
                    <div className="flex gap-2 mb-8">
                    <input 
                        className="flex-1 bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-sm"
                        placeholder="Nova Categoria (ex: Portarias)"
                        value={newCatName}
                        onChange={e => setNewCatName(e.target.value)}
                    />
                    <button onClick={handleAddCategory} className="bg-army-green text-white px-4 rounded-lg font-bold text-xs">Criar</button>
                    </div>
                    <div className="space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                    {categories.map(cat => (
                        <div 
                            key={cat.id} 
                            className="border transition-all rounded-xl p-4 bg-slate-50 border-slate-100 hover:border-slate-300"
                        >
                        <div className="flex justify-between items-center mb-4">
                            <div className="flex items-center gap-2">
                                <Folder size={16} className="text-slate-400" />
                                <span className="font-bold text-sm uppercase text-slate-600">{cat.name}</span>
                                <span className="bg-army-green/10 text-army-green text-[9px] font-black px-1.5 py-0.5 rounded-full border border-army-green/20">
                                    {getDocCountForCat(cat.id)}
                                </span>
                            </div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id); }} 
                                className="text-slate-300 hover:text-red-600 transition-colors" 
                                title="Excluir Categoria"
                            >
                                <Trash2 size={16}/>
                            </button>
                        </div>
                        <div className="pl-4 space-y-2">
                            {subcategories.filter(s => s.category_id === cat.id).map(sub => (
                            <div 
                                key={sub.id} 
                                className="flex justify-between items-center p-2 rounded-lg border text-xs bg-white border-slate-100 text-slate-600 hover:border-army-gold"
                            >
                                <div className="flex items-center gap-2">
                                    <ChevronRight size={12} className="text-slate-300" />
                                    <span className="font-medium">{sub.name}</span>
                                    <span className="text-[9px] font-bold text-slate-400">({getDocCountForSub(sub.id)})</span>
                                </div>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleDeleteSubcategory(sub.id); }} 
                                    className="text-slate-300 hover:text-red-400 transition-colors"
                                >
                                    <Trash size={14}/>
                                </button>
                            </div>
                            ))}
                            <div className="flex gap-2 pt-2">
                                <input 
                                    className="flex-1 text-[11px] p-2 border rounded-md outline-none focus:border-army-green"
                                    placeholder="Nova Subcategoria..."
                                    value={newSubNames[cat.id] || ''}
                                    onChange={e => setNewSubNames({...newSubNames, [cat.id]: e.target.value})}
                                />
                                <button onClick={() => handleAddSubcategory(cat.id)} className="bg-army-gold text-white px-3 py-1 rounded-md text-[10px] font-black hover:bg-yellow-600 transition-colors">Add</button>
                            </div>
                        </div>
                        </div>
                    ))}
                    </div>
                </div>

                {/* Upload e Estatísticas */}
                <div className="space-y-8">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h3 className="text-sm font-black text-army-green uppercase tracking-widest mb-6 flex items-center gap-2">
                        <Upload size={18} /> Upload de Acervo
                    </h3>
                    <div className="space-y-4">
                        <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase">Categoria de Destino</label>
                        <select className="w-full p-2.5 bg-slate-50 border rounded-lg text-sm" value={uploadCatId} onChange={e => setUploadCatId(e.target.value)}>
                            <option value="">Selecione Categoria...</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        </div>
                        
                        <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase">Subcategoria (Opcional)</label>
                        <select className="w-full p-2.5 bg-slate-50 border rounded-lg text-sm" value={uploadSubId} onChange={e => setUploadSubId(e.target.value)} disabled={!uploadCatId}>
                            <option value="">(Raiz da Categoria)</option>
                            {subcategories.filter(s => s.category_id === uploadCatId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        </div>

                        <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase">Arquivos (PDF preferencialmente)</label>
                        <input type="file" multiple onChange={e => setUploadFiles(Array.from(e.target.files || []))} className="w-full text-xs p-2 bg-slate-50 border border-dashed border-slate-200 rounded-lg" />
                        </div>

                        {isUploading && (
                        <div className="space-y-2">
                            <div className="flex justify-between text-[10px] font-bold text-army-green">
                            <span>Processando arquivos...</span>
                            <span>{uploadProgress}%</span>
                            </div>
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div className="bg-army-green h-full transition-all duration-300" style={{width: `${uploadProgress}%`}}></div>
                            </div>
                        </div>
                        )}
                        
                        <button onClick={handleUpload} disabled={isUploading} className="w-full bg-army-green text-white py-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 hover:bg-green-900 transition-all disabled:opacity-50">
                        <Database size={18} /> {isUploading ? 'Realizando Upload...' : 'Iniciar Upload em Lote'}
                        </button>
                    </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Estatísticas do Banco de Dados</h3>
                    <div className="grid grid-cols-2 gap-4 text-center">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <span className="text-2xl font-black text-army-green">{documents.length}</span>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Arquivos Registrados</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <span className="text-2xl font-black text-army-gold">{formatSize(documents.reduce((a, b) => a + b.size, 0))}</span>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Armazenamento Total</p>
                        </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-100">
                        <button
                            onClick={handleClearCache}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-slate-500 bg-slate-50 hover:bg-red-50 hover:text-red-600 border border-slate-200 transition-all"
                            title="Remove o texto cacheado dos PDFs (use após substituir documentos)"
                        >
                            <Trash2 size={14} /> Limpar cache de PDFs
                        </button>
                        {cacheMsg && (
                            <p className="text-[10px] text-army-green font-bold text-center mt-2">{cacheMsg}</p>
                        )}
                    </div>
                    </div>
                </div>
            </div>

            {/* SEÇÃO DE GERENCIAMENTO DE ARQUIVOS */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/50">
                    <div className="flex flex-col">
                        <h3 className="text-sm font-black text-army-green uppercase tracking-widest flex items-center gap-2">
                            <Files size={18} /> Gerenciamento de Acervo Digital
                        </h3>
                        <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[10px] font-black text-army-gold bg-army-green px-2 py-0.5 rounded-full uppercase tracking-widest">
                                Pasta: Todo o Acervo
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase">
                                ({filteredDocuments.length} resultados)
                            </span>
                        </div>
                    </div>
                    <div className="relative w-full md:w-80">
                        <input 
                            type="text"
                            placeholder="Buscar no acervo..."
                            className="w-full bg-white border border-slate-200 py-3 pl-10 pr-4 rounded-xl text-xs outline-none focus:ring-4 focus:ring-army-green/5 focus:border-army-green transition-all"
                            value={docSearch}
                            onChange={e => setDocSearch(e.target.value)}
                        />
                        <Search className="absolute left-3.5 top-3.5 text-slate-400" size={16} />
                    </div>
                </div>
                
                <div className="overflow-x-auto custom-scrollbar max-h-[600px]">
                    <table className="w-full text-left border-collapse table-fixed">
                        <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 sticky top-0 z-10">
                            <tr>
                                <th className="px-6 py-4 w-1/3">Arquivo</th>
                                <th className="px-6 py-4 w-1/4">Localização</th>
                                <th className="px-6 py-4 w-32">Tamanho</th>
                                <th className="px-6 py-4 w-32">Data Upload</th>
                                <th className="px-6 py-4 w-24 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredDocuments.length > 0 ? filteredDocuments.map(doc => {
                                const cat = categories.find(c => c.id === doc.category_id);
                                const sub = subcategories.find(s => s.id === doc.subcategory_id);
                                return (
                                    <tr key={doc.id} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="p-2 bg-slate-100 text-slate-400 rounded-lg group-hover:bg-army-green group-hover:text-white transition-colors flex-shrink-0">
                                                    <FileText size={16} />
                                                </div>
                                                <span className="text-xs font-bold text-slate-800 truncate" title={doc.name}>{doc.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-[10px] font-black text-army-green uppercase truncate">{cat?.name || '-'}</span>
                                                <span className="text-[9px] font-bold text-slate-400 uppercase italic truncate">{sub?.name || 'Diretório Raiz'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-[11px] font-mono text-slate-500">{formatSize(doc.size)}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-[11px] text-slate-500">
                                                <Clock size={12} />
                                                {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button 
                                                onClick={() => handleDeleteDocument(doc)}
                                                className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                title="Excluir Arquivo Permanentemente"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center text-slate-400 italic text-sm">
                                        <div className="flex flex-col items-center gap-3">
                                            <Database size={48} className="opacity-10" />
                                            <p>Nenhum documento encontrado.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      </main>
    </div>
  );
};

export default AndrecitoAdmin;
