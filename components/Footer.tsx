
import React from 'react';

const Footer: React.FC = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="w-full bg-army-charcoal text-white border-t border-white/5 mt-auto">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4 text-center">
        <p className="text-xs text-white/20">
          &copy; {year} Divisão de Pagamento de Pessoal / B Adm Gu Natal
        </p>
      </div>
    </footer>
  );
};

export default Footer;
