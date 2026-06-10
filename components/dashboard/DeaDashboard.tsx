
import React, { useEffect, useState, useMemo } from 'react';
import { 
  ArrowLeft, RefreshCw, FileText, Users, DollarSign, CheckCircle, 
  AlertCircle, BarChart as IconChart, BrainCircuit, Download, Lock,
  TrendingUp, PieChart, BarChart3, Calendar, ChevronDown, ShieldAlert
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  ResponsiveContainer, Cell, Tooltip as RechartsTooltip
} from 'recharts';
import { fetchDeaData } from '../../services/deaService';
import { DeaProtocol } from '../../types';
import { callGemini } from '../../services/geminiClient';
import ReactMarkdown from 'react-markdown';
import jsPDF from 'jspdf';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Instanciar Intl.NumberFormat é relativamente caro; criar uma vez e reutilizar
// evita recriá-lo a cada render/célula.
const brlFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const formatBRL = (value: number) => brlFormatter.format(value);

// Modelo Gemini configurável via env. Default alinhado ao modelo estável usado no
// restante do app (andrecitoService) para evitar inconsistência entre módulos.
const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash';

// ATENÇÃO: este "login" é apenas um gate client-side e NÃO é segurança real — o
// valor fica visível no bundle JS. Movido para env (fallback preserva o
// comportamento atual). Proteção efetiva exige validação no servidor.
const DEA_AI_PASSWORDS = (import.meta.env.VITE_DEA_AI_PASSWORD || 'gs4607,admin')
  .split(',')
  .map((s: string) => s.trim())
  .filter(Boolean);

// Cores institucionais (RGB) usadas no PDF.
const PDF_C = {
  green: { r: 26, g: 60, b: 26 },
  gold: { r: 189, g: 156, b: 77 },
  text: { r: 38, g: 38, b: 38 },
  muted: { r: 120, g: 120, b: 120 },
  rule: { r: 222, g: 226, b: 230 },
};

// Gera um PDF profissional a partir do parecer em Markdown: cabeçalho
// institucional, hierarquia de títulos, listas, tabelas, divisores, quebra de
// texto, paginação e rodapé com numeração. Substitui o dump cru anterior
// (doc.text(texto, 20, 20)) que estourava a página.
const exportParecerPdf = (markdown: string, year: string) => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pageW - margin * 2;
  const bottomLimit = pageH - 48;

  // Remove marcadores inline de Markdown que não renderizamos (negrito/itálico/código).
  const clean = (s: string) => s.replace(/\*\*/g, '').replace(/(^|\s)\*(\S)/g, '$1$2').replace(/`/g, '').trim();

  // Cabeçalho institucional (só na 1ª página).
  doc.setFillColor(PDF_C.green.r, PDF_C.green.g, PDF_C.green.b);
  doc.rect(0, 0, pageW, 72, 'F');
  doc.setFillColor(PDF_C.gold.r, PDF_C.gold.g, PDF_C.gold.b);
  doc.rect(0, 72, pageW, 4, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('Parecer Estratégico IA', margin, 38);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Painel DEA  ·  Exercício ${year}  ·  Divisão de Pagamento de Pessoal`, margin, 58);

  let y = 104;

  const ensure = (h: number) => {
    if (y + h > bottomLimit) {
      doc.addPage();
      y = 56;
    }
  };

  const writeLines = (text: string, opts: { size: number; bold?: boolean; color?: { r: number; g: number; b: number }; indent?: number; gap?: number }) => {
    const indent = opts.indent || 0;
    const lineH = opts.size + 4;
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size);
    const c = opts.color || PDF_C.text;
    doc.setTextColor(c.r, c.g, c.b);
    const wrapped = doc.splitTextToSize(text, contentW - indent);
    for (const w of wrapped) {
      ensure(lineH);
      doc.text(w, margin + indent, y);
      y += lineH;
    }
    if (opts.gap) y += opts.gap;
  };

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { y += 5; continue; }

    // Divisor horizontal
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      ensure(14);
      doc.setDrawColor(PDF_C.rule.r, PDF_C.rule.g, PDF_C.rule.b);
      doc.line(margin, y, pageW - margin, y);
      y += 14;
      continue;
    }

    // Títulos (#, ##, ###)
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      const level = h[1].length;
      const size = level === 1 ? 15 : level === 2 ? 13 : 11.5;
      y += level <= 2 ? 8 : 5;
      writeLines(clean(h[2]), { size, bold: true, color: PDF_C.green, gap: 5 });
      continue;
    }

    // Linha de tabela (| a | b |). Pula a linha separadora |---|---|.
    if (/^\s*\|/.test(line)) {
      if (/^\s*\|?[\s:|-]+\|?\s*$/.test(line)) continue;
      const cells = line.split('|').map(c => clean(c)).filter(c => c.length);
      if (cells.length) writeLines(cells.join('   ·   '), { size: 9.5, gap: 2 });
      continue;
    }

    // Lista com marcador (-, *)
    const b = line.match(/^\s*[-*]\s+(.*)/);
    if (b) {
      ensure(14);
      doc.setFillColor(PDF_C.gold.r, PDF_C.gold.g, PDF_C.gold.b);
      doc.circle(margin + 4, y - 3, 1.6, 'F');
      writeLines(clean(b[1]), { size: 10, indent: 16, gap: 2 });
      continue;
    }

    // Lista numerada (1. 2. ...)
    const n = line.match(/^\s*(\d+)\.\s+(.*)/);
    if (n) {
      ensure(14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(PDF_C.green.r, PDF_C.green.g, PDF_C.green.b);
      doc.text(`${n[1]}.`, margin, y);
      writeLines(clean(n[2]), { size: 10, indent: 18, gap: 2 });
      continue;
    }

    // Parágrafo comum
    writeLines(clean(line), { size: 10, gap: 5 });
  }

  // Rodapé com numeração e origem, em todas as páginas.
  const total = doc.getNumberOfPages();
  const stamp = new Date().toLocaleDateString('pt-BR');
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(PDF_C.muted.r, PDF_C.muted.g, PDF_C.muted.b);
    doc.text(`Gerado via Google Gemini  ·  ${stamp}`, margin, pageH - 26);
    doc.text(`Página ${i} de ${total}`, pageW - margin, pageH - 26, { align: 'right' });
  }

  doc.save(`Parecer_IA_DEA_${year}.pdf`);
};

