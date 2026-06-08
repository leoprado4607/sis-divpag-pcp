
import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

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

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="w-full bg-army-charcoal border-b border-white/5">
        <div className="max-w-[1600px] mx-auto grid grid-cols-3 sm:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-4 py-3.5 border-r border-white/[0.06] last:border-r-0">
              <div className="h-2 bg-white/8 rounded mb-2 w-16 skeleton-shimmer" />
              <div className="h-4 bg-white/10 rounded w-20 skeleton-shimmer" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── Error state ── */
  if (error) {
    return (
      <div className="w-full bg-army-charcoal border-b border-white/5">
        <div className="flex items-center justify-center gap-2 py-3 px-4">
          <AlertCircle size={13} className="text-amber-400 flex-shrink-0" />
          <span className="text-[11px] font-medium text-amber-400/80 uppercase tracking-widest">
            Erro ao carregar dados em tempo real
          </span>
        </div>
      </div>
    );
  }

  if (items.length === 0) return null;

  /* ── Data state ── */
  return (
    <div className="w-full bg-army-charcoal border-b border-army-gold/15">
      <div className="max-w-[1600px] mx-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const CellWrapper = item.url ? 'a' : 'div';
          return (
            <CellWrapper
              key={index}
              href={item.url}
              target={item.url ? "_blank" : undefined}
              rel={item.url ? "noopener noreferrer" : undefined}
              className={`
                group px-4 py-3.5 text-center
                border-r border-white/[0.06] ${isLast ? 'border-r-0' : ''}
                ${item.url ? 'cursor-pointer hover:bg-white/5 transition-colors' : ''}
              `}
            >
              <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-white/30 mb-1 line-clamp-1">
                {item.title}
              </p>
              {item.value && (
                <p className="text-sm font-bold text-white leading-none line-clamp-1
                              group-hover:text-army-gold transition-colors">
                  {item.value}
                </p>
              )}
              {item.url && !item.value && (
                <p className="text-[11px] font-semibold text-army-gold/70 group-hover:text-army-gold transition-colors">
                  Acessar →
                </p>
              )}
            </CellWrapper>
          );
        })}
      </div>
    </div>
  );
};

export default QuickLinks;
