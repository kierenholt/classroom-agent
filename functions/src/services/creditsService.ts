import * as admin from 'firebase-admin';

export const INITIAL_AI_CREDITS = 100;
export const TOP_UP_CREDITS_AMOUNT = 100;

/**
 * Ensures the user document exists in `users/{uid}` and has `aiCredits` initialized.
 * New users start with 100 AI credits.
 */
export async function ensureUserCredits(uid: string, email?: string): Promise<number> {
  if (!uid || typeof uid !== 'string' || uid.trim() === '') {
    throw new Error('[Credits Error] Missing mandatory uid parameter.');
  }

  const db = admin.firestore();
  const userRef = db.collection('users').doc(uid);

  return await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    const now = new Date().toISOString();

    if (!userSnap.exists) {
      transaction.set(userRef, {
        uid,
        email: email || '',
        aiCredits: INITIAL_AI_CREDITS,
        createdAt: now,
        updatedAt: now,
      });
      return INITIAL_AI_CREDITS;
    }

    const data = userSnap.data() || {};
    if (typeof data.aiCredits !== 'number' || Number.isNaN(data.aiCredits)) {
      transaction.set(
        userRef,
        {
          uid,
          ...(email ? { email } : {}),
          aiCredits: INITIAL_AI_CREDITS,
          updatedAt: now,
        },
        { merge: true }
      );
      return INITIAL_AI_CREDITS;
    }

    return data.aiCredits;
  });
}

/**
 * Deducts `amount` credits from `users/{uid}.aiCredits` (clamping at 0 so an in-flight turn can complete).
 * If the user doc was not yet initialized, initializes from INITIAL_AI_CREDITS - amount.
 */
export async function deductUserCredit(uid: string, amount = 1): Promise<number> {
  if (!uid || typeof uid !== 'string' || uid.trim() === '') {
    throw new Error('[Credits Error] Missing mandatory uid parameter for credit deduction.');
  }

  const db = admin.firestore();
  const userRef = db.collection('users').doc(uid);

  return await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    const now = new Date().toISOString();

    if (!userSnap.exists) {
      const nextCredits = Math.max(0, INITIAL_AI_CREDITS - amount);
      transaction.set(userRef, {
        uid,
        aiCredits: nextCredits,
        createdAt: now,
        updatedAt: now,
      });
      return nextCredits;
    }

    const data = userSnap.data() || {};
    const currentCredits =
      typeof data.aiCredits === 'number' && !Number.isNaN(data.aiCredits)
        ? data.aiCredits
        : INITIAL_AI_CREDITS;
    const nextCredits = Math.max(0, currentCredits - amount);

    transaction.update(userRef, {
      aiCredits: nextCredits,
      updatedAt: now,
    });

    return nextCredits;
  });
}
