
import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

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
             if (title.toUpperCase().includes("TOTAL PAGO (LÍQUIDO)")) {
                title = "TOTAL PAGO";
             }
             const rawValue = values[index] || "";
             const isUrl = rawValue.startsWith('http');
             
             return {
              title: title,
              value: isUrl ? undefined : rawValue,
              url: isUrl ? rawValue : (urls[index] && urls[index].startsWith('http') ? urls[index] : undefined)
            };
          }).filter(item => item.title);
          
          setItems(parsedItems);
        }
      } catch (error) {
        console.error("Erro ao carregar dados da planilha:", error);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchSheet();
  }, []);

  if (loading) {
    return (
      <div className="w-full mb-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-24 bg-white rounded-lg border-t-4 border-army-gold/20 shadow-sm overflow-hidden flex flex-col items-center justify-center p-3">
             <div className="w-16 h-3 skeleton-shimmer rounded mb-2"></div>
             <div className="w-24 h-6 skeleton-shimmer rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full mb-8 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3 text-amber-700">
        <AlertCircle size={20} />
        <span className="text-xs font-bold uppercase tracking-wider">Erro ao conectar com a base de dados em tempo real.</span>
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="w-full mb-8">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {items.map((item, index) => {
          const Wrapper = item.url ? 'a' : 'div';
          
          return (
            <Wrapper 
              key={index}
              href={item.url}
              target={item.url ? "_blank" : undefined}
              rel={item.url ? "noopener noreferrer" : undefined}
              className={`
                flex flex-col items-center justify-center p-2 h-24
                bg-white rounded-lg shadow-md border-t-4 border-army-gold
                ${item.url ? 'cursor-pointer group hover:-translate-y-1 hover:shadow-xl hover:border-army-green' : 'cursor-default'}
                transition-all duration-300 ease-out text-center overflow-hidden
              `}
            >
              <span className="text-[10px] sm:text-[11px] text-slate-400 font-bold uppercase tracking-widest mb-1 line-clamp-1 group-hover:text-army-green transition-colors">
                {item.title}
              </span>
              {item.value && (
                <span className="text-sm sm:text-lg font-black text-army-green leading-tight line-clamp-1">
                  {item.value}
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
