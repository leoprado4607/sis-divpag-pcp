
import React, { useEffect, useState, useMemo } from 'react';
import { 
  ArrowLeft, RefreshCw, Calendar, Building, Send, 
  TrendingUp, AlertTriangle, Activity, Filter, X,
  ChevronDown, Search, Check, BarChart3, FileBarChart
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  ResponsiveContainer, Cell, ComposedChart, Legend, Tooltip as RechartsTooltip
} from 'recharts';
import { fetchDashboardData } from '../../services/sccppService';
import { DashboardData, KPIMetrics } from '../../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utilitário para classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DashboardProps {
  onBack: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onBack }) => {
  const [rawData, setRawData] = useState<DashboardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Helper para Data Atual
  const getCurrentDateInfo = () => {
    const today = new Date();
    const monthsPT = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return {
      year: today.getFullYear().toString(),
      month: monthsPT[today.getMonth()]
    };
  };

  // Estados de Filtro Global (Iniciam com Data Atual conforme solicitado)
  const [selectedYear, setSelectedYear] = useState<string>('Todos');
  const [selectedMonth, setSelectedMonth] = useState<string>('Todos');
  const [selectedOM, setSelectedOM] = useState<string>('Todas');

  // --- NOVOS ESTADOS DO GRÁFICO ---
  const [chartYear, setChartYear] = useState<string>(new Date().getFullYear().toString());
  const [chartFilterUnits, setChartFilterUnits] = useState<string[]>([]); // Filtro por Nome da Unidade
  const [isChartDropdownOpen, setIsChartDropdownOpen] = useState(false);

  // Estado de Ordenação da Tabela
  const [sortConfig, setSortConfig] = useState<{ key: keyof DashboardData | 'ratio', direction: 'asc' | 'desc' }>({
    key: 'rejeitados',
    direction: 'desc'
  });

  // Fetch Data
  const loadData = async () => {
    setLoading(true);
    const data = await fetchDashboardData();
    setRawData(data);
    setLastUpdated(new Date());
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    // Definir padrão inicial (Mês/Ano atual)
    const { year, month } = getCurrentDateInfo();
    setSelectedYear(year);
    setSelectedMonth(month);
    setChartYear(year); // Sincroniza o ano do gráfico com o ano atual inicialmente

    // Polling a cada 60s, mas só recarrega quando a aba está visível — evita
    // rebaixar a planilha inteira indefinidamente em abas abandonadas em segundo plano.
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadData();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // --- Lógica de Dados ---

  // Listas para Dropdowns
  const years = useMemo(() => Array.from(new Set(rawData.map(d => d.ano))).sort().reverse(), [rawData]);
  const months = useMemo(() => Array.from(new Set(rawData.map(d => d.mes))), [rawData]);
  const oms = useMemo(() => Array.from(new Set(rawData.map(d => d.om))).sort(), [rawData]);
  
  // Filtragem Global (KPIs e Tabela)
  const filteredData = useMemo(() => {
    return rawData.filter(item => {
      const matchYear = selectedYear === 'Todos' || item.ano === selectedYear;
      const matchMonth = selectedMonth === 'Todos' || item.mes === selectedMonth;
      const matchOM = selectedOM === 'Todas' || item.om === selectedOM;
      return matchYear && matchMonth && matchOM;
    });
  }, [rawData, selectedYear, selectedMonth, selectedOM]);

  // KPIs
  const kpis: KPIMetrics = useMemo(() => {
    const totalEnviados = filteredData.reduce((acc, curr) => acc + curr.enviados, 0);
    const totalRejeitados = filteredData.reduce((acc, curr) => acc + curr.rejeitados, 0);
    const uniqueMonths = new Set(filteredData.map(d => `${d.mes}/${d.ano}`)).size || 1;
    const uniqueOMs = new Set(filteredData.map(d => d.om)).size;

    return {
      mesesAnalisados: uniqueMonths,
      totalOmAnalisadas: uniqueOMs,
      totalEnviados,
      mediaEnviados: Math.round(totalEnviados / uniqueMonths),
      totalRejeitados,
      mediaRejeitados: Math.round(totalRejeitados / uniqueMonths)
    };
  }, [filteredData]);

  // --- LÓGICA DO GRÁFICO (REFORMULADA) ---
  const chartData = useMemo(() => {
    // 1. Array fixo de meses para garantir ordem cronológica no Eixo X
    const monthsOrder = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    // Inicializa estrutura zerada
    const monthlyData = monthsOrder.map(m => ({
      name: m,
      enviados: 0,
      rejeitados: 0
    }));

    rawData.forEach(item => {
      // Filtro de Ano do Gráfico
      if (item.ano !== chartYear) return;

      // Filtro de Unidade (Se houver seleção)
      if (chartFilterUnits.length > 0 && !chartFilterUnits.includes(item.om)) return;

      const monthIndex = monthsOrder.indexOf(item.mes);
      if (monthIndex >= 0) {
        monthlyData[monthIndex].enviados += item.enviados;
        monthlyData[monthIndex].rejeitados += item.rejeitados;
      }
    });

    return monthlyData;
  }, [rawData, chartYear, chartFilterUnits]);

  // Tabela Ordenada
  const sortedTableData = useMemo(() => {
    let dataToSort = [...filteredData];
    
    // Agrupa por OM se a visualização for "Todas"
    if (selectedOM === 'Todas') {
      const groupedByOM = filteredData.reduce((acc, curr) => {
        if (!acc[curr.om]) {
            acc[curr.om] = { ...curr, enviados: 0, rejeitados: 0 };
        }
        acc[curr.om].enviados += curr.enviados;
        acc[curr.om].rejeitados += curr.rejeitados;
        return acc;
      }, {} as Record<string, DashboardData>);
      dataToSort = Object.values(groupedByOM);
    }

    return dataToSort.sort((a, b) => {
      let aValue: any = a[sortConfig.key as keyof DashboardData];
      let bValue: any = b[sortConfig.key as keyof DashboardData];

      if (sortConfig.key === 'ratio') {
        aValue = a.enviados ? (a.rejeitados / a.enviados) : 0;
        bValue = b.enviados ? (b.rejeitados / b.enviados) : 0;
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortConfig, selectedOM]);

  const handleSort = (key: keyof DashboardData | 'ratio') => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const toggleChartUnit = (om: string) => {
    setChartFilterUnits(prev => 
      prev.includes(om) ? prev.filter(c => c !== om) : [...prev, om]
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-slate-800 flex flex-col">
      
      {/* HEADER UNIFICADO PADRÃO PORTAL */}
      <header className="bg-army-green text-white shadow-xl border-b-[6px] border-army-gold sticky top-0 z-50">
        <div className="absolute inset-0 opacity-10 pointer-events-none" 
             style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}>
        </div>
        
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors flex-shrink-0" title="Voltar ao Menu">
              <ArrowLeft className="w-6 h-6 text-army-gold" />
            </button>
            <div className="flex items-center gap-3 overflow-hidden">
               <Activity className="w-10 h-10 text-white opacity-90" />
               <div className="text-left min-w-0">
                 <h1 className="text-lg md:text-xl font-montserrat font-bold leading-none tracking-tight truncate">FIP/FAP - SIPPES/SIAPPES</h1>
                 <p className="text-army-gold text-[10px] md:text-xs font-bold tracking-widest uppercase mt-1 truncate">Divisão de Pagamento de Pessoal</p>
               </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
             <div className="text-right hidden md:block mr-2 border-r border-white/20 pr-4">
                <span className="text-[10px] text-gray-300 block uppercase font-medium">Última atualização</span>
                <span className="text-xs font-mono font-bold text-white">
                  {lastUpdated?.toLocaleString('pt-BR') || '--/--/----'}
                </span>
             </div>
             
             <button 
                onClick={loadData} 
                disabled={loading}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all"
                title="Atualizar Dados"
             >
               <RefreshCw className={cn("w-5 h-5", loading && "animate-spin")} />
             </button>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-[1600px] mx-auto px-4 py-8 space-y-6 animate-fade-in-up w-full">
        
        {/* BARRA DE FILTROS MODERNA */}
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-slate-200 flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between">
            <div className="flex items-center gap-3 text-army-green font-bold text-sm uppercase tracking-wide">
                <div className="p-2 bg-army-green/10 rounded-lg">
                  <Filter className="w-5 h-5" />
                </div>
                <span>Filtros de Análise (Tabela)</span>
            </div>
            
            <div className="flex flex-col md:flex-row gap-4 flex-1 w-full lg:w-auto justify-end">
                <ModernSelect 
                  value={selectedYear} 
                  onChange={setSelectedYear} 
                  options={['Todos', ...years]} 
                  label="Ano"
                  fullWidth
                />
                <ModernSelect 
                  value={selectedMonth} 
                  onChange={setSelectedMonth} 
                  options={['Todos', ...months]} 
                  label="Mês"
                  fullWidth
                />
                <div className="flex-1 lg:flex-none md:min-w-[250px]">
                  <ModernSelect 
                    value={selectedOM} 
                    onChange={setSelectedOM} 
                    options={['Todas', ...oms]} 
                    label="OM"
                    fullWidth
                  />
                </div>

                {(selectedYear !== 'Todos' || selectedMonth !== 'Todos' || selectedOM !== 'Todas') && (
                    <button 
                        onClick={() => { setSelectedYear('Todos'); setSelectedMonth('Todos'); setSelectedOM('Todas'); }}
                        className="flex items-center justify-center gap-2 text-xs font-bold text-red-600 hover:text-white hover:bg-red-600 px-4 py-3 md:py-2 rounded-lg transition-all border border-red-200 hover:border-red-600 uppercase tracking-wider w-full md:w-auto"
                    >
                        <X className="w-3 h-3" /> Limpar
                    </button>
                )}
            </div>
        </div>

        {/* CARDS KPI MODERNIZADOS */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
            <ModernMetricCard 
              title="Meses Analisados" 
              value={kpis.mesesAnalisados} 
              icon={Calendar} 
              colorClass="text-blue-600 bg-blue-50"
            />
            <ModernMetricCard 
              title="OMs Analisadas" 
              value={kpis.totalOmAnalisadas} 
              icon={Building} 
              colorClass="text-purple-600 bg-purple-50"
            />
            <ModernMetricCard 
              title="Total Enviados" 
              value={kpis.totalEnviados} 
              icon={Send} 
              colorClass="text-army-green bg-green-50"
            />
            <ModernMetricCard 
              title="Média Env. Mensal" 
              value={kpis.mediaEnviados} 
              icon={TrendingUp} 
              colorClass="text-slate-500 bg-slate-100"
            />
            <ModernMetricCard 
              title="Total Rejeitados" 
              value={kpis.totalRejeitados} 
              icon={AlertTriangle} 
              colorClass="text-red-600 bg-red-50"
            />
            <ModernMetricCard 
              title="Média Rej. Mensal" 
              value={kpis.mediaRejeitados} 
              icon={Activity} 
              colorClass="text-amber-600 bg-amber-50"
            />
        </div>

        {/* GRID PRINCIPAL: 2/3 (Gráfico) / 1/3 (Tabela) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-auto lg:h-[600px]">
            
            {/* GRÁFICO (Lado Esquerdo - Maior) */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full lg:col-span-2">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 border-b border-slate-100 pb-4 gap-4">
                   <div>
                     <h3 className="text-lg font-bold text-army-green flex items-center gap-2 font-montserrat">
                        <FileBarChart className="w-5 h-5 text-army-gold" /> Evolução
                     </h3>
                     <p className="text-xs text-slate-400 mt-1">Índices de rejeição</p>
                   </div>
                   
                   {/* Filtros do Gráfico */}
                   <div className="flex gap-2 w-full md:w-auto">
                      
                      {/* Seletor de ANO do Gráfico */}
                      <div className="relative group min-w-[100px]">
                        <select 
                            value={chartYear}
                            onChange={(e) => setChartYear(e.target.value)}
                            className="appearance-none w-full bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-bold rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:border-army-green cursor-pointer hover:bg-slate-100"
                        >
                            {years.map(y => <option key={y} value={y}>Ano: {y}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2 top-2.5 w-3 h-3 text-slate-400 pointer-events-none" />
                      </div>

                      {/* Seletor de UNIDADES do Gráfico */}
                      <div className="relative w-full md:w-auto">
                        <button 
                          onClick={() => setIsChartDropdownOpen(!isChartDropdownOpen)}
                          className={`flex items-center justify-between gap-2 text-[10px] font-bold px-3 py-2 rounded-lg transition-all shadow-sm w-full md:w-auto border ${chartFilterUnits.length > 0 ? 'bg-army-green text-white border-army-green' : 'bg-white border-slate-200 text-slate-600 hover:border-army-gold'}`}
                        >
                          <div className="flex items-center gap-2">
                            <Search className="w-3 h-3" />
                            {chartFilterUnits.length > 0 ? `${chartFilterUnits.length} Unidades` : 'Filtrar Unidades'}
                          </div>
                          <ChevronDown className="w-3 h-3 ml-1" />
                        </button>

                        {isChartDropdownOpen && (
                          <div className="absolute right-0 top-full mt-2 w-full md:w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 p-2 max-h-60 overflow-y-auto custom-scrollbar animate-fade-in">
                            <div className="px-3 py-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100 mb-2">
                                Selecione para visualizar
                            </div>
                            <button
                                onClick={() => setChartFilterUnits([])}
                                className="w-full text-left px-3 py-2 text-xs rounded-lg flex items-center justify-between transition-colors mb-1 font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                            >
                              <span>Todas as Unidades</span>
                              {chartFilterUnits.length === 0 && <Check className="w-3 h-3 text-army-green" />}
                            </button>
                            {oms.map(om => (
                              <button
                                key={om}
                                onClick={() => toggleChartUnit(om)}
                                className={cn(
                                  "w-full text-left px-3 py-2 text-xs rounded-lg flex items-center justify-between transition-colors mb-1 font-medium",
                                  chartFilterUnits.includes(om) ? "bg-army-green/10 text-army-green" : "hover:bg-slate-50 text-slate-600"
                                )}
                              >
                                <span className="truncate">{om}</span>
                                {chartFilterUnits.includes(om) && <Check className="w-3 h-3 text-army-green" />}
                              </button>
                            ))}
                          </div>
                        )}
                        {isChartDropdownOpen && (
                          <div className="fixed inset-0 z-40" onClick={() => setIsChartDropdownOpen(false)}></div>
                        )}
                      </div>
                   </div>
                </div>

                <div className="flex-1 w-full min-h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis 
                              dataKey="name" 
                              stroke="#94a3b8" 
                              fontSize={10} 
                              tickLine={false} 
                              axisLine={false}
                              dy={10}
                              tick={{fontWeight: 600}}
                              interval={0} // Show all months
                            />
                            <YAxis 
                              stroke="#94a3b8" 
                              fontSize={10} 
                              tickLine={false} 
                              axisLine={false} 
                            />
                            <RechartsTooltip 
                                contentStyle={{ 
                                  backgroundColor: '#fff', 
                                  borderRadius: '12px', 
                                  border: 'none', 
                                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' 
                                }}
                                itemStyle={{ fontSize: '12px', fontWeight: 600, color: '#1e293b' }}
                            />
                            <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '10px' }} iconType="circle" />
                            
                            {/* CURVA 1: ENVIADOS (VERDE) */}
                            <Line 
                              type="monotone" 
                              dataKey="enviados" 
                              name="Enviados" 
                              stroke="#16a34a" 
                              strokeWidth={3}
                              dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                              activeDot={{ r: 6 }}
                            />

                            {/* CURVA 2: REJEITADOS (VERMELHO) */}
                            <Line 
                              type="monotone" 
                              dataKey="rejeitados" 
                              name="Rejeitados" 
                              stroke="#dc2626" 
                              strokeWidth={3}
                              dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                              activeDot={{ r: 6 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* TABELA DE RANKING (Lado Direito - Menor) */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden relative border-t-4 border-t-army-green lg:col-span-1">
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center bg-slate-50/50 gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-army-green flex items-center gap-2 font-montserrat">
                          <BarChart3 className="w-5 h-5 text-army-gold" /> Ranking
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">Top ofensores por volume</p>
                    </div>

                    {/* Botões de Filtro LOCALIZADOS no card de Ranking */}
                    <div className="flex items-center gap-2">
                         <div className="relative group">
                            <select 
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(e.target.value)}
                                className="appearance-none bg-white border border-slate-200 text-slate-600 text-[10px] font-bold rounded-lg pl-3 pr-8 py-1.5 focus:outline-none focus:border-army-green cursor-pointer hover:bg-slate-50"
                            >
                                <option value="Todos">Ano: Todos</option>
                                {years.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2 top-2 w-3 h-3 text-slate-400 pointer-events-none" />
                         </div>
                         <div className="relative group">
                            <select 
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(e.target.value)}
                                className="appearance-none bg-white border border-slate-200 text-slate-600 text-[10px] font-bold rounded-lg pl-3 pr-8 py-1.5 focus:outline-none focus:border-army-green cursor-pointer hover:bg-slate-50"
                            >
                                <option value="Todos">Mês: Todos</option>
                                {months.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2 top-2 w-3 h-3 text-slate-400 pointer-events-none" />
                         </div>
                    </div>
                </div>
                
                <div className="flex-1 overflow-auto custom-scrollbar">
                    <table className="w-full text-sm text-left border-collapse table-fixed">
                        <thead className="text-[10px] text-slate-500 uppercase bg-slate-50 sticky top-0 z-10 shadow-sm font-bold">
                            <tr>
                                <th className="px-1 py-3 w-[30px] text-center">#</th>
                                <th className="px-2 py-3 cursor-pointer hover:text-army-green transition-colors" onClick={() => handleSort('om')}>
                                  Unidade
                                </th>
                                <th className="px-1 py-3 w-[55px] text-right cursor-pointer hover:text-green-600 transition-colors" onClick={() => handleSort('enviados')}>
                                  Env.
                                </th>
                                <th className="px-1 py-3 w-[50px] text-right cursor-pointer hover:text-red-600 transition-colors" onClick={() => handleSort('rejeitados')}>
                                  Rej.
                                </th>
                                <th className="px-1 py-3 w-[55px] text-right cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('ratio')}>
                                  %
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {sortedTableData.length > 0 ? (
                                sortedTableData.map((row, index) => {
                                    const ratio = row.enviados > 0 ? (row.rejeitados / row.enviados) * 100 : 0;
                                    return (
                                        <tr key={index} className="hover:bg-slate-50 transition-colors group">
                                            <td className="px-1 py-2 text-center">
                                                {index === 0 ? (
                                                <div className="w-5 h-5 bg-army-gold text-white rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm mx-auto">1</div>
                                                ) : index === 1 ? (
                                                <div className="w-5 h-5 bg-slate-400 text-white rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm mx-auto">2</div>
                                                ) : index === 2 ? (
                                                <div className="w-5 h-5 bg-orange-700 text-white rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm mx-auto">3</div>
                                                ) : (
                                                <span className="text-slate-300 font-bold text-xs">{index + 1}</span>
                                                )}
                                            </td>
                                            <td className="px-2 py-2 font-medium text-slate-700 overflow-hidden">
                                                <div className="flex flex-col">
                                                    <span className="truncate text-xs font-bold text-slate-800" title={row.om}>{row.om}</span>
                                                </div>
                                            </td>
                                            <td className="px-1 py-2 text-right">
                                                <span className="font-mono text-[10px] text-slate-500 font-bold">
                                                {row.enviados.toLocaleString('pt-BR')}
                                                </span>
                                            </td>
                                            <td className="px-1 py-2 text-right">
                                                <span className="font-bold text-red-600 bg-red-50 px-1 py-0.5 rounded text-[10px] border border-red-100">
                                                {row.rejeitados.toLocaleString('pt-BR')}
                                                </span>
                                            </td>
                                            <td className="px-1 py-2 text-right">
                                                <div className="flex flex-col items-end">
                                                <span className="text-slate-600 text-[10px] font-bold">{ratio.toFixed(1)}%</span>
                                                <div className="w-full bg-slate-100 h-1 mt-0.5 rounded-full overflow-hidden">
                                                    <div className={`h-full rounded-full ${ratio > 10 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(ratio, 100)}%` }}></div>
                                                </div>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={5} className="py-8 text-center text-slate-400 text-xs italic">
                                        Nenhum dado encontrado.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      </main>

      <footer className="w-full bg-army-light text-white py-[12px] mt-auto border-t-[4px] border-army-gold relative overflow-hidden">
        {/* Background Pattern Overlay */}
        <div className="absolute inset-0 opacity-30 pointer-events-none" 
             style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <p className="text-xs text-white/90 font-medium tracking-wide">
            &copy; {new Date().getFullYear()} Divisão de Pagamento de Pessoal / B Adm Gu Natal.
          </p>
        </div>
      </footer>
    </div>
  );
};

// --- Componentes Modernos Auxiliares ---

// 1. Modern Select
const ModernSelect = ({ value, onChange, options, label, fullWidth }: any) => (
  <div className={cn("relative group", fullWidth ? "w-full" : "min-w-[160px]")}>
    <label className="absolute -top-2 left-3 bg-white px-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider z-10 group-focus-within:text-army-green transition-colors">
      {label}
    </label>
    <div className="relative">
      <select 
        value={value} 
        onChange={e => onChange(e.target.value)}
        className="w-full appearance-none bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-army-green/20 focus:border-army-green transition-all cursor-pointer hover:border-army-gold"
      >
        {options.map((opt: string) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-slate-400 pointer-events-none group-hover:text-army-green transition-colors" />
    </div>
  </div>
);

// 2. Modern KPI Card (Estilo do DeaDashboard)
const ModernMetricCard = ({ title, value, icon: Icon, colorClass }: any) => (
    <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm border border-slate-100 hover:shadow-md hover:-translate-y-1 transition-all duration-300 group relative overflow-hidden h-full">
        <div className="flex items-start justify-between">
            <div className="flex flex-col min-w-0 z-10 pr-2">
                <p className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5 group-hover:text-army-green transition-colors truncate">
                    {title}
                </p>
                <h4 className="text-lg md:text-2xl font-bold text-slate-800 tracking-tight truncate">
                    {typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
                </h4>
            </div>
            <div className={cn("absolute top-3 right-3 p-1.5 md:static md:p-2 rounded-lg transition-colors flex-shrink-0 z-10", colorClass)}>
                <Icon className="w-3 h-3 md:w-5 md:h-5" />
            </div>
        </div>
    </div>
);

export default Dashboard;
