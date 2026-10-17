import React from 'react';
import { ArrowLeft, Bot, Search, Library, Settings, LogOut } from 'lucide-react';
import type { ViewState, UserRole } from './AndrecitoApp';

interface AndrecitoHeaderProps {
  onBack: () => void;
  onLogout: () => void;
  onNavigate: (view: ViewState) => void;
  currentView: ViewState;
  userRole: UserRole;
}

// Cabeçalho único das telas internas do Andrecito (Pesquisa, Biblioteca, Admin).
// No celular a navegação desce para uma segunda linha com alvos de 44px.
const AndrecitoHeader: React.FC<AndrecitoHeaderProps> = ({ onBack, onLogout, onNavigate, currentView, userRole }) => {
  const itens = [
    { id: 'query' as ViewState, icon: Search, label: 'Pesquisa' },
    { id: 'library' as ViewState, icon: Library, label: 'Biblioteca' },
    ...(userRole === 'admin' ? [{ id: 'admin' as ViewState, icon: Settings, label: 'Admin' }] : []),
  ];

  return (
    <header className="bg-army-green text-white border-b-2 border-army-gold no-print flex-shrink-0 relative z-50">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-8 h-16 flex items-center gap-2 sm:gap-4">

        <div className="flex items-center gap-2 sm:gap-3.5 min-w-0">
          <button
            type="button"
            onClick={onBack}
            aria-label="Voltar ao portal"
            className="flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center sm:justify-start gap-1.5 text-white/70 hover:text-army-gold-light transition-colors text-[11px] font-medium tracking-[0.14em] uppercase"
          >
            <ArrowLeft size={14} />
            <span className="hidden sm:inline">Portal</span>
          </button>
          <div className="hidden sm:block h-4 w-px bg-white/15" />
          <Bot size={20} className="text-army-gold-light flex-shrink-0" aria-hidden="true" />
          <div className="leading-tight min-w-0">
            <p className="text-[11px] tracking-[0.16em] uppercase text-white/70 font-medium truncate">Sistema de Pesquisas</p>
            <p className="font-cormorant font-semibold text-base text-white leading-none tracking-tight">ANDRECITO</p>
          </div>
        </div>

        <nav aria-label="Seções do Andrecito" className="flex-1 hidden sm:flex items-center justify-center">
          <div className="flex items-center gap-0.5 bg-white/[0.06] p-1">
            {itens.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                aria-current={currentView === id ? 'page' : undefined}
                className={`px-3.5 min-h-[36px] text-[13px] font-medium flex items-center gap-1.5 transition-colors ${currentView === id ? 'bg-white text-army-green' : 'text-white/70 hover:text-white'}`}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        </nav>
        <div className="flex-1 sm:hidden" />

        <button
          type="button"
          onClick={onLogout}
          aria-label="Sair"
          className="flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center gap-1.5 text-white/70 hover:text-red-200 transition-colors text-[11px] font-medium tracking-[0.14em] uppercase"
        >
          <LogOut size={14} />
          <span className="hidden sm:inline">Sair</span>
        </button>
      </div>

      <nav aria-label="Seções do Andrecito" className="sm:hidden border-t border-white/10 grid" style={{ gridTemplateColumns: `repeat(${itens.length}, 1fr)` }}>
        {itens.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id)}
            aria-current={currentView === id ? 'page' : undefined}
            className={`min-h-[44px] text-[13px] font-medium flex items-center justify-center gap-1.5 transition-colors ${currentView === id ? 'bg-white text-army-green' : 'text-white/70 hover:text-white'}`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </nav>
    </header>
  );
};

export default AndrecitoHeader;
