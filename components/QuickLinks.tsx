
import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle, TrendingUp } from 'lucide-react';

interface QuickLinkItem {
  title: string;
  value?: string;
  url?: string;
}

const QuickLinks: React.FC = () => {
  const [items, setItems] = useState<QuickLinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchSheet = async () => {
      try {
        const csvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQdDFMSydOAXDTnthTO6iwQMbaAEPD6ZLwCwpnj0Y3g2UlJkOmJ-Sue2HpI6JnqNLwkaIQbBt4PPdZ5/pub?gid=670175073&single=true&output=csv";
        const response = await fetch(csvUrl);
        if (!response.ok) throw new Error("Network response error");
        const text = await response.text();
        const rows = text.split(/\r?\n/);

        if (rows.length > 0) {
          const parseCSVLine = (line: string) => {
            const pattern = /(".*?"|[^",]+)(?=\s*,|\s*$)/g;
            return (line.match(pattern) || []).map(val => val.replace(/^"|"$/g, '').trim());
          };

          const titles = parseCSVLine(rows[0]);
          const values = rows.length > 1 ? parseCSVLine(rows[1]) : [];
          const urls = rows.length > 2 ? parseCSVLine(rows[2]) : [];

          const parsedItems = titles.map((t, index) => {
            let title = t;
            if (title.toUpperCase().includes("TOTAL PAGO (LÍQUIDO)")) title = "TOTAL PAGO";
            const rawValue = values[index] || "";
            const isUrl = rawValue.startsWith('http');
            return {
              title,
              value: isUrl ? undefined : rawValue,
              url: isUrl ? rawValue : (urls[index]?.startsWith('http') ? urls[index] : undefined),
            };
          }).filter(item => item.title);

          setItems(parsedItems);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchSheet();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-army-green/60">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-xs font-medium uppercase tracking-widest">Carregando dados...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 justify-center py-4 text-amber-600">
        <AlertCircle size={16} />
        <span className="text-xs font-bold uppercase tracking-wider">Erro ao carregar dados em tempo real</span>
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="w-full mb-10">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={14} className="text-army-gold" />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Indicadores em tempo real</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {items.map((item, index) => {
          const Wrapper = item.url ? 'a' : 'div';
          return (
            <Wrapper
              key={index}
              href={item.url}
              target={item.url ? "_blank" : undefined}
              rel={item.url ? "noopener noreferrer" : undefined}
              className={`
                relative flex flex-col items-center justify-center p-3 rounded-xl
                bg-white border border-slate-100 shadow-sm
                ${item.url ? 'cursor-pointer hover:border-army-gold/60 hover:shadow-md hover:-translate-y-0.5 group' : ''}
                transition-all duration-200
              `}
            >
              <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl bg-gradient-to-r from-army-green via-army-gold to-army-blue opacity-60" />
              <span className={`text-[9px] font-bold uppercase tracking-widest mb-1.5 line-clamp-1 text-center transition-colors ${item.url ? 'text-slate-400 group-hover:text-army-green' : 'text-slate-400'}`}>
                {item.title}
              </span>
              {item.value && (
                <span className="text-base font-black text-army-green leading-none line-clamp-1">
                  {item.value}
                </span>
              )}
              {item.url && !item.value && (
                <span className={`text-[10px] font-bold transition-colors ${item.url ? 'text-army-blue group-hover:text-army-green' : 'text-army-blue'}`}>
                  Acessar →
                </span>
              )}
            </Wrapper>
          );
        })}
      </div>
    </div>
  );
};

export default QuickLinks;
