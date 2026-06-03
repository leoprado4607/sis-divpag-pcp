
import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense, lazy } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import SystemCard from './components/SystemCard';
import QuickLinks from './components/QuickLinks';
import { SYSTEM_LINKS } from './constants';
import { ChevronLeft, ChevronRight } from 'lucide-react';
// @ts-ignore
import { SpeedInsights } from "@vercel/speed-insights/react";

// Code-splitting por view: cada módulo (e suas libs pesadas como recharts, jspdf,
// genai, react-markdown) só é baixado quando o usuário realmente abre a tela.
const DeaDashboard = lazy(() => import('./components/dashboard/DeaDashboard'));
const AndrecitoApp = lazy(() => import('./components/andrecito/AndrecitoApp'));
const ComparisonApp = lazy(() => import('./components/comparison/ComparisonApp'));

const ViewLoader: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="w-12 h-12 border-4 border-army-gold border-t-army-green rounded-full animate-spin"></div>
  </div>
);

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'home' | 'dea-dashboard' | 'andrecito-app' | 'comparison-app'>('home');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [canStartCarousel, setCanStartCarousel] = useState(false);

  const handleNavigate = useCallback((route: string) => {
    if (route === 'dea-dashboard') setCurrentView('dea-dashboard');
    else if (route === 'andrecito-app') setCurrentView('andrecito-app');
    else if (route === 'comparison-app') setCurrentView('comparison-app');
    window.scrollTo(0, 0);
  }, []);

  const handleBackToHome = useCallback(() => setCurrentView('home'), []);

  // Multiplicamos os itens para criar o efeito de carrossel infinito.
  // Memoizado: a lista é estática, não precisa ser recriada a cada render.
  const carouselItems = useMemo(
    () => [...SYSTEM_LINKS, ...SYSTEM_LINKS, ...SYSTEM_LINKS, ...SYSTEM_LINKS],
    []
  );

  useEffect(() => {
    // Timer alterado para 3 segundos conforme solicitação do usuário
    const timer = setTimeout(() => setCanStartCarousel(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (currentView !== 'home' || !canStartCarousel) return;
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    let animationFrameId: number;
    const autoScroll = () => {
      if (currentView !== 'home' || !scrollRef.current) return;
      if (!isPaused && scrollContainer) {
        scrollContainer.scrollLeft += 0.8; 
        if (scrollContainer.scrollLeft >= (scrollContainer.scrollWidth / 2)) {
           scrollContainer.scrollLeft = 0;
        }
      }
      animationFrameId = requestAnimationFrame(autoScroll);
    };
    animationFrameId = requestAnimationFrame(autoScroll);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPaused, currentView, canStartCarousel]); 

  const scrollManual = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const cardWidth = 340; 
      const scrollAmount = direction === 'left' ? -cardWidth : cardWidth;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const renderContent = () => {
    switch (currentView) {
      case 'dea-dashboard': return <Suspense fallback={<ViewLoader />}><DeaDashboard onBack={handleBackToHome} /></Suspense>;
      case 'andrecito-app': return <Suspense fallback={<ViewLoader />}><AndrecitoApp onBack={handleBackToHome} /></Suspense>;
      case 'comparison-app': return <Suspense fallback={<ViewLoader />}><ComparisonApp onBack={handleBackToHome} /></Suspense>;
      default: return (
        <>
          <Header showExtraLogos={true} />
          <main className="flex-grow flex flex-col items-center justify-start pt-[26px] pb-[40px]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
              <QuickLinks />
              <div className="h-1.5 w-72 mx-auto rounded-full my-4 mb-12 opacity-80"
                style={{ background: 'linear-gradient(90deg, transparent 0%, #1a3c1a 15%, #f2c500 50%, #002776 85%, transparent 100%)' }}></div>
              
              {/* Carrossel Ativo */}
              <div className="w-full relative group mb-[28px]" onMouseEnter={() => setIsPaused(true)} onMouseLeave={() => setIsPaused(false)}>
                {/* Gradientes de profundidade */}
                <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-gray-50 to-transparent z-20 pointer-events-none"></div>
                <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-gray-50 to-transparent z-20 pointer-events-none"></div>
                
                {/* Botões de Navegação */}
                <button onClick={() => scrollManual('left')} className="absolute left-2 top-1/2 -translate-y-1/2 z-30 bg-white/90 hover:bg-army-green hover:text-white text-army-green p-3 rounded-full shadow-lg backdrop-blur-sm transition-all duration-300 opacity-0 group-hover:opacity-100 hover:scale-110 border border-gray-200"><ChevronLeft size={24} strokeWidth={3} /></button>
                
                <div ref={scrollRef} className="flex overflow-x-hidden gap-6 py-4 px-4 scroll-smooth" style={{ width: '100%' }}>
                  {carouselItems.map((system, index) => (
                    <div key={`${system.id}-${index}`} className="w-[280px] md:w-[320px] flex-shrink-0 transition-transform duration-300 hover:scale-105">
                      <SystemCard system={system} onNavigate={handleNavigate} />
                    </div>
                  ))}
                </div>

                <button onClick={() => scrollManual('right')} className="absolute right-2 top-1/2 -translate-y-1/2 z-30 bg-white/90 hover:bg-army-green hover:text-white text-army-green p-3 rounded-full shadow-lg backdrop-blur-sm transition-all duration-300 opacity-0 group-hover:opacity-100 hover:scale-110 border border-gray-200"><ChevronRight size={24} strokeWidth={3} /></button>
              </div>
            </div>
          </main>
          <Footer />
        </>
      );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 overflow-x-hidden">
      <SpeedInsights />
      {renderContent()}
    </div>
  );
};

export default App;
