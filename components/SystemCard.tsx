
import React from 'react';
import { SystemLink } from '../types';

interface SystemCardProps {
  system: SystemLink;
  onNavigate?: (route: string) => void;
}

const SystemCard: React.FC<SystemCardProps> = React.memo(({ system, onNavigate }) => {
  const { title, description, url, icon: Icon, iconImage, iconImageClassName, isUnderConstruction, isRestricted, internalRoute } = system;

  const renderTitle = (text: string) => {
    if (!text.includes('*')) return text;
    return text.split('*').map((part, i) =>
      i % 2 === 1 ? <em key={i} className="not-italic font-bold text-army-gold-deep">{part}</em> : part
    );
  };

  const handleClick = (e: React.MouseEvent) => {
    if (internalRoute && onNavigate) {
      e.preventDefault();
      onNavigate(internalRoute);
    }
  };

  // Card interno é um div (o conteúdo em bloco não cabe em <button>): precisa
  // de tabIndex e de Enter/Espaço para funcionar pelo teclado.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (internalRoute && onNavigate && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onNavigate(internalRoute);
    }
  };

  const Wrapper = internalRoute ? 'div' : 'a';
  const wrapperProps = internalRoute
    ? { onClick: handleClick, onKeyDown: handleKeyDown, role: 'button' as const, tabIndex: 0 }
    : { href: url, target: "_blank" as const, rel: "noopener noreferrer" };

  return (
    <Wrapper
      {...(wrapperProps as any)}
      className="group relative flex flex-col bg-white border border-army-green/8 hover:border-army-gold/40
                 transition-colors duration-300 overflow-hidden
                 cursor-pointer h-full"
    >
      {/* Bottom accent line that grows on hover */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-army-green scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-300" />

      {/* Construction badge */}
      {isUnderConstruction && (
        <div className="absolute top-3 right-3 bg-red-50 text-red-500 text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 border border-red-200 z-10">
          Em construção
        </div>
      )}

      {/* Restricted badge */}
      {isRestricted && (
        <div className="absolute top-3 right-3 bg-red-50 text-red-600 text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 border border-red-200 z-10">
          Restrito
        </div>
      )}

      <div className="p-5 flex flex-col flex-grow">
        {/* Icon + title row */}
        <div className={`flex items-center gap-4 mb-3 ${isRestricted || isUnderConstruction ? 'pr-20' : ''}`}>
          <div className="inline-flex shrink-0 p-2.5 bg-army-cream border border-army-green/10 group-hover:bg-army-green/5 transition-colors">
            {iconImage ? (
              <img src={iconImage} alt="" className={`${iconImageClassName || 'w-7 h-7'} object-contain`} />
            ) : (
              <Icon size={24} className="text-army-green" />
            )}
          </div>
          <h3 className="font-cormorant font-semibold text-lg leading-snug text-army-charcoal
                         group-hover:text-army-green transition-colors">
            {renderTitle(title)}
          </h3>
        </div>

        {/* Description */}
        <p className="text-sm text-army-green/75 leading-relaxed flex-grow line-clamp-2">
          {description}
        </p>
      </div>
    </Wrapper>
  );
});

SystemCard.displayName = 'SystemCard';
export default SystemCard;
