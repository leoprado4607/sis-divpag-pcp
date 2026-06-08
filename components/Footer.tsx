
import React from 'react';
import { SYSTEM_LINKS } from '../constants';

const Footer: React.FC = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="w-full bg-army-charcoal text-white border-t border-white/5 mt-auto">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-5">

        {/* Top grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 pb-8 border-b border-white/[0.06]">

          {/* Brand */}
          <div>
            <p className="font-cormorant font-semibold text-xl text-white mb-1">Portal Div Pg Pes</p>
            <p className="text-[10px] font-medium tracking-[0.12em] uppercase text-army-gold/60 mb-3">
              Divisão de Pagamento de Pessoal · B Adm Gu Natal
            </p>
            <p className="text-sm text-white/35 leading-relaxed max-w-xs">
              Portal de Informações de Pagamento de Pessoal do Batalhão de Administração da Guarnição de Natal.
            </p>
          </div>

          {/* Systems list */}
          <div>
            <h4 className="text-[10px] font-semibold tracking-[0.14em] uppercase text-army-gold/70 mb-4">
              Sistemas
            </h4>
            <ul className="space-y-2.5">
              {SYSTEM_LINKS.map(s => (
                <li key={s.id}>
                  <span className="text-sm text-white/38 hover:text-white/70 transition-colors cursor-default">
                    {s.title.replace(/\*/g, '')}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Online status */}
          <div>
            <h4 className="text-[10px] font-semibold tracking-[0.14em] uppercase text-army-gold/70 mb-4">
              Status
            </h4>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
              <span className="text-sm text-white/50">Portal online</span>
            </div>
            <p className="text-xs text-white/25 leading-relaxed">
              Sistemas de pagamento de pessoal da Guarnição de Natal disponíveis 24h.
            </p>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-white/20">
            &copy; {year} Divisão de Pagamento de Pessoal / B Adm Gu Natal
          </p>
          <p className="text-[10px] text-white/15 tracking-widest uppercase">
            Portal Div Pg Pes
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
