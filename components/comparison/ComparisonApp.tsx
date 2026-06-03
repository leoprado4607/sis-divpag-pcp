
import React, { useState } from 'react';
import { 
  ArrowLeft, GitCompare, RefreshCw, AlertTriangle, 
  UserX, BadgeDollarSign, CheckCircle2,
  X, Trash2, Copy, Download,
  Shield, Award, Users, ChevronRight, Info, Heart, Search,
  ClipboardList, AlertCircle, Database, ShieldAlert, BadgeMinus
} from 'lucide-react';
import { PersonRecord, ComparisonResult } from '../../types';
import jsPDF from 'jspdf';

interface ComparisonAppProps {
  onBack: () => void;
}

const ComparisonApp: React.FC<ComparisonAppProps> = ({ onBack }) => {
  // Navigation State
  const [currentView, setCurrentView] = useState<'landing' | 'active' | 'veterans' | 'pensioners'>('landing');

  // Input States
  const [textT1, setTextT1] = useState('');
  const [textT2, setTextT2] = useState('');
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ComparisonResult | null>(null);

  // UI States
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [currentData, setCurrentData] = useState<any[]>([]);
  const [currentType, setCurrentType] = useState<'simple' | 'conflict'>('simple');

  const isVeterans = currentView === 'veterans';
  const isPensioners = currentView === 'pensioners';
  const isInactive = isVeterans || isPensioners;

  // Formatting helpers
  const sanitizeRank = (rank: string) => {
    if (!rank) return '';
    return rank.replace(/(\d)\?/g, '$1º');
  };

  const parseInput = (text: string, format: 'T1' | 'T2'): PersonRecord[] => {
    if (!text) return [];
    
    return text.split(/\n/).map((line, index): PersonRecord | null => {
      const cleanLine = line.trim().replace(/[\u200B-\u200D\uFEFF\xA0]/g, ' ');
      if (!cleanLine.trim()) return null;
      
      const parts = cleanLine.split(/\t/);
      if (parts.length < 2) return null; 

      let precCp = '';
      let nome = '';
      let cpfRaw = '';
      let valorRaw = '0';
      let posto = '';

      if (format === 'T1') {
          if (isPensioners) {
            precCp = parts[0]?.trim() || '';
            cpfRaw = parts[1]?.trim() || '';
            nome   = parts[2]?.trim().toUpperCase() || '';
            valorRaw = parts[3]?.trim() || '0';
          } else {
            precCp = parts[0]?.trim() || '';
            cpfRaw = parts[1]?.trim() || '';
            posto  = sanitizeRank(parts[2]?.trim() || '');
            nome   = parts[3]?.trim().toUpperCase() || '';
            valorRaw = parts[4]?.trim() || '0';
          }
          precCp = precCp.replace(/^0+/, '');
      } else {
          if (isPensioners) {
              nome   = parts[0]?.trim().toUpperCase() || '';
              cpfRaw = parts[1]?.trim() || '';
              precCp = parts[2]?.trim() || '';
          } else if (isVeterans) {
              posto  = sanitizeRank(parts[0]?.trim() || '');
              nome   = parts[1]?.trim().toUpperCase() || '';
              cpfRaw = parts[2]?.trim() || '';
              precCp = parts[3]?.trim() || '';
          } else {
              posto  = sanitizeRank(parts[0]?.trim() || '');
              nome   = parts[1]?.trim().toUpperCase() || '';
              precCp = parts[2]?.trim() || '';
              cpfRaw = parts[3]?.trim() || '';
          }
      }

      let cleanCpf = cpfRaw.replace(/\D/g, '');
      if (cleanCpf.length > 0 && cleanCpf.length < 11) cleanCpf = cleanCpf.padStart(11, '0');
      
      const cleanValor = valorRaw
        .replace(/[R$\s\xA0]/g, '')
        .replace(/\.(?=\d{3},)/g, '')
        .replace(',', '.');
      
      const valorLiquido = parseFloat(cleanValor) || 0;

      if (precCp.length < 2 && nome.length < 3) return null;

      return {
        id: crypto.randomUUID(),
        precCp,
        nome,
        cpf: cleanCpf,
        valorLiquido,
        postoGraduacao: posto,
        sourceLine: index + 1
      };
    }).filter((p): p is PersonRecord => p !== null);
  };

  const normalize = (str: string) => {
    if (!str) return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  };

  const areNamesEquivalent = (n1: string, n2: string) => {
    const norm1 = normalize(n1);
    const norm2 = normalize(n2);
    return norm1 === norm2;
  };

  const handleCompare = () => {
    if (!textT1 || !textT2) return;
    setProcessing(true);
    
    setTimeout(() => {
        // Parsing feito só aqui (no submit), não a cada tecla digitada no textarea.
        const listT1 = parseInput(textT1, 'T1');
        const listT2 = parseInput(textT2, 'T2');

        const mapT2ByPrec = new Map<string, PersonRecord>(listT2.map(p => [p.precCp, p]));
        const mapT1ByPrec = new Map<string, PersonRecord>(listT1.map(p => [p.precCp, p]));
        const mapT2ByName = new Map<string, PersonRecord>(listT2.map(p => [normalize(p.nome), p]));
        const mapT1ByName = new Map<string, PersonRecord>(listT1.map(p => [normalize(p.nome), p]));
        const mapT2ByCpf = new Map<string, PersonRecord>(listT2.map(p => [p.cpf, p]));

        const res: ComparisonResult = {
            samePrecDifferentName: [],
            sameCpfDifferentPrec: [],
            sameCpfDifferentName: [],
            sameNameDifferentCpf: [],
            samePrecDifferentCpf: [],
            missingInT2: [],
            missingInT1: [],
            missingNameInT2: [],
            missingNameInT1: [],
            zeroValueInT1: [],
        };

        listT1.forEach(p1 => {
            const p2 = mapT2ByPrec.get(p1.precCp);
            
            // Divergência de Nome
            if (p2 && !areNamesEquivalent(p1.nome, p2.nome)) res.samePrecDifferentName.push({ t1: p1, t2: p2 });
            
            // Divergência de CPF (Mesmo Prec-CP)
            if (p2 && p1.cpf !== p2.cpf && p1.cpf.length >= 11 && p2.cpf.length >= 11) {
              res.samePrecDifferentCpf.push({ t1: p1, t2: p2 });
            }

            // Faltam no SiCaPEx
            if (!p2) res.missingInT2.push(p1);

            // Pagamento Zerado no CPEx
            if (p1.valorLiquido === 0) {
              res.zeroValueInT1.push(p1);
            }
        });

        listT2.forEach(p2 => {
            if (!mapT1ByPrec.has(p2.precCp)) res.missingInT1.push(p2);
        });

        listT1.forEach(p1 => {
            if (p1.cpf.length >= 11) {
                const p2 = mapT2ByCpf.get(p1.cpf);
                if (p2 && p1.precCp !== p2.precCp) res.sameCpfDifferentPrec.push({ t1: p1, t2: p2 });
                if (p2 && !areNamesEquivalent(p1.nome, p2.nome)) res.sameCpfDifferentName.push({ t1: p1, t2: p2 });
            }
        });

        setResult(res);
        setProcessing(false);
    }, 150);
  };

  const openModal = (title: string, data: any[], type: 'simple' | 'conflict') => {
    setModalTitle(title);
    setCurrentData(data);
    setCurrentType(type);
    setModalOpen(true);
  };

  const ResultCard = ({ title, count, description, color, icon: Icon, onClick }: any) => (
    <button 
      onClick={onClick} 
      className={`bg-white rounded-xl shadow-sm border border-slate-200 p-5 text-left transition-all hover:shadow-lg hover:-translate-y-1 relative overflow-hidden group h-full flex flex-col justify-between`}
    >
        <div className={`absolute top-0 left-0 w-1.5 h-full ${color}`}></div>
        <div className="flex justify-between items-start mb-3">
            <div className={`p-2 rounded-lg ${color.replace('bg-', 'bg-').replace('500', '50').replace('600', '50').replace('700', '50')}`}>
                <Icon size={20} className={color.replace('bg-', 'text-')} />
            </div>
            <span className={`text-3xl font-black text-slate-800 group-hover:scale-110 transition-transform`}>{count}</span>
        </div>
        <div>
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{title}</h4>
            <p className="text-[10px] text-slate-400 font-medium leading-tight">{description}</p>
        </div>
    </button>
  );

  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  if (currentView === 'landing') {
    return (
      <div className="flex flex-col h-screen bg-gray-50 overflow-hidden font-sans">
        <header className="bg-army-green text-white shadow-xl border-b-[6px] border-army-gold sticky top-0 z-50">
          <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
          <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between relative z-10">
            <div className="flex items-center gap-4">
              <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors"><ArrowLeft className="w-6 h-6 text-army-gold" /></button>
              <div>
                  <h1 className="text-xl font-montserrat font-bold leading-none">Comparador de Relações</h1>
                  <p className="text-army-gold text-[10px] font-bold uppercase mt-1 tracking-widest">Auditoria de Folha de Pagamento</p>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center p-6 animate-fade-in relative">
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none flex items-center justify-center overflow-hidden">
             <GitCompare size={800} />
          </div>
          <div className="text-center mb-12 relative z-10">
              <h2 className="text-3xl font-bold text-army-green mb-3 font-montserrat">Módulo de Confronto de Dados</h2>
              <p className="text-slate-500 max-w-lg mx-auto font-medium">Selecione a categoria para iniciar o processamento cruzado entre as bases do CPEx e SiCaPEx.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl w-full relative z-10">
              {[
                { id: 'active', title: 'Militares da Ativa', icon: Shield, color: 'army-green', label: 'Shield' },
                { id: 'veterans', title: 'Veteranos', icon: Award, color: 'army-blue', label: 'Award' },
                { id: 'pensioners', title: 'Pensionistas', icon: Users, color: 'yellow-600', label: 'Users' }
              ].map((item) => (
                <button 
                  key={item.id}
                  onClick={() => { setTextT1(''); setTextT2(''); setResult(null); setCurrentView(item.id as any); }} 
                  className={`bg-white rounded-2xl shadow-lg border border-slate-200 p-10 flex flex-col items-center text-center hover:scale-105 transition-all duration-300 group hover:border-${item.color} relative overflow-hidden`}
                >
                  <div className={`absolute top-0 left-0 w-full h-2 bg-${item.color}`}></div>
                  <div className={`w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 group-hover:bg-${item.color} transition-colors`}>
                    <item.icon size={40} className={`text-${item.color} group-hover:text-white`} />
                  </div>
                  <h3 className="text-xl font-black text-slate-800 mb-6 font-montserrat uppercase tracking-tight">{item.title}</h3>
                  <span className={`text-[10px] font-black text-${item.color} uppercase tracking-widest flex items-center gap-2 border-b-2 border-transparent group-hover:border-${item.color} pb-1`}>
                    Iniciar Análise <ChevronRight size={14} />
                  </span>
                </button>
              ))}
          </div>
        </main>
        <footer className="bg-army-light text-white py-3 border-t-4 border-army-gold text-center text-[10px] font-bold uppercase tracking-widest">
            Divisão de Pagamento de Pessoal - EB
        </footer>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden font-sans">
      <header className="bg-army-green text-white shadow-xl border-b-[6px] border-army-gold sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => setCurrentView('landing')} className="p-2 hover:bg-white/10 rounded-full transition-colors"><ArrowLeft className="w-6 h-6 text-army-gold" /></button>
            <div className="flex items-center gap-3">
               <GitCompare className="w-8 h-8 text-army-gold" />
               <div>
                  <h1 className="text-lg font-montserrat font-bold leading-none">{isPensioners ? 'Pensionistas' : isVeterans ? 'Veteranos' : 'Ativa'}</h1>
                  <p className="text-army-gold text-[9px] font-black uppercase tracking-widest mt-1">Comparação CPEx X SiCaPEx</p>
               </div>
            </div>
          </div>
          <div className="flex gap-2">
              <button onClick={handleCompare} disabled={processing || !textT1 || !textT2} className="bg-army-gold hover:bg-white text-army-green px-5 py-2 rounded-lg text-xs font-black shadow-md transition-all flex items-center gap-2 disabled:opacity-30">
                {processing ? <RefreshCw className="animate-spin" size={16} /> : <GitCompare size={16} />} 
                {processing ? 'PROCESSANDO...' : 'EXECUTAR COMPARAÇÃO'}
              </button>
              <button onClick={() => { setTextT1(''); setTextT2(''); setResult(null); }} className="p-2 text-white/50 hover:text-white transition-colors" title="Limpar Tudo"><Trash2 size={20}/></button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 md:p-8 custom-scrollbar">
          <div className="max-w-[1600px] mx-auto space-y-8">
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* T1 - CPEx */}
                  <div className="space-y-3">
                      <div className="flex justify-between items-center">
                          <label className="text-[10px] font-black text-army-green uppercase tracking-[0.2em] flex items-center gap-2">
                             <ClipboardList size={14} className="text-army-gold" /> Relação CPEx
                          </label>
                          <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                             {isPensioners ? 'Prec | CPF | Nome | Valor' : 'Prec | CPF | P/G | Nome | Valor'}
                          </span>
                      </div>
                      <textarea 
                          className="w-full h-48 p-4 text-[11px] font-mono bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-army-green/5 focus:border-army-green outline-none resize-none shadow-inner custom-scrollbar"
                          placeholder="Cole aqui os dados copiados do PDF/Excel do CPEx..."
                          value={textT1}
                          onChange={(e) => setTextT1(e.target.value)}
                      />
                  </div>
                  
                  {/* T2 - SiCaPEx */}
                  <div className="space-y-3">
                      <div className="flex justify-between items-center">
                          <label className="text-[10px] font-black text-army-green uppercase tracking-[0.2em] flex items-center gap-2">
                             <Database size={14} className="text-army-gold" /> Efetivo SiCaPEx
                          </label>
                          <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                             {isPensioners ? 'Nome | CPF | Prec' : isVeterans ? 'P/G | Nome | CPF | Prec' : 'P/G | Nome | Prec | CPF'}
                          </span>
                      </div>
                      <textarea 
                          className="w-full h-48 p-4 text-[11px] font-mono bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-army-green/5 focus:border-army-green outline-none resize-none shadow-inner custom-scrollbar"
                          placeholder="Cole aqui os dados copiados do SiCaPEx..."
                          value={textT2}
                          onChange={(e) => setTextT2(e.target.value)}
                      />
                  </div>
              </div>

              {result && (
                  <div className="space-y-6 animate-fade-in-up">
                      <div className="flex items-center gap-3 border-b border-slate-200 pb-2">
                         <div className="h-4 w-1 bg-army-gold"></div>
                         <h3 className="text-sm font-black text-army-green uppercase tracking-widest">Resultado do Cruzamento de Dados</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4">
                          <ResultCard 
                              title="Faltam no SiCaPEx"
                              description="Presentes no CPEx mas não localizados no SiCaPEx (por Prec-CP)"
                              count={result.missingInT2.length}
                              color="bg-red-500"
                              icon={UserX}
                              onClick={() => openModal("Não constam no SiCaPEx", result.missingInT2, 'simple')}
                          />
                          <ResultCard 
                              title="Faltam no CPEx"
                              description="Militar ativo no SiCaPEx mas ausente na folha do CPEx"
                              count={result.missingInT1.length}
                              color="bg-orange-500"
                              icon={AlertTriangle}
                              onClick={() => openModal("Não constam no CPEx", result.missingInT1, 'simple')}
                          />
                          <ResultCard 
                              title="Prec x Nome Divergente"
                              description="Prec-CP coincidente porém com nomes diferentes nas bases"
                              count={result.samePrecDifferentName.length}
                              color="bg-purple-500"
                              icon={RefreshCw}
                              onClick={() => openModal("Divergência: Prec-CP x Nome", result.samePrecDifferentName, 'conflict')}
                          />
                          <ResultCard 
                              title="CPF x Prec Divergente"
                              description="Mesmo CPF vinculado a Prec-CPs distintos entre as tabelas"
                              count={result.sameCpfDifferentPrec.length}
                              color="bg-blue-500"
                              icon={ShieldAlert}
                              onClick={() => openModal("Divergência: CPF x Prec-CP", result.sameCpfDifferentPrec, 'conflict')}
                          />
                          <ResultCard 
                              title="Prec-CP x CPF Divergente"
                              description="Mesmo Prec-CP vinculado a CPFs distintos entre as tabelas"
                              count={result.samePrecDifferentCpf.length}
                              color="bg-rose-700"
                              icon={AlertCircle}
                              onClick={() => openModal("Divergência: Prec-CP x CPF", result.samePrecDifferentCpf, 'conflict')}
                          />
                          <ResultCard 
                              title="Pagamento Zerado no CPEx"
                              description="Militares com valor líquido igual a R$ 0,00 na folha do CPEx"
                              count={result.zeroValueInT1.length}
                              color="bg-slate-600"
                              icon={BadgeMinus}
                              onClick={() => openModal("Pagamento Zerado (R$ 0,00)", result.zeroValueInT1, 'simple')}
                          />
                      </div>
                  </div>
              )}
          </div>
      </main>

      {/* Modal de Detalhes */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border-t-8 border-army-green">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div>
                        <h3 className="text-lg font-black text-army-green uppercase tracking-widest font-montserrat">{modalTitle}</h3>
                        <p className="text-xs text-slate-400 font-bold mt-1">Total: {currentData.length} registros</p>
                    </div>
                    <button onClick={() => setModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={24} className="text-slate-400" /></button>
                </div>
                
                <div className="flex-1 overflow-auto p-4 custom-scrollbar">
                    <table className="w-full text-[11px] text-left border-separate border-spacing-y-2">
                        <thead className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] sticky top-0 bg-white z-10">
                            <tr>
                                <th className="px-4 py-2 w-12 text-center">#</th>
                                {currentType === 'simple' ? (
                                    <>
                                        <th className="px-4 py-2">Prec-CP</th>
                                        {!isPensioners && <th className="px-4 py-2">P/G</th>}
                                        <th className="px-4 py-2">Nome</th>
                                        <th className="px-4 py-2">CPF</th>
                                        <th className="px-4 py-2 text-right">Valor Líquido</th>
                                    </>
                                ) : (
                                    <th className="px-4 py-2">Comparativo CPEx vs SiCaPEx</th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {currentData.map((item, idx) => (
                                <tr key={idx} className="bg-slate-50 hover:bg-white transition-all shadow-sm rounded-lg overflow-hidden group">
                                    <td className="px-4 py-3 text-center font-bold text-slate-300 border-l-4 border-army-gold group-hover:border-army-green">{idx + 1}</td>
                                    {currentType === 'simple' ? (
                                        <>
                                            <td className="px-4 py-3 font-mono font-bold text-army-green">{item.precCp}</td>
                                            {!isPensioners && <td className="px-4 py-3 font-bold text-slate-600">{item.postoGraduacao}</td>}
                                            <td className="px-4 py-3 font-bold text-slate-800 uppercase">{item.nome}</td>
                                            <td className="px-4 py-3 font-mono text-slate-500">{item.cpf}</td>
                                            <td className="px-4 py-3 text-right font-mono font-bold text-army-green">{formatCurrency(item.valorLiquido)}</td>
                                        </>
                                    ) : (
                                        <td className="px-4 py-3">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                                                    <span className="text-[9px] font-black text-red-400 uppercase block mb-1">CPEx</span>
                                                    <div className="flex flex-col">
                                                       <span className="font-bold text-slate-800 text-[10px]">{item.t1.nome}</span>
                                                       <span className="font-mono text-[9px] text-slate-500">Prec: {item.t1.precCp} | CPF: {item.t1.cpf}</span>
                                                    </div>
                                                </div>
                                                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                                                    <span className="text-[9px] font-black text-blue-400 uppercase block mb-1">SiCaPEx</span>
                                                    <div className="flex flex-col">
                                                       <span className="font-bold text-slate-800 text-[10px]">{item.t2.nome}</span>
                                                       <span className="font-mono text-[9px] text-slate-500">Prec: {item.t2.precCp} | CPF: {item.t2.cpf}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default ComparisonApp;
