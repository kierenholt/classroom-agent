import React from 'react';
import { useAuth } from './context/AuthContext';
import { WorkspaceLayout } from './components/layout/WorkspaceLayout';
import { GraduationCap, LogIn, ShieldAlert, Sparkles, Loader2 } from 'lucide-react';

export const App: React.FC = () => {
  const { user, loading, signInWithGoogle } = useAuth();
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [signingIn, setSigningIn] = React.useState(false);

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#0d1117] text-gray-300">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500 mb-3" />
        <p className="text-sm font-medium tracking-wide">Initializing Classroom Agent...</p>
      </div>
    );
  }

  if (!user) {
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
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#0d1117] text-gray-200 p-6 select-none">
        <div className="max-w-md w-full bg-[#161b22] border border-[#30363d] rounded-2xl p-8 shadow-2xl flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <GraduationCap className="w-9 h-9 text-white" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center justify-center space-x-2">
              <span>Classroom Agent</span>
              <Sparkles className="w-4 h-4 text-purple-400" />
            </h1>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">
              AI-Native grading and feedback workstation for Google Classroom.
              Inspect submissions, configure rubrics, and stream automated evaluations directly to Classroom.
            </p>
          </div>

          {authError && (
            <div className="w-full p-3 bg-red-950/60 border border-red-800/60 rounded-lg text-red-300 text-xs flex items-center space-x-2 text-left">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <button
            onClick={handleSignIn}
            disabled={signingIn}
            className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium text-sm transition-all shadow-md shadow-purple-600/30 disabled:opacity-50"
          >
            {signingIn ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Connecting to Google...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Sign in with Google Classroom</span>
              </>
            )}
          </button>

          <p className="text-[11px] text-gray-500">
            Requires Google Classroom & Google Drive permissions to inspect student submissions and sync grades.
          </p>
        </div>
      </div>
    );
  }

  return <WorkspaceLayout />;
};
