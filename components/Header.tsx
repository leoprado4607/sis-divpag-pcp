
import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { LOGO_URL, PLACEHOLDER_LOGO } from '../constants';

interface HeaderProps {
  showExtraLogos?: boolean;
  onBack?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onBack }) => {
  const [imgSrc, setImgSrc] = useState(LOGO_URL);

  return (
    <header className="w-full bg-army-green sticky top-0 z-50 border-b-2 border-army-gold">
      <div className="max-w-[1600px] mx-auto px-5 sm:px-8 lg:px-10 h-[72px] flex items-center gap-4">

        {/* Back button — sub-apps only */}
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Voltar ao portal"
            className="flex-shrink-0 flex items-center gap-1.5 text-white/45 hover:text-army-gold transition-colors text-[11px] font-medium tracking-[0.14em] uppercase mr-1"
          >
            <ArrowLeft size={13} />
            <span className="hidden sm:inline">Portal</span>
          </button>
        )}

        {/* Brand: crest + text */}
        <div className="flex items-center gap-3.5 group flex-shrink-0">
          <div className="w-[52px] h-[52px] rounded-full bg-white/[0.06] border border-army-gold/35 flex items-center justify-center flex-shrink-0 overflow-hidden transition-all duration-300 group-hover:border-army-gold/70">
            <img
              src={imgSrc}
              alt="Brasão DivPag"
              className="w-[42px] h-[42px] object-contain drop-shadow-md"
              onError={() => setImgSrc(PLACEHOLDER_LOGO)}
            />
          </div>
          <div className="leading-tight min-w-0">
            <p className="text-[9px] tracking-[0.15em] uppercase text-white/45 font-medium mb-0.5">
              Divisão de Pagamento de Pessoal
            </p>
            <p className="font-cormorant font-semibold text-[1.05rem] sm:text-[1.2rem] text-white tracking-tight leading-none truncate">
              Portal de Informações de Pagamento
            </p>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: status badge */}
        <div className="hidden sm:flex items-center gap-2 bg-white/[0.07] border border-army-gold/25 px-3.5 py-[7px] flex-shrink-0">
          <span className="w-[7px] h-[7px] rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
          <span className="text-[.7rem] text-army-gold-light tracking-[0.07em] font-medium whitespace-nowrap">
            {onBack ? 'Sub-sistema' : 'Sistema online · B Adm Gu Natal'}
          </span>
        </div>

      </div>
    </header>
  );
};

export default Header;
