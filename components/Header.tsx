
import React from 'react';
import { LOGO_URL } from '../constants';

const Header: React.FC = () => {
  return (
    <header className="w-full bg-army-green sticky top-0 z-50 border-b-2 border-army-gold">
      <div className="max-w-[1600px] mx-auto px-5 sm:px-8 lg:px-10 h-[72px] flex items-center gap-4">

        {/* Brand: crest + text */}
        <div className="flex items-center gap-3.5 group flex-shrink-0">
          <div className="w-[52px] h-[52px] rounded-full bg-white/[0.06] border border-army-gold/35 flex items-center justify-center flex-shrink-0 overflow-hidden transition-all duration-300 group-hover:border-army-gold/70">
            <img
              src={LOGO_URL}
              alt="Brasão da B Adm Gu Natal"
              width={42}
              height={42}
              className="w-[42px] h-[42px] object-contain drop-shadow-md"
            />
          </div>
          <div className="leading-tight min-w-0">
            <p className="font-playfair italic text-[15px] sm:text-[22px] text-white font-semibold whitespace-nowrap">
              Divisão de Pagamento de Pessoal
            </p>
            <p className="text-[11px] uppercase tracking-[0.14em] font-medium text-army-gold-light mt-0.5 whitespace-nowrap">
              {/* no celular o nome por extenso não cabe a 11px */}
              <span className="sm:hidden">B Adm Gu Natal</span>
              <span className="hidden sm:inline">Base Administrativa da Guarnição de Natal</span>
            </p>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: status badge */}
        <div className="hidden sm:flex items-center gap-2 bg-white/[0.07] border border-army-gold/25 px-3.5 py-[7px] flex-shrink-0">
          <span className="w-[7px] h-[7px] rounded-full bg-emerald-400 flex-shrink-0" aria-hidden="true" />
          <span className="text-xs text-army-gold-light tracking-[0.07em] font-medium whitespace-nowrap">
            Sistema on-line
          </span>
        </div>

      </div>
    </header>
  );
};

export default Header;