const CODOM_MAP: Record<string, string> = {
  '24406': 'Cmdo 7ª Bda Inf Mtz', '024406': 'Cmdo 7ª Bda Inf Mtz',
  '3004': '7º BE Cmb', '003004': '7º BE Cmb',
  '065623': '7º Pel PE',
  '1420': 'B Adm Gu Natal', '001420': 'B Adm Gu Natal',
  '30007': 'Cia C/7ª Bda Inf Mtz', '030007': 'Cia C/7ª Bda Inf Mtz',
  '7807': '16º BI Mtz', '007807': '16º BI Mtz',
  '61200': 'HGuN', '061200': 'HGuN',
  '56507': '17º GAC', '056507': '17º GAC'
};

interface DeaDashboardProps {
  onBack: () => void;
}

const DeaDashboard: React.FC<DeaDashboardProps> = ({ onBack }) => {
  const [data, setData] = useState<DeaProtocol[]>([]);
  const [loading, setLoading] = useState(true);
  const currentYearStr = new Date().getFullYear().toString();
  const [selectedYear, setSelectedYear] = useState<string>(currentYearStr);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [accessPassword, setAccessPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => { 
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const result = await fetchDeaData();
    setData(result);
    const years = new Set<string>();
    years.add(currentYearStr);
    result.forEach(d => { if (d.dataImplantacao) { const match = d.dataImplantacao.match(/(20\d{2})/); if (match) years.add(match[0]); } });
    setAvailableYears(Array.from(years).sort().reverse());
    setLoading(false);
  };

  const filteredData = useMemo(() => data.filter(d => d.dataImplantacao && d.dataImplantacao.includes(selectedYear)), [data, selectedYear]);

  const kpis = useMemo(() => {
    const totalProtocolos = filteredData.length;
    const requerentesUnicos = new Set(filteredData.map(d => d.nome)).size;
    const totalRequerido = filteredData.reduce((acc, curr) => acc + curr.valor, 0);
    const totalPago = filteredData.filter(d => d.situacao.toUpperCase().includes('PAGO')).reduce((acc, curr) => acc + curr.valor, 0);
    const naoPago = filteredData.filter(d => !d.situacao.toUpperCase().includes('PAGO')).reduce((acc, curr) => acc + curr.valor, 0);
    return { totalProtocolos, requerentesUnicos, totalRequerido, totalPago, naoPago };
  }, [filteredData]);

  const unitChartData = useMemo(() => {
    const grouped = filteredData.reduce<Record<string, number>>((acc, curr) => {
      const omName = CODOM_MAP[curr.unidade.trim()] || curr.unidade;
      acc[omName] = (acc[omName] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([name, value]) => ({ name, value: value as number })).sort((a, b) => b.value - a.value).slice(0, 15);
  }, [filteredData]);

  const handleAccessLogin = () => {
    if (DEA_AI_PASSWORDS.includes(accessPassword)) {
      setIsAuthenticated(true);
    } else { alert('Senha incorreta'); }
  };

  const generateAiAnalysis = async () => {
    setAiLoading(true);
    setAiAnalysis('');
    try {
      const nonPaidContext = data
        .filter(d => !d.situacao.toUpperCase().includes('PAGO') && d.dataImplantacao?.includes(selectedYear))
        .slice(0, 50)
        .map(d => `- OM: ${CODOM_MAP[d.unidade.trim()] || d.unidade} | Protocolo: ${d.protocolo} | Valor: ${d.valor} | Parecer: ${d.parecer}`)
        .join('\n');

      if (!nonPaidContext) { setAiAnalysis(`Não foram identificados processos pendentes em ${selectedYear} para análise.`); setAiLoading(false); return; }

      // Chamada via proxy serverless /api/gemini (a chave fica no servidor).
      // IMPORTANTE: o gemini-2.5-flash é um modelo "thinking" — os tokens de
      // raciocínio contam dentro de maxOutputTokens. Com 2048, o pensamento
      // consumia quase todo o orçamento e o parecer voltava truncado/vazio.
      // Desligamos o thinking (thinkingBudget: 0) e ampliamos o teto de saída,
      // garantindo que o relatório completo caiba na resposta.
      const text = await callGemini({
        model: GEMINI_MODEL,
        contents: `Você é um analista estratégico militar. Analise os motivos de atraso nos processos de DEA de ${selectedYear} listados abaixo e forneça um parecer executivo sobre os principais gargalos identificados: \n\n${nonPaidContext}. Cite padrões de irregularidades se houver.`,
        config: { maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } },
      });
      setAiAnalysis(text || 'Sem resposta da IA.');
    } catch (error: any) {
      console.error(error);
      setAiAnalysis('Falha no processamento da análise via Inteligência Artificial.');
    } finally { setAiLoading(false); }
  };

  const CHART_COLORS = ['#1a3c1a', '#4b6f44', '#f2c500', '#856404', '#002776'];

  // GATE DE ACESSO: enquanto não autenticado, o sistema "Exercícios Anteriores"
  // não é exibido. A mesma credencial antes usada apenas no "Parecer IA" agora
  // restringe a entrada no sistema (acionado ao clicar no card da página inicial).
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full border-t-8 border-army-green shadow-2xl">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-army-green/5 text-army-green rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner"><Lock size={36} /></div>
              <h3 className="text-2xl font-bold text-slate-800 font-montserrat">Acesso Restrito</h3>
              <p className="text-xs text-slate-400 mt-1 uppercase font-bold tracking-wider">Exercícios Anteriores</p>
            </div>
            <div className="space-y-4">
                <input type="password" placeholder="Digite a credencial..." value={accessPassword} onChange={e => setAccessPassword(e.target.value)} autoFocus className="w-full border-2 border-slate-100 p-4 rounded-2xl mb-2 text-center text-lg focus:border-army-green outline-none transition-colors bg-slate-50" onKeyDown={e => e.key === 'Enter' && handleAccessLogin()}/>
                <div className="flex gap-3">
                    <button onClick={onBack} className="flex-1 py-4 text-slate-400 font-bold hover:text-slate-600 transition-colors uppercase text-xs tracking-widest">VOLTAR</button>
                    <button onClick={handleAccessLogin} className="flex-1 bg-army-green text-white py-4 rounded-2xl font-black shadow-lg hover:bg-green-900 transition-all uppercase text-xs tracking-widest">AUTENTICAR</button>
                </div>
            </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-army-green text-white shadow-xl border-b-[6px] border-army-gold sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors"><ArrowLeft className="w-6 h-6 text-army-gold" /></button>
            <div className="flex flex-col">
                <h1 className="text-xl font-bold leading-none">Painel DEA</h1>
                <span className="text-[10px] text-army-gold font-bold uppercase tracking-widest mt-1">Análise de Exercícios Anteriores</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="bg-army-light text-white rounded-lg p-2 text-sm outline-none border border-army-gold/30 font-bold shadow-sm">
                {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
             </select>
             
             <button
                onClick={generateAiAnalysis}
                className="px-5 py-2 rounded-lg text-sm font-black flex items-center gap-2 transition-all shadow-md active:scale-95 bg-army-gold text-army-green hover:bg-white"
             >
                <BrainCircuit size={18} className={aiLoading ? 'animate-pulse' : ''}/>
                {aiLoading ? 'Processando...' : 'Parecer IA'}
             </button>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-[1600px] mx-auto px-4 py-8 space-y-8 w-full">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <ModernMetricCard title="Protocolos" value={kpis.totalProtocolos} icon={FileText} colorClass="text-blue-600 bg-blue-50" />
            <ModernMetricCard title="Requerentes" value={kpis.requerentesUnicos} icon={Users} colorClass="text-slate-600 bg-slate-100" />
            <ModernMetricCard title="Total Requerido" value={formatBRL(kpis.totalRequerido)} icon={DollarSign} colorClass="text-purple-600 bg-purple-50" />
            <ModernMetricCard title="Total Pago" value={formatBRL(kpis.totalPago)} icon={CheckCircle} colorClass="text-army-green bg-green-50" />
            <ModernMetricCard title="Pendente" value={formatBRL(kpis.naoPago)} icon={AlertCircle} colorClass="text-amber-600 bg-amber-50" />
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-army-green"></div>
            <div className="mb-6 text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><BarChart3 size={16} /> Volume de Processos por Unidade Militar</div>
            <ResponsiveContainer width="100%" height={320}>
                <BarChart data={unitChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{fontSize: 9, fontWeight: '800', fill: '#1a3c1a'}} interval={0} angle={-25} textAnchor="end" height={80} />
                    <YAxis tick={{fontSize: 10, fill: '#64748b'}} />
                    <RechartsTooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'}} />
                    <Bar dataKey="value" name="Processos" radius={[6, 6, 0, 0]}>
                        {unitChartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>

        {aiAnalysis && (
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl animate-fade-in border-l-[12px] border-army-gold relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><BrainCircuit size={120} /></div>
                <div className="flex justify-between items-center mb-8 border-b border-slate-100 pb-5">
                    <div>
                        <h3 className="text-xl font-bold flex items-center gap-3 text-army-green font-montserrat"><BrainCircuit size={28} className="text-army-gold" /> Parecer Estratégico IA</h3>
                        <p className="text-[10px] text-slate-400 uppercase font-bold mt-1 tracking-widest">Relatório gerado via Google Gemini</p>
                    </div>
                    <button onClick={() => exportParecerPdf(aiAnalysis, selectedYear)} className="text-xs font-black text-army-green border-2 border-army-green px-6 py-2 rounded-xl flex items-center gap-2 hover:bg-army-green hover:text-white transition-all shadow-sm"><Download size={16} /> EXPORTAR PDF</button>
                </div>
                <div className="prose prose-slate max-w-none prose-sm leading-relaxed text-slate-700"><ReactMarkdown>{aiAnalysis}</ReactMarkdown></div>
            </div>
        )}
      </main>
    </div>
  );
};

const ModernMetricCard = ({ title, value, icon: Icon, colorClass }: any) => (
    <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-slate-100 h-full flex flex-col justify-between hover:shadow-lg transition-all duration-300 group hover:-translate-y-1">
         <div className="flex justify-between items-start mb-6">
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest group-hover:text-army-green transition-colors">{title}</p>
            <div className={cn("p-2.5 rounded-xl shadow-sm transition-transform group-hover:scale-110", colorClass)}><Icon className="w-5 h-5" /></div>
        </div>
        <h4 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">{value}</h4>
    </div>
);

export default DeaDashboard;
