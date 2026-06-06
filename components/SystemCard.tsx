
import React from 'react';
import { ExternalLink, ArrowRight } from 'lucide-react';
import { SystemLink } from '../types';

interface SystemCardProps {
  system: SystemLink;
  onNavigate?: (route: string) => void;
}

const accentMap = {
  primary: { bar: 'bg-army-green', icon: 'bg-army-green/10 text-army-green', badge: 'text-army-green' },
  secondary: { bar: 'bg-army-blue', icon: 'bg-army-blue/10 text-army-blue', badge: 'text-army-blue' },
  accent: { bar: 'bg-army-gold', icon: 'bg-army-gold/10 text-yellow-700', badge: 'text-yellow-700' },
};

const SystemCard: React.FC<SystemCardProps> = React.memo(({ system, onNavigate }) => {
  const { title, description, url, icon: Icon, iconImage, variant, isUnderConstruction, internalRoute } = system;
  const accent = accentMap[variant];

  const renderTitle = (text: string) => {
    if (!text.includes('*')) return text;
    return text.split('*').map((part, i) =>
      i % 2 === 1 ? <span key={i} className="italic">{part}</span> : part
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
    ? { onClick: handleClick, role: 'button', className: 'cursor-pointer' }
    : { href: url, target: "_blank", rel: "noopener noreferrer" };

  return (
    <Wrapper
      {...wrapperProps}
      className="group relative flex flex-col bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden cursor-pointer h-full"
    >
      {/* Top accent bar */}
      <div className={`h-1 w-full ${accent.bar}`} />

      {/* Construction badge */}
      {isUnderConstruction && (
        <div className="absolute top-4 right-4 bg-red-100 text-red-600 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-red-200 z-10">
          Em construção
        </div>
      )}

      <div className="p-5 flex flex-col flex-grow justify-center">
        {/* Icon */}
        <div className={`mb-3 inline-flex p-3 rounded-xl ${accent.icon} w-fit`}>
          {iconImage ? (
            <img src={iconImage} alt="" className="w-8 h-8 object-contain" />
          ) : (
            <Icon size={28} />
          )}
        </div>

        {/* Title */}
        <h3 className="text-lg font-bold text-slate-800 mb-1.5 group-hover:text-army-green transition-colors leading-snug">
          {renderTitle(title)}
        </h3>

        {/* Description */}
        <p className="text-sm text-slate-500 leading-relaxed line-clamp-2">
          {description}
        </p>

        {/* Footer */}
        <div className={`mt-4 flex items-center gap-1.5 text-xs font-semibold ${accent.badge} group-hover:gap-2.5 transition-all`}>
          <span>Acessar</span>
          {internalRoute
            ? <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            : <ExternalLink size={13} />
          }
        </div>
      </div>
    </Wrapper>
  );
});

SystemCard.displayName = 'SystemCard';
export default SystemCard;
