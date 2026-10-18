import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signInWithCustomToken,
  signOut,
  GoogleAuthProvider,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../config/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  googleAccessToken: string | null;
  signInWithGoogle: () => Promise<void>;
  logOut: () => Promise<void>;
  getAuthHeaders: () => Promise<{ Authorization: string; 'X-Google-Access-Token': string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const GOOGLE_TOKEN_STORAGE_KEY = 'classroom_agent_google_access_token';
const CUSTOM_TOKEN_STORAGE_KEY = 'classroom_agent_custom_token';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(() => {
    return sessionStorage.getItem(GOOGLE_TOKEN_STORAGE_KEY);
  });

  useEffect(() => {
    let attemptedTokenSignIn = false;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const storedToken = sessionStorage.getItem(GOOGLE_TOKEN_STORAGE_KEY);
        if (storedToken) {
          setGoogleAccessToken(storedToken);
        }
        setLoading(false);
        return;
      }

      // Check for test/custom token (STRICTLY for headless E2E test runner; never in production)
      if (!import.meta.env.PROD) {
        const customToken = sessionStorage.getItem(CUSTOM_TOKEN_STORAGE_KEY);
        if (customToken && !attemptedTokenSignIn) {
          attemptedTokenSignIn = true;
          try {
            const result = await signInWithCustomToken(auth, customToken);
            setUser(result.user);
            const storedToken = sessionStorage.getItem(GOOGLE_TOKEN_STORAGE_KEY);
            if (storedToken) {
              setGoogleAccessToken(storedToken);
            }
            setLoading(false);
            return;
          } catch (err) {
            console.error('[AuthContext] Failed to sign in with custom token:', err);
            sessionStorage.removeItem(CUSTOM_TOKEN_STORAGE_KEY);
            sessionStorage.removeItem(GOOGLE_TOKEN_STORAGE_KEY);
            setGoogleAccessToken(null);
          }
        }
      }

      setUser(null);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      if (!token) {
        throw new Error('Google Sign-In completed but no Google OAuth access token was returned.');
      }
      sessionStorage.setItem(GOOGLE_TOKEN_STORAGE_KEY, token);
      setGoogleAccessToken(token);
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  };

  const logOut = async () => {
    sessionStorage.removeItem(GOOGLE_TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(CUSTOM_TOKEN_STORAGE_KEY);
    setGoogleAccessToken(null);
    await signOut(auth);
  };

  const getAuthHeaders = useCallback(async (): Promise<{ Authorization: string; 'X-Google-Access-Token': string }> => {
    const activeUser = user || auth.currentUser;
    if (!activeUser) {
      throw new Error('[Auth Failure] Unauthenticated request: Teacher user is not signed in.');
    }
    const idToken = await activeUser.getIdToken();
    const gToken = googleAccessToken || sessionStorage.getItem(GOOGLE_TOKEN_STORAGE_KEY);
    if (!gToken) {
      throw new Error('[Auth Failure] Missing Google OAuth access token. Please re-authenticate.');
    }
    return {
      Authorization: `Bearer ${idToken}`,
      'X-Google-Access-Token': gToken,
    };
  }, [user, googleAccessToken]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        googleAccessToken,
        signInWithGoogle,
        logOut,
        getAuthHeaders,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
