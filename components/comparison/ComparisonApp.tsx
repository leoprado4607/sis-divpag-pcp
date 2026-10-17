
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
        const mapT2ByCpf = new Map<string, PersonRecord>(listT2.filter(p => p.cpf.length >= 11).map(p => [p.cpf, p]));
        const mapT1ByCpf = new Map<string, PersonRecord>(listT1.filter(p => p.cpf.length >= 11).map(p => [p.cpf, p]));

        const res: ComparisonResult = {
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

            // Divergência de CPF (Mesmo Prec-CP)
            if (p2 && p1.cpf !== p2.cpf && p1.cpf.length >= 11 && p2.cpf.length >= 11) {
              res.samePrecDifferentCpf.push({ t1: p1, t2: p2 });
            }

            // Faltam no SiCaPEx (comparação por CPF)
            if (!mapT2ByCpf.get(p1.cpf)) res.missingInT2.push(p1);

            // Pagamento Zerado no CPEx
            if (p1.valorLiquido === 0) {
              res.zeroValueInT1.push(p1);
            }
        });

        listT2.forEach(p2 => {
            if (!mapT1ByCpf.has(p2.cpf)) res.missingInT1.push(p2);
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

  // Tom de cada resultado: classes completas (o Tailwind não enxerga classes montadas).
  const TONS = {
    critico: 'bg-red-50 text-red-700',
    alerta:  'bg-amber-50 text-amber-800',
    nome:    'bg-purple-50 text-purple-700',
    prec:    'bg-blue-50 text-blue-700',
    cpf:     'bg-rose-50 text-rose-700',
    neutro:  'bg-army-cream text-army-green',
  } as const;

  const ResultCard = ({ title, count, description, tone, icon: Icon, onClick }: {
    title: string; count: number; description: string; tone: keyof typeof TONS;
    icon: React.ElementType; onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className="group relative bg-white border border-army-green/10 hover:border-army-gold/50 p-5 text-left transition-colors h-full flex flex-col gap-4 overflow-hidden"
    >
      <div className="flex justify-between items-start">
        <div className={`p-2 ${TONS[tone]}`}>
          <Icon size={20} />
        </div>
        <span className="font-cormorant font-semibold text-4xl leading-none text-army-charcoal tabular-nums">{count}</span>
      </div>
      <div>
        <h4 className="text-sm font-semibold text-army-green mb-1">{title}</h4>
        <p className="text-[13px] text-army-green/75 leading-snug">{description}</p>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-army-green scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-300" />
    </button>
  );

  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  if (currentView === 'landing') {
    const PUBLICOS = [
      { id: 'active',     title: 'Militares da Ativa', icon: Shield, iconClass: 'text-army-green' },
      { id: 'veterans',   title: 'Veteranos',          icon: Award,  iconClass: 'text-army-blue' },
      { id: 'pensioners', title: 'Pensionistas',       icon: Users,  iconClass: 'text-army-gold-deep' },
    ] as const;
    return (
      <div className="flex flex-col flex-1 bg-army-cream">
        <header className="bg-army-green text-white sticky top-0 z-50 border-b-2 border-army-gold">
          <div className="max-w-[1600px] mx-auto px-5 sm:px-8 h-16 flex items-center gap-4">
            <button
              type="button"
              onClick={onBack}
              aria-label="Voltar ao portal"
              className="flex-shrink-0 min-h-[44px] flex items-center gap-1.5 text-white/70 hover:text-army-gold-light transition-colors text-[11px] font-medium tracking-[0.14em] uppercase"
            >
              <ArrowLeft size={13} />
              <span className="hidden sm:inline">Portal</span>
            </button>
            <div className="h-4 w-px bg-white/15" />
            <GitCompare size={20} className="text-army-gold-light flex-shrink-0" />
            <div className="leading-tight min-w-0">
              <h1 className="font-cormorant font-semibold text-xl text-white leading-none truncate">Comparador de Relações</h1>
              <p className="text-xs text-white/70 mt-1 truncate">Auditoria de folha de pagamento</p>
            </div>
          </div>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-12 animate-fade-in">
          <div className="text-center mb-10 max-w-xl">
              <h2 className="font-cormorant font-semibold text-3xl sm:text-4xl text-army-green leading-tight mb-3 text-balance">Módulo de Confronto de Dados</h2>
              <p className="text-army-green/75 leading-relaxed">Selecione a categoria para iniciar o processamento cruzado entre as bases do CPEx e SiCaPEx.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-army-green/10 border border-army-green/10 max-w-5xl w-full">
              {PUBLICOS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { setTextT1(''); setTextT2(''); setResult(null); setCurrentView(item.id); }}
                  className="group relative bg-white p-8 flex flex-col items-start text-left hover:bg-army-cream/50 transition-colors overflow-hidden"
                >
                  <div className="p-3 bg-army-cream border border-army-green/10 mb-6">
                    <item.icon size={28} className={item.iconClass} />
                  </div>
                  <h3 className="font-cormorant font-semibold text-2xl text-army-charcoal mb-6">{item.title}</h3>
                  <span className="mt-auto text-[13px] font-medium text-army-green group-hover:text-army-gold-deep flex items-center gap-1.5 transition-colors">
                    Iniciar análise <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                  <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-army-green scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-300" />
                </button>
              ))}
          </div>
        </main>
      </div>
    );
  }

  const areaClass = "w-full h-48 p-4 text-[13px] font-mono bg-white border border-army-green/15 focus:border-army-green outline-none resize-none custom-scrollbar text-army-charcoal placeholder-army-green/75";
  const chipClass = "text-[11px] font-mono bg-army-cream text-army-green/75 border border-army-green/10 px-2 py-0.5";

  return (
    <div className="flex flex-col h-screen bg-army-cream overflow-hidden">
        <header className="bg-army-green text-white sticky top-0 z-50 border-b-2 border-army-gold">
          <div className="max-w-[1600px] mx-auto px-5 sm:px-8 h-16 flex items-center gap-4">
            <button
              type="button"
              onClick={() => setCurrentView('landing')}
              aria-label="Voltar à escolha do público"
              className="flex-shrink-0 min-h-[44px] flex items-center gap-1.5 text-white/70 hover:text-army-gold-light transition-colors text-[11px] font-medium tracking-[0.14em] uppercase"
            >
              <ArrowLeft size={13} />
              <span className="hidden sm:inline">Públicos</span>
            </button>
            <div className="h-4 w-px bg-white/15" />
            <GitCompare size={20} className="text-army-gold-light flex-shrink-0" />
            <div className="leading-tight min-w-0">
              <h1 className="font-cormorant font-semibold text-xl text-white leading-none truncate">{isPensioners ? 'Pensionistas' : isVeterans ? 'Veteranos' : 'Militares da Ativa'}</h1>
              <p className="text-xs text-white/70 mt-1 truncate">Comparação CPEx × SiCaPEx</p>
            </div>
            <div className="flex-1" />
            <button
              type="button"
              onClick={handleCompare}
              disabled={processing || !textT1 || !textT2}
              className="flex-shrink-0 min-h-[44px] bg-army-gold-light hover:bg-white text-army-charcoal px-4 sm:px-5 text-[13px] font-semibold transition-colors flex items-center gap-2 disabled:opacity-40 disabled:hover:bg-army-gold-light"
            >
              {processing ? <RefreshCw className="animate-spin" size={16} /> : <GitCompare size={16} />}
              <span className="hidden sm:inline">{processing ? 'Processando…' : 'Executar comparação'}</span>
              <span className="sm:hidden">{processing ? '…' : 'Comparar'}</span>
            </button>
            <button type="button" onClick={() => { setTextT1(''); setTextT2(''); setResult(null); }} className="flex-shrink-0 w-11 h-11 flex items-center justify-center text-white/70 hover:text-white transition-colors" title="Limpar tudo" aria-label="Limpar tudo"><Trash2 size={18}/></button>
          </div>
      </header>

      <main className="flex-1 overflow-auto p-4 md:p-8 custom-scrollbar">
          <div className="max-w-[1600px] mx-auto space-y-8">

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
                  {/* T1 - CPEx */}
                  <div className="space-y-2">
                      <div className="flex justify-between items-center gap-3 flex-wrap">
                          <label htmlFor="cmp-t1" className="text-sm font-semibold text-army-green flex items-center gap-2">
                             <ClipboardList size={15} className="text-army-gold-deep" /> Relação CPEx
                          </label>
                          <span className={chipClass}>
                             {isPensioners ? 'Prec | CPF | Nome | Valor' : 'Prec | CPF | P/G | Nome | Valor'}
                          </span>
                      </div>
                      <textarea
                          id="cmp-t1"
                          className={areaClass}
                          placeholder="Cole aqui os dados copiados do PDF/Excel do CPEx..."
                          value={textT1}
                          onChange={(e) => setTextT1(e.target.value)}
                      />
                  </div>

                  {/* T2 - SiCaPEx */}
                  <div className="space-y-2">
                      <div className="flex justify-between items-center gap-3 flex-wrap">
                          <label htmlFor="cmp-t2" className="text-sm font-semibold text-army-green flex items-center gap-2">
                             <Database size={15} className="text-army-gold-deep" /> Efetivo SiCaPEx
                          </label>
                          <span className={chipClass}>
                             {isPensioners ? 'Nome | CPF | Prec' : isVeterans ? 'P/G | Nome | CPF | Prec' : 'P/G | Nome | Prec | CPF'}
                          </span>
                      </div>
                      <textarea
                          id="cmp-t2"
                          className={areaClass}
                          placeholder="Cole aqui os dados copiados do SiCaPEx..."
                          value={textT2}
                          onChange={(e) => setTextT2(e.target.value)}
                      />
                  </div>
              </div>

              {result && (
                  <section className="space-y-5 animate-fade-in-up" aria-label="Resultado da comparação">
                      <h3 className="font-cormorant font-semibold text-2xl text-army-green border-b border-army-green/10 pb-2">Resultado do cruzamento de dados</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4">
                          <ResultCard
                              title="Faltam no SiCaPEx"
                              description="Presentes no CPEx mas não localizados no SiCaPEx (por CPF)"
                              count={result.missingInT2.length}
                              tone="critico"
                              icon={UserX}
                              onClick={() => openModal("Não constam no SiCaPEx", result.missingInT2, 'simple')}
                          />
                          <ResultCard
                              title="Faltam no CPEx"
                              description="Militar ativo no SiCaPEx mas ausente na folha do CPEx"
                              count={result.missingInT1.length}
                              tone="alerta"
                              icon={AlertTriangle}
                              onClick={() => openModal("Não constam no CPEx", result.missingInT1, 'simple')}
                          />
                          <ResultCard
                              title="CPF x Nome Divergente"
                              description="CPF coincidente porém com nomes diferentes nas bases"
                              count={result.sameCpfDifferentName.length}
                              tone="nome"
                              icon={RefreshCw}
                              onClick={() => openModal("Divergência: CPF x Nome", result.sameCpfDifferentName, 'conflict')}
                          />
                          <ResultCard
                              title="CPF x Prec Divergente"
                              description="Mesmo CPF vinculado a Prec-CPs distintos entre as tabelas"
                              count={result.sameCpfDifferentPrec.length}
                              tone="prec"
                              icon={ShieldAlert}
                              onClick={() => openModal("Divergência: CPF x Prec-CP", result.sameCpfDifferentPrec, 'conflict')}
                          />
                          <ResultCard
                              title="Prec-CP x CPF Divergente"
                              description="Mesmo Prec-CP vinculado a CPFs distintos entre as tabelas"
                              count={result.samePrecDifferentCpf.length}
                              tone="cpf"
                              icon={AlertCircle}
                              onClick={() => openModal("Divergência: Prec-CP x CPF", result.samePrecDifferentCpf, 'conflict')}
                          />
                          <ResultCard
                              title="Pagamento Zerado no CPEx"
                              description="Militares com valor líquido igual a R$ 0,00 na folha do CPEx"
                              count={result.zeroValueInT1.length}
                              tone="neutro"
                              icon={BadgeMinus}
                              onClick={() => openModal("Pagamento Zerado (R$ 0,00)", result.zeroValueInT1, 'simple')}
                          />
                      </div>
                  </section>
              )}
          </div>
      </main>

      {/* Modal de Detalhes */}
      {modalOpen && (
        <div className="fixed inset-0 bg-army-charcoal/60 z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={() => setModalOpen(false)}>
            <div
              className="bg-white w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border-t-2 border-army-gold"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cmp-modal-titulo"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.key === 'Escape' && setModalOpen(false)}
            >
                <div className="px-6 py-5 border-b border-army-green/10 flex justify-between items-center gap-4">
                    <div className="min-w-0">
                        <h3 id="cmp-modal-titulo" className="font-cormorant font-semibold text-2xl text-army-green leading-tight">{modalTitle}</h3>
                        <p className="text-[13px] text-army-green/75 mt-1 tabular-nums">Total: {currentData.length} registros</p>
                    </div>
                    <button type="button" autoFocus onClick={() => setModalOpen(false)} aria-label="Fechar" className="flex-shrink-0 w-11 h-11 flex items-center justify-center hover:bg-army-cream transition-colors"><X size={22} className="text-army-green" /></button>
                </div>

                <div className="flex-1 overflow-auto custom-scrollbar">
                    <table className="w-full text-[13px] text-left">
                        <thead className="text-[11px] font-semibold text-army-green/75 uppercase tracking-[0.12em] sticky top-0 bg-white z-10 border-b border-army-green/10">
                            <tr>
                                <th className="px-4 py-3 w-12 text-center">#</th>
                                {currentType === 'simple' ? (
                                    <>
                                        <th className="px-4 py-3">Prec-CP</th>
                                        {!isPensioners && <th className="px-4 py-3">P/G</th>}
                                        <th className="px-4 py-3">Nome</th>
                                        <th className="px-4 py-3">CPF</th>
                                        <th className="px-4 py-3 text-right">Valor Líquido</th>
                                    </>
                                ) : (
                                    <th className="px-4 py-3">Comparativo CPEx vs SiCaPEx</th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-army-green/[0.07]">
                            {currentData.map((item, idx) => (
                                <tr key={idx} className="hover:bg-army-cream/60 transition-colors">
                                    <td className="px-4 py-3 text-center text-army-green/75 tabular-nums">{idx + 1}</td>
                                    {currentType === 'simple' ? (
                                        <>
                                            <td className="px-4 py-3 font-mono font-semibold text-army-green tabular-nums">{item.precCp}</td>
                                            {!isPensioners && <td className="px-4 py-3 font-medium text-army-charcoal/80">{item.postoGraduacao}</td>}
                                            <td className="px-4 py-3 font-semibold text-army-charcoal uppercase">{item.nome}</td>
                                            <td className="px-4 py-3 font-mono text-army-charcoal/80 tabular-nums">{item.cpf}</td>
                                            <td className="px-4 py-3 text-right font-mono font-semibold text-army-green tabular-nums">{formatCurrency(item.valorLiquido)}</td>
                                        </>
                                    ) : (
                                        <td className="px-4 py-3">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div className="bg-red-50 p-3 border border-red-100">
                                                    <span className="text-[11px] font-semibold text-red-700 uppercase tracking-wide block mb-1">CPEx</span>
                                                    <div className="flex flex-col">
                                                       <span className="font-semibold text-army-charcoal">{item.t1.nome}</span>
                                                       <span className="font-mono text-xs text-army-charcoal/75 tabular-nums">Prec: {item.t1.precCp} | CPF: {item.t1.cpf}</span>
                                                    </div>
                                                </div>
                                                <div className="bg-blue-50 p-3 border border-blue-100">
                                                    <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide block mb-1">SiCaPEx</span>
                                                    <div className="flex flex-col">
                                                       <span className="font-semibold text-army-charcoal">{item.t2.nome}</span>
                                                       <span className="font-mono text-xs text-army-charcoal/75 tabular-nums">Prec: {item.t2.precCp} | CPF: {item.t2.cpf}</span>
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
