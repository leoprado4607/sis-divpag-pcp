
import React from 'react';
import { ExternalLink, ArrowRight } from 'lucide-react';
import { SystemLink } from '../types';

interface SystemCardProps {
  system: SystemLink;
  onNavigate?: (route: string) => void;
}

const SystemCard: React.FC<SystemCardProps> = React.memo(({ system, onNavigate }) => {
  const { title, description, url, icon: Icon, iconImage, variant, isUnderConstruction, internalRoute } = system;

  // Modern styling mapping based on variant (all grounded in Army aesthetic)
  const styles = {
    primary: 'border-l-4 border-army-green hover:border-l-8',
    secondary: 'border-l-4 border-army-blue hover:border-l-8',
    accent: 'border-l-4 border-army-gold hover:border-l-8',
  };

  const iconColors = {
    primary: 'text-army-green',
    secondary: 'text-army-blue',
    accent: 'text-yellow-600',
  };

  // Helper to render title with italics support (text between *)
  const renderTitle = (text: string) => {
    if (!text.includes('*')) return text;
    return text.split('*').map((part, index) => 
      index % 2 === 1 ? <span key={index} className="italic">{part}</span> : part
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
      className={`
        group relative flex flex-col justify-between
        bg-white rounded-xl shadow-md hover:shadow-2xl 
        transition-all duration-300 ease-out transform
        p-[1.2rem] overflow-hidden cursor-pointer h-full
        ${styles[variant]}
      `}
    >
      {/* Construction Ribbon */}
      {isUnderConstruction && (
        <div className="absolute top-5 -right-12 w-40 bg-red-600 text-white text-[7px] font-bold py-1 text-center transform rotate-45 shadow-sm uppercase z-20 border-b border-red-800 tracking-wider">
          Em construção
        </div>
      )}

      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110">
        {iconImage ? (
          <img src={iconImage} alt="" className="w-24 h-24 md:w-32 md:h-32 object-contain grayscale" />
        ) : (
          <Icon size={120} />
        )}
      </div>

      <div className="relative z-10">
        <div className={`
          mb-4 inline-flex p-3 rounded-lg bg-gray-50 
          ${iconColors[variant]} group-hover:bg-gray-100 transition-colors
        `}>
          {iconImage ? (
            <img src={iconImage} alt="" className="w-8 h-8 md:w-10 md:h-10 object-contain" />
          ) : (
            <Icon size={32} />
          )}
        </div>
        
        <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-army-green transition-colors">
          {renderTitle(title)}
        </h3>
        
        <p className="text-sm text-gray-500 mb-4 line-clamp-2 font-medium">
          {description}
        </p>
      </div>

      <div className="relative z-10 mt-auto pt-4 border-t border-gray-100 flex items-center justify-between text-sm font-medium text-gray-500 group-hover:text-army-green">
        <span>Acessar Sistema</span>
        {internalRoute ? (
             <ArrowRight size={16} className="ml-2 transform group-hover:translate-x-1 transition-transform" />
        ) : (
             <ExternalLink size={16} className="ml-2 transform group-hover:translate-x-1 transition-transform" />
        )}
      </div>
    </Wrapper>
  );
});

SystemCard.displayName = 'SystemCard';

export default SystemCard;
