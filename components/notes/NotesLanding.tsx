
import React, { useState } from 'react';
import { ArrowLeft, BookOpen, ShieldCheck, ChevronRight, FileText, Search } from 'lucide-react';
import { LOGO_URL, PLACEHOLDER_LOGO } from '../../constants';

interface NotesLandingProps {
  onBack: () => void;
  onEnterPublic: () => void;
  onEnterAdmin: () => void;
}

const NotesLanding: React.FC<NotesLandingProps> = ({ onBack, onEnterPublic, onEnterAdmin }) => {
  const [imgSrc, setImgSrc] = useState(LOGO_URL);

  return (
    <div className="flex flex-col md:flex-row min-h-screen w-full overflow-hidden font-sans">
      
      {/* LADO ESQUERDO: Identidade Visual e Institucional */}
      <div className="w-full md:w-5/12 bg-army-green relative flex flex-col justify-between p-8 md:p-12 text-white overflow-hidden border-r-4 border-army-gold">
        {/* Background Patterns (Igual ao Portal) */}
        <div className="absolute inset-0 opacity-30 pointer-events-none" 
             style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}>
        </div>
        
        {/* Header Esquerdo */}
        <div className="relative z-10">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-army-gold hover:text-white transition-colors text-xs font-bold uppercase tracking-widest mb-8"
          >
            <ArrowLeft size={16} /> Voltar ao Portal
          </button>
        </div>

        {/* Conteúdo Central Esquerdo */}
        <div className="relative z-10 flex flex-col items-start animate-fade-in-up">
            <img 
              src={imgSrc} 
              alt="Brasão DivPag" 
              className="w-20 md:w-28 mb-8 drop-shadow-2xl"
              onError={() => setImgSrc(PLACEHOLDER_LOGO)}
            />
            
            <div className="h-1 w-20 bg-army-gold mb-6"></div>

            <h1 className="text-3xl md:text-5xl font-montserrat font-extrabold text-white mb-4 leading-tight">
              Repositório<br/>de Notas
            </h1>
            <p className="text-gray-200 text-base md:text-lg font-light leading-relaxed max-w-md">
              Plataforma centralizada para padronização e consulta de modelos de documentos administrativos e aditamentos.
            </p>
        </div>

        {/* Footer Esquerdo */}
        <div className="relative z-10 mt-8">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-bold">
              Divisão de Pagamento de Pessoal
            </p>
        </div>
      </div>

      {/* LADO DIREITO: Ações e Navegação */}
      <div className="w-full md:w-7/12 bg-gray-50 relative flex flex-col items-center justify-center">
        
        <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 w-full max-w-lg space-y-8 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
            
            <div className="text-center md:text-left mb-8 w-full">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-800 font-montserrat mb-2">
                    Bem-vindo
                </h2>
                <p className="text-gray-500">Selecione o módulo de acesso desejado:</p>
            </div>

            <div className="space-y-4 w-full">
                {/* Card Consulta Pública */}
                <button 
                    onClick={onEnterPublic}
                    className="group w-full bg-white border border-gray-200 hover:border-army-green p-6 rounded-lg shadow-sm hover:shadow-xl transition-all duration-300 flex items-start text-left relative overflow-hidden"
                >
                    <div className="bg-gray-50 group-hover:bg-army-green w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors duration-300">
                        <BookOpen size={24} className="text-gray-600 group-hover:text-army-gold transition-colors" />
                    </div>
                    
                    <div className="ml-5 flex-1 relative z-10">
                        <div className="flex justify-between items-center mb-1">
                            <h3 className="text-lg font-bold text-gray-800 group-hover:text-army-green transition-colors font-montserrat">Consulta</h3>
                            <ChevronRight size={20} className="text-gray-300 group-hover:text-army-green transition-colors" />
                        </div>
                        <p className="text-sm text-gray-500 leading-relaxed">
                            Banco de notas para Aditamento de Pagamento de Pessoal e BI.
                        </p>
                    </div>
                </button>

                {/* Card Área Administrativa */}
                <button 
                    onClick={onEnterAdmin}
                    className="group w-full bg-white border border-gray-200 hover:border-army-green p-6 rounded-lg shadow-sm hover:shadow-xl transition-all duration-300 flex items-start text-left relative overflow-hidden"
                >
                    <div className="bg-gray-50 group-hover:bg-army-green w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors duration-300">
                        <ShieldCheck size={24} className="text-gray-600 group-hover:text-army-gold transition-colors" />
                    </div>
                    
                    <div className="ml-5 flex-1 relative z-10">
                        <div className="flex justify-between items-center mb-1">
                            <h3 className="text-lg font-bold text-gray-800 group-hover:text-army-green transition-colors font-montserrat">Área do Administrador</h3>
                            <ChevronRight size={20} className="text-gray-300 group-hover:text-army-green transition-colors" />
                        </div>
                        <p className="text-sm text-gray-500 leading-relaxed">
                            Acesso restrito para criação, edição e gerenciamento das notas.
                        </p>
                    </div>
                </button>
            </div>
        </div>

        {/* Styled Footer for Right Panel */}
        <footer className="w-full bg-army-light text-white py-[12px] border-t-[4px] border-army-gold relative overflow-hidden">
            <div className="absolute inset-0 opacity-30 pointer-events-none" 
                 style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}>
            </div>
            <div className="max-w-7xl mx-auto px-4 text-center relative z-10">
                <p className="text-xs text-white/90 font-medium tracking-wide">
                  &copy; {new Date().getFullYear()} Divisão de Pagamento de Pessoal / B Adm Gu Natal.
                </p>
            </div>
        </footer>

      </div>

    </div>
  );
};

export default NotesLanding;
