
import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { LOGO_URL, PLACEHOLDER_LOGO } from '../constants';

interface HeaderProps {
  showExtraLogos?: boolean;
  onBack?: () => void;
}

const EXTRA_LOGOS_DATA = [
  { url: "https://lh3.googleusercontent.com/d/1xdUw2iB9ixWETbq9B77H_Ip937CF7oh9=s160", title: "Cmdo 7ª Bda Inf Mtz (024406)" },
  { url: "https://lh3.googleusercontent.com/d/1R1agYPtBLHlI2GsW4mr6Ry_qncnEtGrA=s160", title: "17º GAC (056507)" },
  { url: "https://lh3.googleusercontent.com/d/1o8Q9KVdJnoHR-FzxH9HkwX0AiHUdQIgl=s160", title: "16º BI Mtz (007807)" },
  { url: "https://lh3.googleusercontent.com/d/15dPk1zPec-_d7p8fX6FTXtEPnrtVJy=s160", title: "7º BE Cmb (003004)" },
  { url: "https://lh3.googleusercontent.com/d/1N6EIH4ZgktZ0E_0SI2cx1fuiGFL4_18a=s160", title: "17ª Cia Com" },
  { url: "https://lh3.googleusercontent.com/d/1VfbwpTP92s65vPKWPFYhBV5Rv11L5FCL=s160", title: "7º Pel PE (065623)" },
  { url: "https://lh3.googleusercontent.com/d/1p2CvvRSclGlg3sLz1FzlYuoLasFKjInd=s160", title: "HGuN (061200)" }
];

const Header: React.FC<HeaderProps> = ({ showExtraLogos = false, onBack }) => {
  const [imgSrc, setImgSrc] = useState(LOGO_URL);

  return (
    <header className="w-full bg-army-green text-white sticky top-0 z-50 border-b-2 border-army-gold">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between gap-4">

          {/* Left: back button (sub-apps) OR logo+title (home) */}
          <div className="flex items-center gap-4 min-w-0">
            {onBack && (
              <button
                onClick={onBack}
                className="flex-shrink-0 flex items-center gap-1.5 text-white/60 hover:text-army-gold transition-colors text-xs font-medium tracking-wide uppercase mr-1"
              >
                <ArrowLeft size={15} />
                <span className="hidden sm:inline">Portal</span>
              </button>
            )}

            {/* Logo */}
            <div className="flex-shrink-0 bg-white/5 p-1 rounded-lg border border-white/10">
              <img
                src={imgSrc}
                alt="Símbolo DivPag"
                className="h-[50px] w-[50px] md:h-[64px] md:w-[64px] object-contain filter drop-shadow-lg transition-transform hover:scale-105 duration-300"
                onError={() => setImgSrc(PLACEHOLDER_LOGO)}
              />
            </div>

            {/* Title block */}
            <div className="flex flex-col justify-center min-w-0">
              <p className="text-army-gold font-sans font-medium text-[9px] md:text-[10px] tracking-[0.2em] uppercase mb-0.5 opacity-90">
                Divisão de Pagamento de Pessoal
              </p>
              <h1 className="font-cormorant font-semibold text-base md:text-xl lg:text-2xl tracking-tight text-white leading-tight truncate">
                Portal de Informações de Pagamento de Pessoal
              </h1>
            </div>
          </div>

          {/* Right: unit logos (home) OR system badge (sub-apps) */}
          {showExtraLogos && (
            <div className="flex items-center gap-2 md:gap-3 flex-wrap justify-end py-1">
              {EXTRA_LOGOS_DATA.map((item, idx) => {
                const isPelPE = item.url.includes("1VfbwpTP92s65vPKWPFYhBV5Rv11L5FCL");
                const isHGuN  = item.url.includes("1p2CvvRSclGlg3sLz1FzlYuoLasFKjInd");
                return (
                  <div key={idx} className="group relative flex flex-col items-center">
                    <div className={`
                      flex items-center justify-center transition-all duration-300 bg-white/5 rounded-full p-1
                      border border-white/0 hover:border-army-gold/40 hover:bg-white/10
                      ${isPelPE ? 'h-[36px] w-[36px] md:h-[50px] md:w-[50px]' :
                        isHGuN  ? 'h-[40px] w-[40px] md:h-[48px] md:w-[48px]' :
                                  'h-[34px] w-[34px] md:h-[44px] md:w-[44px]'}
                    `}>
                      <img
                        src={item.url}
                        alt={item.title}
                        className="w-full h-full object-contain opacity-80 group-hover:opacity-100 transition-all duration-300 hover:scale-110 cursor-help filter drop-shadow-md"
                        loading="lazy"
                      />
                    </div>
                    {/* Tooltip */}
                    <div className="absolute top-full mt-3 left-1/2 -translate-x-1/2 z-[100] opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 pointer-events-none">
                      <div className="relative bg-white text-army-green px-3 py-2 rounded-lg shadow-2xl border-b-2 border-army-gold whitespace-nowrap">
                        <span className="text-[10px] font-bold uppercase tracking-wider font-montserrat block">{item.title}</span>
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white transform rotate-45" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!showExtraLogos && !onBack && (
            <div className="hidden md:flex items-center gap-1.5 text-[9px] font-medium tracking-[0.12em] uppercase text-white/40">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              B Adm Gu Natal
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
