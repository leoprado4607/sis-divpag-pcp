import React, { useState } from 'react';
import NotesLanding from './NotesLanding';
import NotesPublic from './NotesPublic';
import NotesLogin from './NotesLogin';
import NotesAdmin from './NotesAdmin';

interface NotesAppProps {
  onBack: () => void;
}

type NotesView = 'landing' | 'public' | 'login' | 'admin';

const NotesApp: React.FC<NotesAppProps> = ({ onBack }) => {
  const [currentView, setCurrentView] = useState<NotesView>('landing');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

  const handleNavigate = (view: NotesView) => {
    setCurrentView(view);
  };

  const handleLoginSuccess = () => {
    setIsAdminAuthenticated(true);
    setCurrentView('admin');
  };

  return (
    <div className="font-sans text-gray-800 bg-gray-50 min-h-screen">
      {currentView === 'landing' && (
        <NotesLanding 
          onBack={onBack} 
          onEnterPublic={() => handleNavigate('public')}
          onEnterAdmin={() => handleNavigate('login')}
        />
      )}

      {currentView === 'public' && (
        <NotesPublic onBack={() => handleNavigate('landing')} />
      )}

      {currentView === 'login' && (
        <NotesLogin 
          onBack={() => handleNavigate('landing')}
          onLoginSuccess={handleLoginSuccess}
        />
      )}

      {currentView === 'admin' && (
        <NotesAdmin 
          onBack={() => handleNavigate('landing')} 
          isAuthenticated={isAdminAuthenticated}
        />
      )}
    </div>
  );
};

export default NotesApp;