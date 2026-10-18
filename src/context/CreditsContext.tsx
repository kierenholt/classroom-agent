import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from './AuthContext';
import { env } from '../config/env';

interface CreditsContextType {
  aiCredits: number | null;
  loadingCredits: boolean;
  isTopUpModalOpen: boolean;
  checkoutSuccessMessage: string | null;
  openTopUpModal: () => void;
  closeTopUpModal: () => void;
  clearCheckoutSuccessMessage: () => void;
  refreshCredits: () => Promise<void>;
}

const CreditsContext = createContext<CreditsContextType | undefined>(undefined);

export const CreditsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [aiCredits, setAiCredits] = useState<number | null>(null);
  const [loadingCredits, setLoadingCredits] = useState<boolean>(true);
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState<boolean>(false);
  const [checkoutSuccessMessage, setCheckoutSuccessMessage] = useState<string | null>(null);
  const verifiedSessionsRef = useRef<Set<string>>(new Set());

  const openTopUpModal = useCallback(() => {
    setIsTopUpModalOpen(true);
  }, []);

  const closeTopUpModal = useCallback(() => {
    setIsTopUpModalOpen(false);
    setCheckoutSuccessMessage(null);
  }, []);

  const clearCheckoutSuccessMessage = useCallback(() => {
    setCheckoutSuccessMessage(null);
  }, []);

  const refreshCredits = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const idToken = await user.getIdToken();
      const params = new URLSearchParams({ uid: user.uid });
      if (user.email) {
        params.set('email', user.email);
      }
      const res = await fetch(`${env.API_BASE_URL}/stripe/user-credits?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.aiCredits === 'number') {
          setAiCredits(data.aiCredits);
        }
      }
    } catch (err) {
      console.error('[CreditsContext] Failed to initialize/fetch user credits:', err);
    } finally {
      setLoadingCredits(false);
    }
  }, [user]);

  // 1. Initialize user credits on backend & subscribe to real-time Firestore updates on users/{uid}
  useEffect(() => {
    if (!user?.uid) {
      setAiCredits(null);
      setLoadingCredits(false);
      return;
    }

    setLoadingCredits(true);
    refreshCredits();

    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(
      userDocRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (typeof data.aiCredits === 'number' && !Number.isNaN(data.aiCredits)) {
            setAiCredits(data.aiCredits);
            setLoadingCredits(false);
          }
        }
      },
      (err) => {
        console.error('[CreditsContext] Error listening to user credits:', err);
      }
    );

    return () => unsubscribe();
  }, [user?.uid, refreshCredits]);

  // 2. Automatically detect return from Stripe Checkout (?checkout=success&session_id=...)
  useEffect(() => {
    if (!user?.uid || typeof window === 'undefined') return;

    const searchParams = new URLSearchParams(window.location.search);
    const checkoutState = searchParams.get('checkout');
    const sessionId = searchParams.get('session_id');

    const cleanUrlParams = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('checkout');
      url.searchParams.delete('session_id');
      url.searchParams.delete('credits');
      window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    };

    if (checkoutState === 'success' && sessionId && !verifiedSessionsRef.current.has(sessionId)) {
      verifiedSessionsRef.current.add(sessionId);
      setIsTopUpModalOpen(true);

      (async () => {
        try {
          const idToken = await user.getIdToken();
          const res = await fetch(`${env.API_BASE_URL}/stripe/verify-session`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              sessionId,
              ownerUid: user.uid,
            }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            if (typeof data.aiCredits === 'number') {
              setAiCredits(data.aiCredits);
            }
            setCheckoutSuccessMessage('Payment successful! +100 AI credits have been added to your account.');
          } else {
            console.error('[CreditsContext] Failed to verify checkout session:', data.error);
          }
        } catch (err) {
          console.error('[CreditsContext] Error verifying checkout session:', err);
        } finally {
          cleanUrlParams();
        }
      })();
    } else if (checkoutState === 'canceled') {
      cleanUrlParams();
    }
  }, [user]);

  return (
    <CreditsContext.Provider
      value={{
        aiCredits,
        loadingCredits,
        isTopUpModalOpen,
        checkoutSuccessMessage,
        openTopUpModal,
        closeTopUpModal,
        clearCheckoutSuccessMessage,
        refreshCredits,
      }}
    >
      {children}
    </CreditsContext.Provider>
  );
};

export const useCredits = (): CreditsContextType => {
  const context = useContext(CreditsContext);
  if (!context) {
    throw new Error('useCredits must be used within a CreditsProvider');
  }
  return context;
};
