
import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle, TrendingUp } from 'lucide-react';

interface QuickLinkItem {
  title: string;
  value?: string;
  url?: string;
}

const CACHE_KEY = 'sipp_quicklinks_cache';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

const QuickLinks: React.FC = () => {
  const [items, setItems] = useState<QuickLinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let hadCache = false;
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        if (Array.isArray(cached.items) && Date.now() - cached.ts < CACHE_TTL_MS) {
          setItems(cached.items);
          setLoading(false);
          hadCache = true;
        }
      }
    } catch { /* cache inválido: ignora */ }

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
          const urls   = rows.length > 2 ? parseCSVLine(rows[2]) : [];

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
          try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({ items: parsedItems, ts: Date.now() }));
          } catch { /* storage indisponível */ }
        }
      } catch {
        if (!hadCache) setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchSheet();
  }, []);

  return (
    <section className="bg-white px-4 sm:px-6 lg:px-8 py-10 border-b border-army-green/8">
      <div className="max-w-[1600px] mx-auto">

        {/* Section label */}
        <div className="flex items-center gap-4 mb-6">
          <div className="h-px flex-grow bg-army-green/15" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-army-gold whitespace-nowrap">
            Dados de Pagamento
          </span>
          <div className="h-px flex-grow bg-army-green/15" />
        </div>

        {/* ── Loading state ── */}
        {loading && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-px bg-army-green/8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white p-5 flex flex-col gap-3">
                <div className="h-2 bg-army-green/10 rounded w-16 animate-pulse" />
                <div className="h-5 bg-army-green/10 rounded w-20 animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {/* ── Error state ── */}
        {!loading && error && (
          <div className="flex items-center justify-center gap-2 py-6">
            <AlertCircle size={14} className="text-amber-600 flex-shrink-0" />
            <span className="text-[11px] font-medium text-amber-600/80 uppercase tracking-widest">
              Erro ao carregar dados em tempo real
            </span>
          </div>
        )}

        {/* ── Cards ── */}
        {!loading && !error && items.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-px bg-army-green/8">
            {items.map((item, index) => {
              const Wrapper = item.url ? 'a' : 'div';
              return (
                <Wrapper
                  key={index}
                  href={item.url}
                  target={item.url ? "_blank" : undefined}
                  rel={item.url ? "noopener noreferrer" : undefined}
                  className={`
                    group relative flex flex-col bg-white overflow-hidden
                    ${item.url ? 'cursor-pointer hover:border-army-gold/40 hover:shadow-md hover:-translate-y-0.5' : ''}
                    transition-all duration-300
                  `}
                >
                  {/* Bottom accent line */}
                  <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-army-green scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-300" />

                  <div className="p-5 flex flex-col flex-grow">
                    {/* Icon */}
                    <div className="inline-flex p-2 bg-army-cream border border-army-green/10 mb-3 self-start
                                    group-hover:bg-army-green/5 transition-colors">
                      <TrendingUp size={16} className="text-army-green/50" />
                    </div>

                    {/* Label */}
                    <p className="text-[9px] font-semibold tracking-[0.14em] uppercase text-army-green/40 mb-1.5 line-clamp-2 leading-relaxed">
                      {item.title}
                    </p>

                    {/* Value */}
                    {item.value && (
                      <p className="font-cormorant font-semibold text-[1.2rem] leading-tight text-army-charcoal
                                    group-hover:text-army-green transition-colors whitespace-nowrap overflow-hidden text-ellipsis mt-auto">
                        {item.value}
                      </p>
                    )}

                    {/* Link CTA */}
                    {item.url && !item.value && (
                      <p className="text-[11px] font-semibold text-army-gold group-hover:text-army-gold-light transition-colors mt-auto uppercase tracking-[0.08em]">
                        Acessar →
                      </p>
                    )}
                  </div>
                </Wrapper>
              );
            })}
          </div>
        )}

      </div>
    </section>
  );
};

export default QuickLinks;
