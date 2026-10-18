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
  clearGoogleAccessToken: () => void;
  getAuthHeaders: () => Promise<{ Authorization: string; 'X-Google-Access-Token': string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const GOOGLE_TOKEN_STORAGE_KEY = 'classroom_agent_google_access_token';
const GOOGLE_TOKEN_EXPIRY_KEY = 'classroom_agent_google_token_expiry';
const CUSTOM_TOKEN_STORAGE_KEY = 'classroom_agent_custom_token';
// Google OAuth access tokens expire after 3600s (60 mins); refresh at 55 mins
const GOOGLE_TOKEN_TTL_MS = 55 * 60 * 1000;

function getValidStoredGoogleToken(): string | null {
  const token = sessionStorage.getItem(GOOGLE_TOKEN_STORAGE_KEY);
  if (!token) return null;
  const expiryStr = sessionStorage.getItem(GOOGLE_TOKEN_EXPIRY_KEY);
  if (expiryStr) {
    const expiry = Number(expiryStr);
    if (!Number.isNaN(expiry) && Date.now() > expiry) {
      sessionStorage.removeItem(GOOGLE_TOKEN_STORAGE_KEY);
      sessionStorage.removeItem(GOOGLE_TOKEN_EXPIRY_KEY);
      return null;
    }
  }
  return token;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(() => {
    return getValidStoredGoogleToken();
  });

  const clearGoogleAccessToken = useCallback(() => {
    sessionStorage.removeItem(GOOGLE_TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(GOOGLE_TOKEN_EXPIRY_KEY);
    setGoogleAccessToken(null);
  }, []);

  useEffect(() => {
    let attemptedTokenSignIn = false;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const storedToken = getValidStoredGoogleToken();
        setGoogleAccessToken(storedToken);
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
            const storedToken = getValidStoredGoogleToken();
            if (storedToken) {
              setGoogleAccessToken(storedToken);
            }
            setLoading(false);
            return;
          } catch (err) {
            console.error('[AuthContext] Failed to sign in with custom token:', err);
            sessionStorage.removeItem(CUSTOM_TOKEN_STORAGE_KEY);
            sessionStorage.removeItem(GOOGLE_TOKEN_STORAGE_KEY);
            sessionStorage.removeItem(GOOGLE_TOKEN_EXPIRY_KEY);
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
      sessionStorage.setItem(GOOGLE_TOKEN_EXPIRY_KEY, String(Date.now() + GOOGLE_TOKEN_TTL_MS));
      setGoogleAccessToken(token);
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  };

  const logOut = async () => {
    sessionStorage.removeItem(GOOGLE_TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(GOOGLE_TOKEN_EXPIRY_KEY);
    sessionStorage.removeItem(CUSTOM_TOKEN_STORAGE_KEY);
    localStorage.removeItem('classroom_agent_open_sessions');
    localStorage.removeItem('classroom_agent_active_tab_id');
    setGoogleAccessToken(null);
    await signOut(auth);
  };

  const getAuthHeaders = useCallback(async (): Promise<{ Authorization: string; 'X-Google-Access-Token': string }> => {
    const activeUser = user || auth.currentUser;
    if (!activeUser) {
      throw new Error('[Auth Failure] Unauthenticated request: Teacher user is not signed in.');
    }
    const idToken = await activeUser.getIdToken();
    const gToken = getValidStoredGoogleToken() || googleAccessToken;
    if (!gToken) {
      clearGoogleAccessToken();
      throw new Error('[Auth Failure] Missing or expired Google OAuth access token. Please re-authenticate.');
    }
    return {
      Authorization: `Bearer ${idToken}`,
      'X-Google-Access-Token': gToken,
    };
  }, [user, googleAccessToken, clearGoogleAccessToken]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        googleAccessToken,
        signInWithGoogle,
        logOut,
        clearGoogleAccessToken,
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
