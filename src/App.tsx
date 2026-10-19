import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { WorkspaceLayout } from './components/layout/WorkspaceLayout';
import { Loader2 } from 'lucide-react';
import { LandingPage } from './components/marketing/LandingPage';
import { PrivacyPolicyPage } from './components/marketing/PrivacyPolicyPage';
import { TermsOfServicePage } from './components/marketing/TermsOfServicePage';

import { ClassroomDataProvider } from './context/ClassroomDataContext';
import { SettingsProvider } from './context/SettingsContext';
import { CreditsProvider } from './context/CreditsContext';

export const App: React.FC = () => {
  const { user, googleAccessToken, loading, signInWithGoogle } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>(() => window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setCurrentPath(path);
    window.scrollTo(0, 0);
  };

  // Publicly accessible legal routes (required by Google OAuth Verification crawler without login)
  if (currentPath === '/privacy' || currentPath === '/privacy/') {
    return <PrivacyPolicyPage onNavigate={navigate} />;
  }

  if (currentPath === '/terms' || currentPath === '/terms/') {
    return <TermsOfServicePage onNavigate={navigate} />;
  }

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#121316] text-[#EDEDED]">
        <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37] mb-3" />
        <p className="text-sm font-medium tracking-wide">Initializing Classroom Agent...</p>
      </div>
    );
  }

  if (!user || !googleAccessToken) {
    const handleSignIn = async () => {
      setSigningIn(true);
      setAuthError(null);
      try {
        await signInWithGoogle();
      } catch (err: any) {
        console.error('Sign in error:', err);
        setAuthError(err.message || 'Authentication failed. Please try again.');
      } finally {
        setSigningIn(false);
      }
    };

    return (
      <LandingPage
        onSignIn={handleSignIn}
        signingIn={signingIn}
        authError={authError}
        tokenExpiredWarning={Boolean(user && !googleAccessToken && !authError)}
        onNavigate={navigate}
      />
    );
  }

  return (
    <SettingsProvider>
      <CreditsProvider>
        <ClassroomDataProvider>
          <WorkspaceLayout />
        </ClassroomDataProvider>
      </CreditsProvider>
    </SettingsProvider>
  );
};
