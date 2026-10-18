import React, { useEffect, useState } from 'react';
import { X, Sparkles, CreditCard, Loader2, CheckCircle2, AlertCircle, Tag } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCredits } from '../../context/CreditsContext';
import { env } from '../../config/env';

interface ProductPriceInfo {
  productId: string;
  name: string;
  description?: string | null;
  unitAmount: number;
  currency: string;
  formattedPrice: string;
  priceId?: string;
}

export const TopUpCreditsModal: React.FC = () => {
  const { user } = useAuth();
  const {
    aiCredits,
    isTopUpModalOpen,
    closeTopUpModal,
    checkoutSuccessMessage,
  } = useCredits();

  const [priceInfo, setPriceInfo] = useState<ProductPriceInfo | null>(null);
  const [loadingPrice, setLoadingPrice] = useState<boolean>(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState<string>('');
  const [creatingCheckout, setCreatingCheckout] = useState<boolean>(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTopUpModalOpen) return;

    let cancelled = false;
    setLoadingPrice(true);
    setPriceError(null);
    setCheckoutError(null);

    (async () => {
      try {
        const res = await fetch(`${env.API_BASE_URL}/stripe/product-price`);
        const data = await res.json();
        if (!cancelled) {
          if (res.ok && data.formattedPrice) {
            setPriceInfo(data);
          } else {
            setPriceError(data.error || 'Unable to load Stripe product price.');
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setPriceError(err.message || 'Failed to load product price.');
        }
      } finally {
        if (!cancelled) {
          setLoadingPrice(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isTopUpModalOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopUpModalOpen) {
        closeTopUpModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTopUpModalOpen, closeTopUpModal]);

  if (!isTopUpModalOpen) return null;

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid || creatingCheckout) return;

    setCreatingCheckout(true);
    setCheckoutError(null);

    try {
      const idToken = await user.getIdToken();
      const origin = window.location.origin;
      const res = await fetch(`${env.API_BASE_URL}/stripe/checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          ownerUid: user.uid,
          email: user.email || '',
          promotionCode: promoCode.trim() || undefined,
          creditsCount: 100,
          successUrl: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}&credits=100`,
          cancelUrl: `${origin}/?checkout=canceled`,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Failed to create Stripe Checkout session.');
      }

      window.location.assign(data.url);
    } catch (err: any) {
      setCheckoutError(err.message || 'Stripe Checkout failed.');
      setCreatingCheckout(false);
    }
  };

  return (
    <div
      data-testid="topup-credits-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none"
      onClick={closeTopUpModal}
    >
      <div
        className="w-full max-w-md bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#30363d] flex items-center justify-between bg-[#0d1117]">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-lg bg-purple-950/70 border border-purple-500/40 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Top Up AI Credits</h2>
              <p className="text-[11px] text-gray-400">
                1 credit is used each time the agent fetches a student&apos;s submission
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="close-topup-modal-button"
            onClick={closeTopUpModal}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#21262d] transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleCheckout} className="p-5 space-y-4">
          {checkoutSuccessMessage && (
            <div
              data-testid="topup-success-banner"
              className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 text-xs flex items-start space-x-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{checkoutSuccessMessage}</span>
            </div>
          )}

          {/* Current Balance */}
          <div className="p-3.5 rounded-lg bg-[#0d1117] border border-[#30363d] flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                Current Balance
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Available for AI grading & feedback</p>
            </div>
            <div
              data-testid="topup-modal-current-credits"
              className={`text-xl font-bold px-3 py-1 rounded-lg border ${
                (aiCredits ?? 0) > 0
                  ? 'text-purple-300 bg-purple-950/40 border-purple-500/30'
                  : 'text-red-300 bg-red-950/40 border-red-500/30'
              }`}
            >
              {aiCredits !== null ? aiCredits : '—'} <span className="text-xs font-medium">credits</span>
            </div>
          </div>

          {/* Package Card */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-purple-950/40 via-[#161b22] to-blue-950/30 border border-purple-500/40 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-bold text-white">+100 AI Credits Pack</span>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Instant Top-Up
                </span>
              </div>
              <p className="text-xs text-gray-400">
                {priceInfo?.description || ' Fetches and evaluates up to 100 student submissions'}
              </p>
            </div>

            <div data-testid="topup-modal-price" className="text-right shrink-0 ml-3">
              {loadingPrice ? (
                <div className="flex items-center space-x-1.5 text-xs text-gray-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                  <span>Loading...</span>
                </div>
              ) : priceInfo ? (
                <div>
                  <span className="text-lg font-bold text-white">{priceInfo.formattedPrice}</span>
                  <p className="text-[10px] text-gray-400 uppercase">{priceInfo.currency}</p>
                </div>
              ) : (
                <span className="text-xs text-gray-400">100 Credits</span>
              )}
            </div>
          </div>

          {priceError && (
            <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-700/40 text-amber-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{priceError}</span>
            </div>
          )}

          {/* Optional Promo / Coupon Code */}
          <div className="space-y-1.5">
            <label
              htmlFor="topup-promo-code"
              className="text-xs font-medium text-gray-300 flex items-center space-x-1.5"
            >
              <Tag className="w-3.5 h-3.5 text-purple-400" />
              <span>Promo or Coupon Code (optional)</span>
            </label>
            <input
              id="topup-promo-code"
              type="text"
              data-testid="topup-promo-code-input"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
              placeholder="Enter promo code..."
              className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          {checkoutError && (
            <div
              data-testid="topup-error-banner"
              className="p-2.5 rounded-lg bg-red-950/50 border border-red-800 text-red-200 text-xs flex items-center space-x-2"
            >
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{checkoutError}</span>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end space-x-2 border-t border-[#30363d]">
            <button
              type="button"
              onClick={closeTopUpModal}
              className="px-3.5 py-2 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-[#21262d] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="topup-checkout-button"
              disabled={creatingCheckout}
              className="flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white shadow-sm transition-colors cursor-pointer"
            >
              {creatingCheckout ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Redirecting to Stripe...</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>
                    Buy 100 Credits{priceInfo?.formattedPrice ? ` (${priceInfo.formattedPrice})` : ''}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
