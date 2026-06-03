
import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="w-full bg-army-light text-white py-[12px] mt-auto border-t-[4px] border-army-gold relative overflow-hidden">
      {/* Background Pattern Overlay */}
      <div className="absolute inset-0 opacity-30 pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
        <p className="text-xs text-white/90 font-medium tracking-wide">
          &copy; {new Date().getFullYear()} Divisão de Pagamento de Pessoal / B Adm Gu Natal
        </p>
      </div>
    </footer>
  );
};

export default Footer;
