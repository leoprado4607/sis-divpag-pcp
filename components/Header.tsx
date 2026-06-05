
import React, { useState } from 'react';
import { LOGO_URL, PLACEHOLDER_LOGO } from '../constants';

interface HeaderProps {
  showExtraLogos?: boolean;
}

const EXTRA_LOGOS_DATA = [
  { url: "https://lh3.googleusercontent.com/d/1xdUw2iB9ixWETbq9B77H_Ip937CF7oh9=s160", title: "Cmdo 7ª Bda Inf Mtz (024406)" },
  { url: "https://lh3.googleusercontent.com/d/1R1agYPtBLHlI2GsW4mr6Ry_qncnEtGrA=s160", title: "17º GAC (056507)" },
  { url: "https://lh3.googleusercontent.com/d/1o8Q9KVdJnoHR-FzxH9HkwX0AiHUdQIgl=s160", title: "16º BI Mtz (007807)" },
  { url: "https://lh3.googleusercontent.com/d/15dPk1zPec-_d7t2p8fX6FTXtEPnrtVJy=s160", title: "7º BE Cmb (003004)" },
  { url: "https://lh3.googleusercontent.com/d/1N6EIH4ZgktZ0E_0SI2cx1fuiGFL4_18a=s160", title: "17ª Cia Com" },
  { url: "https://lh3.googleusercontent.com/d/1VfbwpTP92s65vPKWPFYhBV5Rv11L5FCL=s160", title: "7º Pel PE (065623)" },
  { url: "https://lh3.googleusercontent.com/d/1p2CvvRSclGlg3sLz1FzlYuoLasFKjInd=s160", title: "HGuN (061200)" }
];

const Header: React.FC<HeaderProps> = ({ showExtraLogos = false }) => {
  const [imgSrc, setImgSrc] = useState(LOGO_URL);

  return (
    <header className="w-full bg-army-green text-white shadow-xl border-b-[6px] border-army-gold sticky top-0 z-50 transition-all duration-300">
      {/* Background Pattern Overlay */}
      <div className="absolute inset-0 opacity-20 pointer-events-none select-none"
           style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-3 relative z-10">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">

          {/* Main Logo & Title */}
          <div className="flex items-center gap-4 text-left w-full lg:w-auto">
            <div className="flex-shrink-0 bg-white/5 p-1 rounded-lg backdrop-blur-sm border border-white/10">
              <img
                src={imgSrc}
                alt="Símbolo DivPag"
                className="h-[55px] w-[55px] md:h-[70px] md:w-[70px] object-contain filter drop-shadow-lg transition-transform hover:scale-105 duration-300"
                onError={() => setImgSrc(PLACEHOLDER_LOGO)}
              />
            </div>

            <div className="flex flex-col justify-center">
              <h2 className="text-army-gold font-roboto-slab font-bold text-[10px] md:text-xs tracking-[0.2em] uppercase mb-0.5 opacity-90">
                Divisão de Pagamento de Pessoal
              </h2>
              <h1 className="text-sm md:text-lg lg:text-2xl font-montserrat font-extrabold tracking-tight text-white leading-tight">
                Portal de Informações de Pagamento de Pessoal
              </h1>
            </div>
          </div>

          {/* Extra Logos (Only on Home) */}
          {showExtraLogos && (
            <div className="flex items-center gap-2 md:gap-3 flex-wrap justify-center lg:justify-end py-1 md:py-0">
              {EXTRA_LOGOS_DATA.map((item, idx) => {
                const isPelPE = item.url.includes("1VfbwpTP92s65vPKWPFYhBV5Rv11L5FCL");
                const isHGuN  = item.url.includes("1p2CvvRSclGlg3sLz1FzlYuoLasFKjInd");

                return (
                  <div key={idx} className="group relative flex flex-col items-center">
                    <div className={`
                      flex items-center justify-center transition-all duration-300 bg-white/5 rounded-full p-1 border border-white/0 hover:border-army-gold/30 hover:bg-white/10
                      ${isPelPE ? 'h-[36px] w-[36px] md:h-[50px] md:w-[50px]' :
                        isHGuN  ? 'h-[40px] w-[40px] md:h-[48px] md:w-[48px]' :
                                  'h-[34px] w-[34px] md:h-[44px] md:w-[44px]'}
                    `}>
                      <img
                        src={item.url}
                        alt={item.title}
                        className="transition-transform duration-300 opacity-80 group-hover:opacity-100 cursor-help filter drop-shadow-md w-full h-full object-contain hover:scale-110"
                        loading="lazy"
                      />
                    </div>

                    {/* Tooltip */}
                    <div className="absolute top-full mt-3 left-1/2 -translate-x-1/2 z-[100] opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 pointer-events-none">
                      <div className="relative bg-white text-army-green px-3 py-2 rounded-lg shadow-2xl border-b-2 border-army-gold whitespace-nowrap">
                        <span className="text-[10px] font-bold uppercase tracking-wider font-montserrat block">{item.title}</span>
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white transform rotate-45"></div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
