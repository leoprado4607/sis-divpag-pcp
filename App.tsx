
import React, { useState, useCallback, Suspense, lazy } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import SystemCard from './components/SystemCard';
import { SYSTEM_LINKS } from './constants';
// @ts-ignore
import { SpeedInsights } from "@vercel/speed-insights/react";

const DeaDashboard   = lazy(() => import('./components/dashboard/DeaDashboard'));
const AndrecitoApp   = lazy(() => import('./components/andrecito/AndrecitoApp'));
const ComparisonApp  = lazy(() => import('./components/comparison/ComparisonApp'));

const ViewLoader: React.FC = () => (
  <div className="min-h-[60vh] flex items-center justify-center bg-army-cream">
    <div className="w-10 h-10 border-4 border-army-gold border-t-army-green rounded-full animate-spin" />
  </div>
);

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'home' | 'dea-dashboard' | 'andrecito-app' | 'comparison-app'>('home');

  const handleNavigate = useCallback((route: string) => {
    if (route === 'dea-dashboard')    setCurrentView('dea-dashboard');
    else if (route === 'andrecito-app')  setCurrentView('andrecito-app');
    else if (route === 'comparison-app') setCurrentView('comparison-app');
    window.scrollTo(0, 0);
  }, []);

  const handleBackToHome = useCallback(() => {
    setCurrentView('home');
    window.scrollTo(0, 0);
  }, []);

  /* ─── Sub-app views: header + content + footer ─── */
  if (currentView !== 'home') {
    return (
      <div className="min-h-screen flex flex-col bg-army-cream overflow-x-hidden">
        <SpeedInsights />
        {!['andrecito-app', 'comparison-app', 'dea-dashboard'].includes(currentView) && <Header onBack={handleBackToHome} />}
        <main className="flex-grow">
          <Suspense fallback={<ViewLoader />}>
            {currentView === 'dea-dashboard'  && <DeaDashboard  onBack={handleBackToHome} />}
            {currentView === 'andrecito-app'  && <AndrecitoApp  onBack={handleBackToHome} />}
            {currentView === 'comparison-app' && <ComparisonApp onBack={handleBackToHome} />}
          </Suspense>
        </main>
        <Footer />
      </div>
    );
  }

  /* ─── Home view ─── */
  return (
    <div className="min-h-screen flex flex-col bg-army-cream overflow-x-hidden">
      <SpeedInsights />

      {/* Sticky nav */}
      <Header showExtraLogos={true} />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[52vh]">

          {/* Left: text content */}
          <div className="flex flex-col justify-center px-6 sm:px-10 lg:px-16 py-14 bg-army-cream relative z-10">
            <h2 className="font-cormorant font-semibold text-3xl sm:text-4xl lg:text-5xl leading-[1.1]
                           text-army-charcoal mb-4 animate-fade-in-up"
                style={{ animationDelay: '0.08s' }}>
              Portal de Informações de<br />
              <span className="italic text-army-green">Pagamento de Pessoal</span>
            </h2>
            <p className="text-sm text-army-green/55 leading-relaxed max-w-md mb-8 animate-fade-in-up"
               style={{ animationDelay: '0.16s' }}>
              Acesse os sistemas, ferramentas e dados da Divisão de Pagamento de Pessoal
              do Batalhão de Administração da Guarnição de Natal.
            </p>
            <a
              href="#sistemas"
              className="inline-flex items-center gap-2 self-start bg-army-green text-white
                         px-6 py-3 text-sm font-medium tracking-wide uppercase
                         hover:bg-army-mid transition-colors duration-200 animate-fade-in-up"
              style={{ animationDelay: '0.24s' }}
            >
              Ver sistemas disponíveis
              <span className="text-army-gold">→</span>
            </a>
          </div>

          {/* Right: background image with overlay */}
          <div className="relative hidden lg:block">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: "url('/fundo-quartel.jpg')",
                backgroundSize: 'cover',
                backgroundPosition: 'center 55%',
              }}
            />
            <div className="absolute inset-0 bg-army-green/65" />
            {/* Decorative grid overlay */}
            <div
              className="absolute inset-0 opacity-10 pointer-events-none"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
            />
            {/* Info card */}
            <div className="absolute bottom-8 left-8 right-8 border border-army-gold/25 bg-white/6 backdrop-blur-sm p-5">
              <p className="font-cormorant font-semibold text-lg text-white mb-1">
                Divisão de Pagamento de Pessoal
              </p>
              <p className="text-xs text-white/50 leading-relaxed">
                Responsável pelo processamento e controle da folha de pagamento dos
                militares da ativa, veteranos e pensionistas da Guarnição de Natal.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Systems grid ── */}
      <section id="sistemas" className="flex-grow bg-white px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-[1600px] mx-auto">

          {/* Section label */}
          <div className="flex items-center gap-4 mb-8">
            <div className="h-px flex-grow bg-army-green/15" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-army-gold whitespace-nowrap">
              Sistemas disponíveis
            </span>
            <div className="h-px flex-grow bg-army-green/15" />
          </div>

          {/* Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-army-green/8">
            {SYSTEM_LINKS.map(system => (
              <SystemCard key={system.id} system={system} onNavigate={handleNavigate} />
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default App;
