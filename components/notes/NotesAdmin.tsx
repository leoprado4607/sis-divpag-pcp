import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Plus, Trash2, LayoutGrid, FileEdit, Folder, FileText, Edit2, Menu, X, ShieldCheck, LogOut, Settings } from 'lucide-react';
import { notesService } from '../../services/notesService';
import { GeneralSubject, SpecificSubject, Note } from '../../types';

interface NotesAdminProps {
  onBack: () => void;
  isAuthenticated: boolean;
}

const NotesAdmin: React.FC<NotesAdminProps> = ({ onBack, isAuthenticated }) => {
  const [activeTab, setActiveTab] = useState<'editor' | 'subjects'>('editor');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  
  // Data State
  const [generals, setGenerals] = useState<GeneralSubject[]>([]);
  const [specifics, setSpecifics] = useState<SpecificSubject[]>([]);
  
  // Editor State
  const [selGenId, setSelGenId] = useState('');
  const [selSpecId, setSelSpecId] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [closingText, setClosingText] = useState('');
  const [saving, setSaving] = useState(false);

  // Subject Management State
  const [configGenId, setConfigGenId] = useState(''); // Selected General ID in "Subjects" tab
  const [configSpecifics, setConfigSpecifics] = useState<SpecificSubject[]>([]); // Specifics list for the management tab

  useEffect(() => {
    if (!isAuthenticated) onBack();
    refreshGenerals();
  }, [isAuthenticated]);

  const refreshGenerals = () => {
    notesService.getGeneralSubjects().then(setGenerals);
  };

  const refreshSpecifics = (genId: string, forTab: 'editor' | 'subjects') => {
    notesService.getSpecificSubjects(genId).then(data => {
      if (forTab === 'editor') setSpecifics(data);
      else setConfigSpecifics(data);
    });
  };

  // Editor Logic
  useEffect(() => {
    if (selGenId) refreshSpecifics(selGenId, 'editor');
    else setSpecifics([]);
  }, [selGenId]);

  useEffect(() => {
    if (selGenId && selSpecId) {
      notesService.getNote(selGenId, selSpecId).then(note => {
        if (note) {
          setEditorContent(note.main_text);
          setClosingText(note.closing_text);
        } else {
          setEditorContent('<p>Inicie o texto principal aqui...</p>');
          // Texto de fechamento inicia vazio e sem alinhamento forçado (padrão esquerda)
          setClosingText('');
        }
      });
    }
  }, [selSpecId]);

  // Management Logic
  useEffect(() => {
    if (configGenId) refreshSpecifics(configGenId, 'subjects');
    else setConfigSpecifics([]);
  }, [configGenId]);

  const handleSave = async () => {
    if (!selGenId || !selSpecId) return;
    setSaving(true);
    await notesService.saveNote({
      general_subject_id: selGenId,
      specific_subject_id: selSpecId,
      main_text: editorContent,
      closing_text: closingText,
      last_edited: new Date().toISOString()
    });
    setSaving(false);
    alert('Nota salva com sucesso!');
  };

  // --- CRUD Handlers ---

  const handleAddGeneral = async () => {
    const name = window.prompt('Nome do novo Assunto Geral:');
    if (name) {
      await notesService.addGeneralSubject(name);
      refreshGenerals();
    }
  };

  const handleEditGeneral = async (id: string, currentName: string) => {
    const name = window.prompt('Editar nome do Assunto Geral:', currentName);
    if (name && name !== currentName) {
      await notesService.updateGeneralSubject(id, name);
      refreshGenerals();
    }
  };

  const handleDeleteGeneral = async (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir este Assunto Geral?')) {
      const result = await notesService.deleteGeneralSubject(id);
      if (result.success) {
        refreshGenerals();
        if (configGenId === id) setConfigGenId('');
      } else {
        alert(result.message);
      }
    }
  };

  const handleAddSpecific = async () => {
    if (!configGenId) return;
    const name = window.prompt('Nome do novo Assunto Específico:');
    if (name) {
      await notesService.addSpecificSubject(configGenId, name);
      refreshSpecifics(configGenId, 'subjects');
    }
  };

  const handleEditSpecific = async (id: string, currentName: string) => {
    const name = window.prompt('Editar nome do Assunto Específico:', currentName);
    if (name && name !== currentName) {
      await notesService.updateSpecificSubject(id, name);
      refreshSpecifics(configGenId, 'subjects');
    }
  };

  const handleDeleteSpecific = async (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir este Assunto Específico?')) {
      await notesService.deleteSpecificSubject(id);
      refreshSpecifics(configGenId, 'subjects');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans overflow-hidden">
      
      {/* HEADER INSTITUCIONAL (PADRÃO NOTES PUBLIC) */}
      <header className="bg-army-green text-white shadow-xl border-b-[6px] border-army-gold sticky top-0 z-50">
        <div className="absolute inset-0 opacity-10 pointer-events-none" 
             style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}>
        </div>
        
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-4 relative z-10">
          {/* Lado Esquerdo */}
          <div className="flex items-center gap-4 w-full md:w-auto">
            <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors flex-shrink-0" title="Sair do Admin">
              <ArrowLeft className="w-6 h-6 text-army-gold" />
            </button>
            <div className="flex items-center gap-3 overflow-hidden">
               <ShieldCheck className="w-10 h-10 text-white opacity-90" />
               <div className="text-left min-w-0">
                 <h1 className="text-lg md:text-xl font-montserrat font-bold leading-none tracking-tight truncate">Repositório de Notas</h1>
                 <p className="text-army-gold text-[10px] md:text-xs font-bold tracking-widest uppercase mt-1 truncate">Módulo Administrativo</p>
               </div>
            </div>
          </div>
          
          {/* Lado Direito */}
          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
             <button 
               className="md:hidden p-2 bg-white/10 hover:bg-white/20 rounded-lg flex items-center gap-2 border border-white/10 transition-colors mr-auto md:mr-0"
               onClick={() => setShowMobileMenu(!showMobileMenu)}
             >
               {showMobileMenu ? <X size={18} /> : <Menu size={18} />}
               <span className="text-xs font-bold">Menu</span>
             </button>

             <div className="text-right hidden md:block border-l border-white/20 pl-4 ml-2">
                <span className="text-[10px] text-gray-300 block uppercase font-medium">Usuário</span>
                <span className="text-xs font-bold text-white">Administrador</span>
             </div>

             <button onClick={onBack} className="p-2 text-red-300 hover:text-white hover:bg-red-900/30 rounded-lg ml-2" title="Sair">
                <LogOut size={18} />
             </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        
        {/* SIDEBAR NAVIGATION (Estilo NotesPublic) */}
        <aside className={`
            absolute md:relative z-40 w-full md:w-72 bg-white border-r border-gray-200 flex flex-col h-full transition-transform duration-300 shadow-lg md:shadow-none
            ${showMobileMenu ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
          <div className="p-6 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-xs font-bold text-army-green uppercase tracking-wider mb-4 flex items-center gap-2">
               <Settings size={14} /> Painel de Controle
            </h2>
            
            <nav className="space-y-2">
              <button 
                onClick={() => { setActiveTab('editor'); setShowMobileMenu(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-sm font-bold border ${activeTab === 'editor' ? 'bg-army-green text-white border-army-green shadow-md' : 'text-slate-500 bg-white border-transparent hover:bg-slate-50 hover:text-army-green'}`}
              >
                <FileEdit size={18} className={activeTab === 'editor' ? 'text-army-gold' : 'text-slate-400'} /> 
                Editor de Notas
              </button>
              <button 
                onClick={() => { setActiveTab('subjects'); setShowMobileMenu(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-sm font-bold border ${activeTab === 'subjects' ? 'bg-army-green text-white border-army-green shadow-md' : 'text-slate-500 bg-white border-transparent hover:bg-slate-50 hover:text-army-green'}`}
              >
                <LayoutGrid size={18} className={activeTab === 'subjects' ? 'text-army-gold' : 'text-slate-400'} /> 
                Gerenciar Assuntos
              </button>
            </nav>
          </div>

          <div className="p-6 bg-white flex-1 mt-auto">
             <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
               <h3 className="text-amber-800 font-bold text-sm mb-1">Atenção</h3>
               <p className="text-amber-600 text-xs">As alterações realizadas aqui refletem imediatamente na Consulta Pública.</p>
             </div>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 overflow-hidden flex flex-col bg-gray-50">
          
          {activeTab === 'editor' && (
            <div className="flex-1 flex flex-col h-full animate-fade-in">
              {/* Toolbar do Editor */}
              <div className="bg-white border-b border-gray-200 p-4 shadow-sm z-10">
                <div className="max-w-5xl mx-auto flex flex-col md:flex-row gap-4 items-center">
                    <div className="flex flex-col md:flex-row gap-3 flex-1 w-full">
                        <select 
                        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm font-medium rounded-lg block w-full md:w-1/2 p-2.5 focus:ring-army-green focus:border-army-green"
                        value={selGenId}
                        onChange={(e) => setSelGenId(e.target.value)}
                        >
                        <option value="">Selecione Assunto Geral...</option>
                        {generals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                        <select 
                        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm font-medium rounded-lg block w-full md:w-1/2 p-2.5 focus:ring-army-green focus:border-army-green"
                        value={selSpecId}
                        onChange={(e) => setSelSpecId(e.target.value)}
                        disabled={!selGenId}
                        >
                        <option value="">Selecione Assunto Específico...</option>
                        {specifics.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    
                    <button 
                        onClick={handleSave}
                        disabled={!selSpecId || saving}
                        className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-6 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all transform hover:-translate-y-0.5"
                    >
                        <Save size={18} /> {saving ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                </div>
              </div>

              {/* Área de Edição */}
              <div className="flex-1 overflow-auto p-4 md:p-8 bg-gray-100 flex justify-center">
                {selSpecId ? (
                  <div className="w-full max-w-4xl bg-white shadow-lg p-6 md:p-12 min-h-[900px] flex flex-col gap-6 animate-fade-in-up">
                    <div className="p-3 bg-blue-50 border border-blue-100 text-blue-800 text-xs rounded-lg flex items-center gap-2">
                      <FileEdit size={14} />
                      <span><strong>Editor Rich Text:</strong> Você pode colar tabelas e textos formatados do Word diretamente nos campos abaixo.</span>
                    </div>
                    
                    {/* MAIN TEXT EDITOR */}
                    <div className="flex-1 flex flex-col">
                      <label className="text-xs text-gray-400 block mb-2 uppercase tracking-wider font-bold">Texto Principal</label>
                      <div 
                        className="flex-1 outline-none prose max-w-none border border-dashed border-gray-300 rounded-lg p-6 focus:border-army-green focus:bg-gray-50/30 transition-colors overflow-auto hover:border-gray-400"
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) => setEditorContent(e.currentTarget.innerHTML)}
                        dangerouslySetInnerHTML={{ __html: editorContent }}
                        style={{ minHeight: '400px' }}
                      />
                    </div>

                    {/* CLOSING TEXT EDITOR (RICH TEXT) */}
                    <div className="h-64 flex flex-col border-t border-gray-100 pt-8 mt-4">
                      <label className="text-xs text-gray-400 block mb-2 uppercase tracking-wider font-bold">Texto de Fechamento / Assinatura</label>
                      <div 
                        className="flex-1 outline-none prose max-w-none border border-dashed border-gray-300 rounded-lg p-6 focus:border-army-green focus:bg-gray-50/30 transition-colors overflow-auto hover:border-gray-400"
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) => setClosingText(e.currentTarget.innerHTML)}
                        dangerouslySetInnerHTML={{ __html: closingText }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center text-gray-400 flex-col gap-4 text-center h-full opacity-60">
                    <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mb-2">
                        <FileEdit size={48} className="text-gray-400" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-500">Área de Edição</h3>
                    <p className="max-w-sm">Selecione uma categoria e um assunto específico na barra superior para carregar e editar o documento.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'subjects' && (
            <div className="flex-1 p-4 md:p-8 flex flex-col md:flex-row gap-4 md:gap-8 animate-fade-in overflow-hidden h-full">
              
              {/* Left Column: General Subjects */}
              <div className="w-full md:w-1/3 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-1/2 md:h-full overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm md:text-base">
                    <Folder size={18} className="text-army-gold" /> Assunto Geral
                  </h3>
                  <button 
                    onClick={handleAddGeneral}
                    className="p-1.5 bg-army-green hover:bg-green-900 text-white rounded-lg transition-colors shadow-sm" title="Novo Assunto Geral"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                  {generals.map(gen => (
                    <div 
                      key={gen.id}
                      onClick={() => setConfigGenId(gen.id)}
                      className={`
                        p-3 rounded-lg flex justify-between items-center cursor-pointer transition-all border
                        ${configGenId === gen.id 
                          ? 'bg-green-50 border-green-200 shadow-sm' 
                          : 'bg-white border-transparent hover:bg-gray-50 hover:border-gray-200'}
                      `}
                    >
                      <span className={`font-medium text-sm ${configGenId === gen.id ? 'text-army-green' : 'text-gray-600'}`}>
                        {gen.name}
                      </span>
                      <div className="flex gap-1">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleEditGeneral(gen.id, gen.name); }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDeleteGeneral(gen.id); }}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Specific Subjects */}
              <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col relative h-1/2 md:h-full overflow-hidden">
                 {!configGenId && (
                   <div className="absolute inset-0 bg-gray-50/80 backdrop-blur-[1px] z-10 flex flex-col gap-3 items-center justify-center text-gray-400 text-sm text-center p-4">
                      <Folder size={32} className="opacity-30" />
                      <p>Selecione um Assunto Geral ao lado<br/>para gerenciar seus itens.</p>
                   </div>
                 )}

                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm md:text-base">
                    <FileText size={18} className="text-army-gold" /> 
                    <span className="hidden md:inline">Assunto Específico</span>
                    <span className="md:hidden">Específicos</span>
                    {configGenId && <span className="text-army-green font-normal text-xs ml-2 hidden md:inline bg-green-50 px-2 py-0.5 rounded-full border border-green-100">({generals.find(g => g.id === configGenId)?.name})</span>}
                  </h3>
                  <button 
                    onClick={handleAddSpecific}
                    disabled={!configGenId}
                    className="p-1.5 bg-army-green hover:bg-green-900 text-white rounded-lg transition-colors disabled:opacity-50 shadow-sm" title="Novo Assunto Específico"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                  {configSpecifics.length === 0 && configGenId && (
                      <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-sm gap-2">
                          <FileText size={24} className="opacity-20" />
                          <p>Nenhum assunto específico cadastrado.</p>
                      </div>
                  )}
                  {configSpecifics.map(spec => (
                    <div key={spec.id} className="p-3 bg-white border border-gray-100 rounded-lg flex justify-between items-center hover:shadow-sm transition-all hover:border-gray-300">
                      <span className="text-sm text-gray-700 font-medium">{spec.name}</span>
                      <div className="flex gap-1">
                        <button 
                          onClick={() => handleEditSpecific(spec.id, spec.name)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={() => handleDeleteSpecific(spec.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default NotesAdmin;