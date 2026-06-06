
import React, { useState, useCallback, Suspense, lazy } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import SystemCard from './components/SystemCard';
import QuickLinks from './components/QuickLinks';
import { SYSTEM_LINKS } from './constants';
// @ts-ignore
import { SpeedInsights } from "@vercel/speed-insights/react";

const DeaDashboard   = lazy(() => import('./components/dashboard/DeaDashboard'));
const AndrecitoApp   = lazy(() => import('./components/andrecito/AndrecitoApp'));
const ComparisonApp  = lazy(() => import('./components/comparison/ComparisonApp'));


const ViewLoader: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50">
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

  const handleBackToHome = useCallback(() => setCurrentView('home'), []);

  const renderContent = () => {
    switch (currentView) {
      case 'dea-dashboard':  return <Suspense fallback={<ViewLoader />}><DeaDashboard onBack={handleBackToHome} /></Suspense>;
      case 'andrecito-app':  return <Suspense fallback={<ViewLoader />}><AndrecitoApp onBack={handleBackToHome} /></Suspense>;
      case 'comparison-app': return <Suspense fallback={<ViewLoader />}><ComparisonApp onBack={handleBackToHome} /></Suspense>;
      default: return (
        <>
          <Header showExtraLogos={true} />

          {/* ── Main content ─────────────────────────────────── */}
          <main className="flex-grow relative bg-gradient-to-br from-divpag-100 via-divpag-50 to-divpag-200">
            {/* Brilho dourado sutil no topo (halo army-gold), visual moderno e clean */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage:
                  'radial-gradient(110% 60% at 50% -10%, rgba(189,156,77,0.18) 0%, rgba(189,156,77,0.05) 35%, transparent 70%)',
              }}
            />
            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-10">

              {/* Quick metrics */}
              <QuickLinks />

              {/* Section title */}
              <div className="flex items-center gap-4 mb-6">
                <div className="h-px flex-grow bg-slate-200" />
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 whitespace-nowrap">Sistemas disponíveis</span>
                <div className="h-px flex-grow bg-slate-200" />
              </div>

              {/* Systems grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {SYSTEM_LINKS.map(system => (
                  <SystemCard key={system.id} system={system} onNavigate={handleNavigate} />
                ))}
              </div>
            </div>
          </main>

          <Footer />
        </>
      );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 overflow-x-hidden">
      <SpeedInsights />
      {renderContent()}
    </div>
  );
};

export default App;
