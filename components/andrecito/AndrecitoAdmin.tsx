
import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft, Bot, Search, Library, Settings, LogOut,
  FolderPlus, Upload, Trash2, FileText, Database, Files, Trash, Clock, ChevronRight, Folder,
  BarChart2, Users, Activity, Zap, RefreshCw, MessageSquare, MapPin, Globe,
  Hash, Award, Calendar, TrendingUp
} from 'lucide-react';
import { andrecitoService } from '../../services/andrecitoService';
import AndrecitoHeader from './AndrecitoHeader';
import { adminRequest } from '../../services/adminClient';
import { AndrecitoCategory, AndrecitoSubcategory, AndrecitoDocument } from '../../types';
import { ViewState, UserRole } from './AndrecitoApp';

// Converte código de país ISO (ex: "BR") no nome em português, com fallback ao código.
const COUNTRY_NAMES: Record<string, string> = {
  BR: 'Brasil', US: 'Estados Unidos', PT: 'Portugal', AR: 'Argentina',
  PY: 'Paraguai', UY: 'Uruguai', CL: 'Chile', BO: 'Bolívia', CO: 'Colômbia',
  ES: 'Espanha', FR: 'França', DE: 'Alemanha', GB: 'Reino Unido', IT: 'Itália',
};
const countryLabel = (code?: string | null) =>
  code ? (COUNTRY_NAMES[code.toUpperCase()] || code.toUpperCase()) : null;

interface AnalyticsData {
  totalQueries: number;
  last30Days: number;
  uniqueIps30Days: number;
  avgTokens: number;
  dailyUsage: { date: string; count: number }[];
  recentQueries: {
    query_text: string;
    user_type: string;
    tokens_estimated: number;
    documents_used: string[];
    created_at: string;
    ip_address?: string | null;
    country?: string | null;
    region?: string | null;
    city?: string | null;
  }[];
}

const PT_STOPWORDS = new Set([
  'de','da','do','das','dos','a','o','as','os','e','em','que','por','para','com',
  'se','na','no','nas','nos','um','uma','ao','aos','como','ou','mais','mas','não',
  'é','foi','ser','tem','ter','seu','sua','seus','suas','este','esta','esse','essa',
  'qual','quais','quando','onde','quem','há','até','já','sobre','entre','após','desde',
  'me','meu','minha','nós','ele','ela','eles','elas','isso',
  'quanto','quantos','porque','sem','uns','umas','nao',
]);

