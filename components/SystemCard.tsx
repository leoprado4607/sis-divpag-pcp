
import React from 'react';
import { ExternalLink, ArrowRight } from 'lucide-react';
import { SystemLink } from '../types';

interface SystemCardProps {
  system: SystemLink;
  onNavigate?: (route: string) => void;
}

const SystemCard: React.FC<SystemCardProps> = React.memo(({ system, onNavigate }) => {
  const { title, description, url, icon: Icon, iconImage, isUnderConstruction, internalRoute } = system;

  const renderTitle = (text: string) => {
    if (!text.includes('*')) return text;
    return text.split('*').map((part, i) =>
      i % 2 === 1 ? <em key={i} className="not-italic font-bold text-army-gold">{part}</em> : part
    );
  };

  const handleClick = (e: React.MouseEvent) => {
    if (internalRoute && onNavigate) {
      e.preventDefault();
      onNavigate(internalRoute);
    }
  };

  const Wrapper = internalRoute ? 'div' : 'a';
  const wrapperProps = internalRoute
    ? { onClick: handleClick, role: 'button' as const }
    : { href: url, target: "_blank" as const, rel: "noopener noreferrer" };

  return (
    <Wrapper
      {...(wrapperProps as any)}
      className="group relative flex flex-col bg-white border border-army-green/8 hover:border-army-gold/40
                 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden
                 cursor-pointer h-full"
    >
      {/* Bottom accent line that grows on hover */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-army-green scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-300" />

      {/* Construction badge */}
      {isUnderConstruction && (
        <div className="absolute top-3 right-3 bg-red-50 text-red-500 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 border border-red-200 z-10">
          Em construção
        </div>
      )}

      <div className="p-5 flex flex-col flex-grow">
        {/* Icon + number row */}
        <div className="flex items-start justify-between mb-4">
          <div className="inline-flex p-2.5 bg-army-cream border border-army-green/10 group-hover:bg-army-green/5 transition-colors">
            {iconImage ? (
              <img src={iconImage} alt="" className="w-7 h-7 object-contain" />
            ) : (
              <Icon size={24} className="text-army-green" />
            )}
          </div>
        </div>

        {/* Title */}
        <h3 className="font-cormorant font-semibold text-[1.15rem] leading-snug text-army-charcoal mb-1.5
                       group-hover:text-army-green transition-colors">
          {renderTitle(title)}
        </h3>

        {/* Description */}
        <p className="text-sm text-army-green/55 leading-relaxed flex-grow line-clamp-2">
          {description}
        </p>

        {/* CTA */}
        <div className="mt-4 flex items-center gap-1.5 text-[11px] font-semibold text-army-gold
                        uppercase tracking-[0.08em] group-hover:gap-3 transition-all duration-200">
          <span>Acessar</span>
          {internalRoute
            ? <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
            : <ExternalLink size={12} />
          }
        </div>
      </div>
    </Wrapper>
  );
});

SystemCard.displayName = 'SystemCard';
export default SystemCard;
