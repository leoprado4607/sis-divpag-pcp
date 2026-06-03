import React, { useState } from 'react';
import AndrecitoLogin from './AndrecitoLogin';
import AndrecitoQuery from './AndrecitoQuery';
import AndrecitoLibrary from './AndrecitoLibrary';
import AndrecitoAdmin from './AndrecitoAdmin';
import { clearAdminToken } from '../../services/adminAuth';

interface AndrecitoAppProps {
  onBack: () => void;
}

export type ViewState = 'login' | 'query' | 'library' | 'admin';
export type UserRole = 'guest' | 'admin' | null;

const AndrecitoApp: React.FC<AndrecitoAppProps> = ({ onBack }) => {
  const [view, setView] = useState<ViewState>('login');
  const [role, setRole] = useState<UserRole>(null);

  const handleLogin = (userRole: 'guest' | 'admin') => {
    setRole(userRole);
    setView('query');
  };

  const handleLogout = () => {
    clearAdminToken();
    setRole(null);
    setView('login');
  };

  const handleNavigate = (target: ViewState) => {
    setView(target);
  };

  if (view === 'login') {
    return <AndrecitoLogin onLogin={handleLogin} onBack={onBack} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {view === 'query' && (
        <AndrecitoQuery 
          onBack={onBack} 
          onLogout={handleLogout}
          onNavigate={handleNavigate}
          currentView={view}
          userRole={role}
        />
      )}

      {view === 'library' && (
        <AndrecitoLibrary 
          onBack={onBack} 
          onLogout={handleLogout}
          onNavigate={handleNavigate}
          currentView={view}
          userRole={role}
        />
      )}

      {view === 'admin' && role === 'admin' && (
        <AndrecitoAdmin 
          onBack={onBack}
          onLogout={handleLogout}
          onNavigate={handleNavigate}
          currentView={view}
        />
      )}
    </div>
  );
};

export default AndrecitoApp;