function topKeywords(queries: { query_text: string }[], n = 10): { word: string; count: number }[] {
  const freq: Record<string, number> = {};
  queries.forEach(({ query_text }) => {
    query_text
      .toLowerCase()
      .replace(/[^a-záéíóúãõâêôàüç\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !PT_STOPWORDS.has(w))
      .forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  });
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([word, count]) => ({ word, count }));
}

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
  const [adminTab, setAdminTab] = useState<'manage' | 'analytics'>('manage');
  const [categories, setCategories] = useState<AndrecitoCategory[]>([]);
  const [subcategories, setSubcategories] = useState<AndrecitoSubcategory[]>([]);
  const [documents, setDocuments] = useState<AndrecitoDocument[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState('');

  const fetchAnalytics = async () => {
    setAnalyticsLoading(true);
    setAnalyticsError('');
    try {
      const data = await adminRequest<AnalyticsData>('getAnalytics');
      setAnalytics(data);
    } catch (e: any) {
      setAnalyticsError(e?.message || 'Erro ao carregar estatísticas.');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    if (adminTab === 'analytics' && !analytics) fetchAnalytics();
  }, [adminTab]);

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

  // Texto indexado no Supabase (id → 'pdfjs' | 'gemini'); ausente = pendente.
  const [textStatus, setTextStatus] = useState<Map<string, string>>(new Map());
  const [textStatusError, setTextStatusError] = useState('');
  const [indexingIds, setIndexingIds] = useState<Set<string>>(new Set());
  const [bulkIndex, setBulkIndex] = useState<{ done: number; total: number } | null>(null);

  const fetchTextStatus = async () => {
    try {
      setTextStatus(await andrecitoService.getTextIndexStatus());
      setTextStatusError('');
    } catch (e: any) {
      setTextStatusError(e?.message || 'Falha ao ler o status do texto indexado.');
    }
  };

  const indexOne = async (doc: AndrecitoDocument): Promise<string | null> => {
    setIndexingIds(prev => new Set(prev).add(doc.id));
    try {
      const source = await andrecitoService.indexDocumentText(doc);
      setTextStatus(prev => new Map(prev).set(doc.id, source));
      return null;
    } catch (err: any) {
      return `${doc.name}: ${err?.message || 'erro desconhecido'}`;
    } finally {
      setIndexingIds(prev => { const s = new Set(prev); s.delete(doc.id); return s; });
    }
  };

  const handleIndexDocument = async (doc: AndrecitoDocument) => {
    const error = await indexOne(doc);
    if (error) alert(`Falha ao indexar:\n${error}`);
  };

  const pendingPdfs = documents.filter(d => d.mime_type === 'application/pdf' && !textStatus.has(d.id));

  // Um por vez: a transcrição de um PDF digitalizado pode levar mais de um minuto.
  const handleIndexPending = async () => {
    const queue = pendingPdfs;
    if (queue.length === 0) return;
    if (!confirm(`Indexar o texto de ${queue.length} documento(s)? PDFs digitalizados são transcritos pela IA e podem levar cerca de 1 minuto cada.`)) return;
    const errors: string[] = [];
    setBulkIndex({ done: 0, total: queue.length });
    for (let i = 0; i < queue.length; i++) {
      const error = await indexOne(queue[i]);
      if (error) errors.push(error);
      setBulkIndex({ done: i + 1, total: queue.length });
    }
    setBulkIndex(null);
    alert(errors.length
      ? `Indexação concluída com ${errors.length} falha(s):\n${errors.join('\n')}`
      : `Todos os ${queue.length} documento(s) foram indexados.`);
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
      await fetchTextStatus();
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
    <div className="flex flex-col h-screen bg-army-cream font-sans overflow-hidden">
      <AndrecitoHeader onBack={onBack} onLogout={onLogout} onNavigate={onNavigate} currentView={currentView} userRole="admin" />

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-10 custom-scrollbar bg-army-cream">
        {/* Abas internas do Admin */}
        <div className="max-w-7xl mx-auto mb-6">
          <div className="flex gap-2 bg-white p-1 border border-army-green/10 w-fit">
            <button
              onClick={() => setAdminTab('manage')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold transition-all ${adminTab === 'manage' ? 'bg-army-green text-white' : 'text-army-green/75 hover:text-army-green'}`}
            >
              <Settings size={14} /> Gerenciar
            </button>
            <button
              onClick={() => setAdminTab('analytics')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold transition-all ${adminTab === 'analytics' ? 'bg-army-green text-white' : 'text-army-green/75 hover:text-army-green'}`}
            >
              <BarChart2 size={14} /> Estatísticas
            </button>
          </div>
        </div>

        {adminTab === 'analytics' && (
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header da aba */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-cormorant font-semibold text-xl text-army-green">Painel de Uso — Andrecito</h2>
                <p className="text-[11px] text-army-green/75 mt-0.5">Consultas registradas nos últimos 30 dias</p>
              </div>
              <button
                onClick={fetchAnalytics}
                disabled={analyticsLoading}
                className="flex items-center gap-2 text-xs font-bold text-army-green/75 hover:text-army-green px-3 py-2 bg-white border border-army-green/10 transition-all disabled:opacity-50"
              >
                <RefreshCw size={13} className={analyticsLoading ? 'animate-spin' : ''} /> Atualizar
              </button>
            </div>

            {analyticsError && (
              <div className="bg-red-50 border border-red-200 p-4 text-sm text-red-700">{analyticsError}</div>
            )}

            {analyticsLoading && !analytics && (
              <div className="flex items-center justify-center py-20 text-army-green/75 text-sm gap-3">
                <RefreshCw size={20} className="animate-spin" /> Carregando estatísticas...
              </div>
            )}

            {analytics && (
              <>
                {/* Cards de resumo */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Total de Consultas', value: analytics.totalQueries, icon: <MessageSquare size={18} />, color: 'text-army-green' },
                    { label: 'Últimos 30 dias', value: analytics.last30Days, icon: <Activity size={18} />, color: 'text-blue-700' },
                    { label: 'Usuários únicos (30d)', value: analytics.uniqueIps30Days, icon: <Users size={18} />, color: 'text-purple-700' },
                    { label: 'Tokens médios/consulta', value: analytics.avgTokens.toLocaleString('pt-BR'), icon: <Zap size={18} />, color: 'text-army-gold' },
                  ].map(card => (
                    <div key={card.label} className="bg-white border border-army-green/10 p-5">
                      <div className={`${card.color} mb-2`}>{card.icon}</div>
                      <div className={`text-2xl font-semibold ${card.color}`}>{card.value}</div>
                      <p className="text-[11px] text-army-green/75 font-bold uppercase tracking-wider mt-1">{card.label}</p>
                    </div>
                  ))}
                </div>

                {/* Termos mais pesquisados — ranking */}
                <div className="relative bg-white border border-army-green/10 overflow-hidden">
                  <div className="h-1 w-full bg-gradient-to-r from-army-green via-army-light to-army-gold" />
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-army-green/10 text-army-green"><Hash size={16} /></div>
                        <div>
                          <h3 className="font-cormorant font-semibold text-xl text-army-green leading-tight">Termos Mais Pesquisados</h3>
                          <p className="text-[11px] text-army-green/75 mt-0.5">Frequência nas consultas dos últimos 30 dias</p>
                        </div>
                      </div>
                      <TrendingUp size={18} className="text-army-gold" />
                    </div>
                    {analytics.recentQueries.length === 0 ? (
                      <p className="text-center text-army-green/75 text-sm py-6">Sem dados.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-4">
                        {(() => {
                          const kws = topKeywords(analytics.recentQueries);
                          const maxCount = kws[0]?.count || 1;
                          return kws.map(({ word, count }, i) => {
                            const isTop = i === 0;
                            const isPodium = i < 3;
                            return (
                              <div
                                key={word}
                                className="group flex items-center gap-3 animate-fade-in-up opacity-0"
                                style={{ animationDelay: `${i * 60}ms` }}
                              >
                                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold tabular-nums font-sans
                                  ${isTop ? 'bg-army-gold-light text-army-charcoal ring-2 ring-army-gold/30'
                                    : isPodium ? 'bg-army-green text-white'
                                    : 'bg-army-cream text-army-green/75 border border-army-green/10'}`}>
                                  {isTop ? <Award size={14} /> : i + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex justify-between items-baseline mb-1.5">
                                    <span className="text-sm font-bold text-army-charcoal/80 capitalize truncate group-hover:text-army-green transition-colors">{word}</span>
                                    <span className="flex items-baseline gap-1 flex-shrink-0 ml-2">
                                      <span className={`text-sm font-semibold tabular-nums ${isPodium ? 'text-army-green' : 'text-army-green/75'}`}>{count}</span>
                                      <span className="text-[11px] text-army-green/75 font-bold uppercase">buscas</span>
                                    </span>
                                  </div>
                                  <div className="w-full bg-army-cream h-2 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full origin-left animate-grow-bar bg-gradient-to-r ${isPodium ? 'from-army-green to-army-gold' : 'from-army-light to-army-gold-light'}`}
                                      style={{
                                        width: `${(count / maxCount) * 100}%`,
                                        animationDelay: `${i * 60}ms`,
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Consultas recentes — tabela */}
                <div className="bg-white border border-army-green/10 overflow-hidden">
                  <div className="px-6 py-5 border-b border-army-green/10 flex items-center gap-2.5 bg-army-cream/50">
                    <div className="p-2 bg-army-green/10 text-army-green"><MessageSquare size={16} /></div>
                    <div>
                      <h3 className="font-cormorant font-semibold text-xl text-army-green leading-tight">Consultas Recentes</h3>
                      <p className="text-[11px] text-army-green/75 mt-0.5">{analytics.recentQueries.length} registros mais recentes</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto custom-scrollbar max-h-[480px]">
                    {analytics.recentQueries.length === 0 ? (
                      <p className="text-center text-army-green/75 text-sm py-16">Nenhuma consulta registrada ainda.</p>
                    ) : (
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-army-cream text-[11px] font-semibold text-army-green/75 uppercase tracking-widest border-b border-army-green/10 sticky top-0 z-10">
                          <tr>
                            <th className="px-4 py-3 whitespace-nowrap">Data</th>
                            <th className="px-4 py-3 whitespace-nowrap">Horário</th>
                            <th className="px-4 py-3 whitespace-nowrap">IP</th>
                            <th className="px-4 py-3 whitespace-nowrap">Local</th>
                            <th className="px-4 py-3 whitespace-nowrap text-right">Tokens</th>
                            <th className="px-4 py-3 w-2/5">Pergunta</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-army-green/[0.07]">
                          {analytics.recentQueries.map((q, i) => {
                            const d = new Date(q.created_at);
                            const local = [q.city, q.region, countryLabel(q.country)].filter(Boolean).join(' / ');
                            return (
                              <tr key={i} className="hover:bg-army-cream/40 transition-colors">
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-army-charcoal/80">
                                    <Calendar size={11} className="text-army-green/75" />
                                    {d.toLocaleDateString('pt-BR')}
                                  </span>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className="flex items-center gap-1.5 text-[11px] font-mono text-army-green/75">
                                    <Clock size={11} className="text-army-green/75" />
                                    {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {q.ip_address ? (
                                    <span className="flex items-center gap-1.5 text-[11px] font-mono text-army-green/75">
                                      <Globe size={11} className="text-army-green/75" />{q.ip_address}
                                    </span>
                                  ) : <span className="text-[11px] text-army-green/75">—</span>}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {local ? (
                                    <span className="flex items-center gap-1.5 text-[11px] text-army-charcoal/80">
                                      <MapPin size={11} className="text-army-gold" />{local}
                                    </span>
                                  ) : <span className="text-[11px] text-army-green/75">—</span>}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-right">
                                  {q.tokens_estimated > 0 ? (
                                    <span className="inline-block text-[11px] font-mono font-bold text-army-green bg-army-green/5 border border-army-green/10 px-2 py-0.5">
                                      {q.tokens_estimated.toLocaleString('pt-BR')}
                                    </span>
                                  ) : <span className="text-[11px] text-army-green/75">—</span>}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-start gap-2">
                                    <span className={`flex-shrink-0 mt-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full border uppercase ${q.user_type === 'admin' ? 'bg-army-green/10 text-army-green border-army-green/20' : 'bg-army-cream text-army-green/75 border-army-green/10'}`}>
                                      {q.user_type}
                                    </span>
                                    <span className="text-xs text-army-charcoal/80 leading-snug line-clamp-2" title={q.query_text}>{q.query_text}</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {adminTab === 'manage' && (
        <div className="max-w-7xl mx-auto space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Gestão de Estrutura */}
                <div className="bg-white p-6 border border-army-green/10">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-cormorant font-semibold text-xl text-army-green flex items-center gap-2">
                        <FolderPlus size={18} /> Estrutura de Pastas
                        </h3>
                    </div>
                    
                    <div className="flex gap-2 mb-8">
                    <input 
                        className="flex-1 bg-army-cream border border-army-green/10 p-2.5 text-sm"
                        placeholder="Nova Categoria (ex: Portarias)"
                        aria-label="Nome da nova categoria"
                        value={newCatName}
                        onChange={e => setNewCatName(e.target.value)}
                    />
                    <button onClick={handleAddCategory} className="bg-army-green text-white px-4 font-bold text-xs">Criar</button>
                    </div>
                    <div className="space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                    {categories.map(cat => (
                        <div 
                            key={cat.id} 
                            className="border transition-all p-4 bg-army-cream border-army-green/10 hover:border-army-green/25"
                        >
                        <div className="flex justify-between items-center mb-4">
                            <div className="flex items-center gap-2">
                                <Folder size={16} className="text-army-green/75" />
                                <span className="font-bold text-sm uppercase text-army-charcoal/80">{cat.name}</span>
                                <span className="bg-army-green/10 text-army-green text-[11px] font-semibold px-1.5 py-0.5 rounded-full border border-army-green/20">
                                    {getDocCountForCat(cat.id)}
                                </span>
                            </div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id); }} 
                                className="text-army-green/75 hover:text-red-700 transition-colors" 
                                title="Excluir Categoria"
                                aria-label={`Excluir categoria ${cat.name}`}
                            >
                                <Trash2 size={16}/>
                            </button>
                        </div>
                        <div className="pl-4 space-y-2">
                            {subcategories.filter(s => s.category_id === cat.id).map(sub => (
                            <div 
                                key={sub.id} 
                                className="flex justify-between items-center p-2 border text-xs bg-white border-army-green/10 text-army-charcoal/80 hover:border-army-gold"
                            >
                                <div className="flex items-center gap-2">
                                    <ChevronRight size={12} className="text-army-green/75" />
                                    <span className="font-medium">{sub.name}</span>
                                    <span className="text-[11px] font-bold text-army-green/75">({getDocCountForSub(sub.id)})</span>
                                </div>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleDeleteSubcategory(sub.id); }} 
                                    className="text-army-green/75 hover:text-red-700 transition-colors"
                                    title="Excluir Subcategoria"
                                    aria-label={`Excluir subcategoria ${sub.name}`}
                                >
                                    <Trash size={14}/>
                                </button>
                            </div>
                            ))}
                            <div className="flex gap-2 pt-2">
                                <input 
                                    className="flex-1 text-[11px] p-2 border outline-none focus:border-army-green"
                                    placeholder="Nova Subcategoria..."
                                    aria-label={`Nova subcategoria em ${cat.name}`}
                                    value={newSubNames[cat.id] || ''}
                                    onChange={e => setNewSubNames({...newSubNames, [cat.id]: e.target.value})}
                                />
                                <button onClick={() => handleAddSubcategory(cat.id)} className="bg-army-gold text-white px-3 py-1 text-[11px] font-semibold hover:bg-army-gold-deep transition-colors">Add</button>
                            </div>
                        </div>
                        </div>
                    ))}
                    </div>
                </div>

                {/* Upload e Estatísticas */}
                <div className="space-y-8">
                    <div className="bg-white p-6 border border-army-green/10">
                    <h3 className="font-cormorant font-semibold text-xl text-army-green mb-6 flex items-center gap-2">
                        <Upload size={18} /> Upload de Acervo
                    </h3>
                    <div className="space-y-4">
                        <div className="space-y-1">
                        <label htmlFor="up-cat" className="text-[11px] font-semibold text-army-green/75 uppercase">Categoria de Destino</label>
                        <select id="up-cat" className="w-full p-2.5 bg-army-cream border text-sm" value={uploadCatId} onChange={e => setUploadCatId(e.target.value)}>
                            <option value="">Selecione Categoria...</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        </div>
                        
                        <div className="space-y-1">
                        <label htmlFor="up-sub" className="text-[11px] font-semibold text-army-green/75 uppercase">Subcategoria (Opcional)</label>
                        <select id="up-sub" className="w-full p-2.5 bg-army-cream border text-sm" value={uploadSubId} onChange={e => setUploadSubId(e.target.value)} disabled={!uploadCatId}>
                            <option value="">(Raiz da Categoria)</option>
                            {subcategories.filter(s => s.category_id === uploadCatId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        </div>

                        <div className="space-y-1">
                        <label htmlFor="up-files" className="text-[11px] font-semibold text-army-green/75 uppercase">Arquivos (PDF preferencialmente)</label>
                        <input id="up-files" type="file" multiple onChange={e => setUploadFiles(Array.from(e.target.files || []))} className="w-full text-xs p-2 bg-army-cream border border-dashed border-army-green/10" />
                        </div>

                        {isUploading && (
                        <div className="space-y-2">
                            <div className="flex justify-between text-[11px] font-bold text-army-green">
                            <span>Processando arquivos...</span>
                            <span>{uploadProgress}%</span>
                            </div>
                            <div className="w-full bg-army-cream h-2 rounded-full overflow-hidden">
                            <div className="bg-army-green h-full transition-all duration-300" style={{width: `${uploadProgress}%`}}></div>
                            </div>
                        </div>
                        )}
                        
                        <button onClick={handleUpload} disabled={isUploading} className="w-full bg-army-green text-white py-4 font-bold flex items-center justify-center gap-2 hover:bg-army-mid transition-all disabled:opacity-50">
                        <Database size={18} /> {isUploading ? 'Realizando Upload...' : 'Iniciar Upload em Lote'}
                        </button>
                    </div>
                    </div>

                    <div className="bg-white p-6 border border-army-green/10">
                    <h3 className="text-[11px] font-semibold text-army-green/75 uppercase tracking-widest mb-4">Estatísticas do Banco de Dados</h3>
                    <div className="grid grid-cols-2 gap-4 text-center">
                        <div className="bg-army-cream p-4 border border-army-green/10">
                            <span className="text-2xl font-semibold text-army-green">{documents.length}</span>
                            <p className="text-[11px] text-army-green/75 font-bold uppercase tracking-tighter">Arquivos Registrados</p>
                        </div>
                        <div className="bg-army-cream p-4 border border-army-green/10">
                            <span className="text-2xl font-semibold text-army-gold">{formatSize(documents.reduce((a, b) => a + b.size, 0))}</span>
                            <p className="text-[11px] text-army-green/75 font-bold uppercase tracking-tighter">Armazenamento Total</p>
                        </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-army-green/10">
                        <button
                            onClick={handleClearCache}
                            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold text-army-green/75 bg-army-cream hover:bg-red-50 hover:text-red-700 border border-army-green/10 transition-all"
                            title="Remove o texto cacheado dos PDFs (use após substituir documentos)"
                        >
                            <Trash2 size={14} /> Limpar cache de PDFs
                        </button>
                        {cacheMsg && (
                            <p className="text-[11px] text-army-green font-bold text-center mt-2">{cacheMsg}</p>
                        )}
                    </div>
                    <div className="mt-4 pt-4 border-t border-army-green/10">
                        <p className="text-[11px] font-semibold text-army-green/75 uppercase tracking-widest mb-2">Texto para a IA</p>
                        {textStatusError ? (
                            <p className="text-[11px] text-red-700 font-bold">{textStatusError}</p>
                        ) : (
                            <>
                                <p className="text-[11px] text-army-green/75 mb-3">
                                    {pendingPdfs.length > 0
                                        ? `${pendingPdfs.length} PDF(s) sem texto indexado. Indexe para que entrem inteiros nas consultas.`
                                        : 'Todos os PDFs têm texto indexado.'}
                                </p>
                                <button
                                    onClick={handleIndexPending}
                                    disabled={!!bulkIndex || pendingPdfs.length === 0}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold text-white bg-army-green hover:bg-army-mid transition-all disabled:opacity-50"
                                >
                                    <RefreshCw size={14} className={bulkIndex ? 'animate-spin' : ''} />
                                    {bulkIndex ? `Indexando ${bulkIndex.done}/${bulkIndex.total}...` : `Indexar pendentes (${pendingPdfs.length})`}
                                </button>
                            </>
                        )}
                    </div>
                    </div>
                </div>
            </div>

            {/* SEÇÃO DE GERENCIAMENTO DE ARQUIVOS */}
            <div className="bg-white border border-army-green/10 overflow-hidden">
                <div className="p-6 border-b border-army-green/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-army-cream/50">
                    <div className="flex flex-col">
                        <h3 className="font-cormorant font-semibold text-xl text-army-green flex items-center gap-2">
                            <Files size={18} /> Gerenciamento de Acervo Digital
                        </h3>
                        <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[11px] font-semibold text-army-gold-light bg-army-green px-2 py-0.5 rounded-full uppercase tracking-widest">
                                Pasta: Todo o Acervo
                            </span>
                            <span className="text-[11px] font-bold text-army-green/75 uppercase">
                                ({filteredDocuments.length} resultados)
                            </span>
                        </div>
                    </div>
                    <div className="relative w-full md:w-80">
                        <input 
                            type="text"
                            placeholder="Buscar no acervo..."
                            aria-label="Buscar no acervo"
                            className="w-full bg-white border border-army-green/10 py-3 pl-10 pr-4 text-xs outline-none focus:border-army-green transition-all"
                            value={docSearch}
                            onChange={e => setDocSearch(e.target.value)}
                        />
                        <Search className="absolute left-3.5 top-3.5 text-army-green/75" size={16} />
                    </div>
                </div>
                
                <div className="overflow-x-auto custom-scrollbar max-h-[600px]">
                    <table className="w-full text-left border-collapse table-fixed">
                        <thead className="bg-army-cream text-[11px] font-semibold text-army-green/75 uppercase tracking-widest border-b border-army-green/10 sticky top-0 z-10">
                            <tr>
                                <th className="px-6 py-4 w-1/3">Arquivo</th>
                                <th className="px-6 py-4 w-1/4">Localização</th>
                                <th className="px-6 py-4 w-32">Tamanho</th>
                                <th className="px-6 py-4 w-32">Data Upload</th>
                                <th className="px-6 py-4 w-36">Texto</th>
                                <th className="px-6 py-4 w-28 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-army-green/[0.07]">
                            {filteredDocuments.length > 0 ? filteredDocuments.map(doc => {
                                const cat = categories.find(c => c.id === doc.category_id);
                                const sub = subcategories.find(s => s.id === doc.subcategory_id);
                                return (
                                    <tr key={doc.id} className="hover:bg-army-cream transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="p-2 bg-army-cream text-army-green/75 group-hover:bg-army-green group-hover:text-white transition-colors flex-shrink-0">
                                                    <FileText size={16} />
                                                </div>
                                                <span className="text-xs font-bold text-army-charcoal truncate" title={doc.name}>{doc.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-[11px] font-semibold text-army-green uppercase truncate">{cat?.name || '-'}</span>
                                                <span className="text-[11px] font-bold text-army-green/75 uppercase italic truncate">{sub?.name || 'Diretório Raiz'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-[11px] font-mono text-army-green/75">{formatSize(doc.size)}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-[11px] text-army-green/75">
                                                <Clock size={12} />
                                                {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {indexingIds.has(doc.id) ? (
                                                <span className="text-[11px] font-bold text-army-gold-deep uppercase">Indexando...</span>
                                            ) : textStatus.get(doc.id) === 'gemini' ? (
                                                <span className="text-[11px] font-bold text-army-green uppercase" title="PDF digitalizado, transcrito pela IA">Transcrito (IA)</span>
                                            ) : textStatus.has(doc.id) ? (
                                                <span className="text-[11px] font-bold text-army-green uppercase">Indexado</span>
                                            ) : doc.mime_type === 'application/pdf' ? (
                                                <span className="text-[11px] font-bold text-red-700 uppercase">Pendente</span>
                                            ) : (
                                                <span className="text-[11px] text-army-green/75">-</span>
                                            )}
                                        </td>
                                        <td className="px-2 py-4">
                                            <div className="flex items-center justify-center">
                                            {doc.mime_type === 'application/pdf' && (
                                                <button
                                                    onClick={() => handleIndexDocument(doc)}
                                                    disabled={indexingIds.has(doc.id) || !!bulkIndex}
                                                    className="p-2 text-army-green/75 hover:text-army-green hover:bg-army-cream transition-all disabled:opacity-40"
                                                    title={textStatus.has(doc.id) ? 'Reindexar o texto do documento' : 'Indexar o texto do documento'}
                                                    aria-label={`${textStatus.has(doc.id) ? 'Reindexar' : 'Indexar'} ${doc.name}`}
                                                >
                                                    <RefreshCw size={16} className={indexingIds.has(doc.id) ? 'animate-spin' : ''} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDeleteDocument(doc)}
                                                className="p-2 text-army-green/75 hover:text-red-700 hover:bg-red-50 transition-all"
                                                title="Excluir Arquivo Permanentemente"
                                                aria-label={`Excluir ${doc.name}`}
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={6}className="px-6 py-20 text-center text-army-green/75 italic text-sm">
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
        )}
      </main>
    </div>
  );
};

export default AndrecitoAdmin;
