import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import * as admin from 'firebase-admin';
import {
  isStripeSandboxEnabled,
  getStripeSecretKey,
  getStripePublishableKey,
  getStripeProductId,
} from '../config/env';
import { ensureUserCredits, INITIAL_AI_CREDITS, TOP_UP_CREDITS_AMOUNT } from '../services/creditsService';
import { logger } from '../services/logger';

export const stripeRouter = Router();

export function getStripeInstance(): Stripe {
  return new Stripe(getStripeSecretKey());
}

async function resolveOptionalAuthUser(req: Request): Promise<{ uid?: string; email?: string }> {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.split('Bearer ')[1].trim();
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      return { uid: decoded.uid, email: decoded.email };
    } catch {
      // Ignore if optional
    }
  }
  return {};
}

export async function handleCreateCheckoutSession(
  body: Record<string, any>,
  req: Request,
  res: Response
): Promise<Response> {
  const authUser = await resolveOptionalAuthUser(req);
  const ownerUid = body.ownerUid || authUser.uid;
  const email = body.email || authUser.email;
  const { successUrl, cancelUrl, couponCode, promotionCode, creditsCount = TOP_UP_CREDITS_AMOUNT } = body;

  const userKey = ownerUid || email;
  if (!userKey) {
    logger.warn('[stripeService] Request missing ownerUid or email parameter', (req as any).executionId);
    return res.status(400).json({ error: 'Missing ownerUid or email parameter' });
  }

  const stripe = getStripeInstance();

  const origin = req.headers?.origin;
  if (!origin && (!successUrl || !cancelUrl)) {
    return res.status(400).json({
      error: '[stripeService] Missing mandatory Origin header or explicit successUrl and cancelUrl parameters. Fail-fast enabled.',
    });
  }

  let defaultSuccess =
    successUrl || `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}&credits=${creditsCount}`;
  if (!defaultSuccess.includes('session_id=')) {
    const sep = defaultSuccess.includes('?') ? '&' : '?';
    defaultSuccess = `${defaultSuccess}${sep}session_id={CHECKOUT_SESSION_ID}`;
  }
  const defaultCancel = cancelUrl || `${origin}/?checkout=canceled`;

  const productId = String(body.productId || req.query?.productId || getStripeProductId()).trim();

  let lineItem: Stripe.Checkout.SessionCreateParams.LineItem;

  try {
    const product = await stripe.products.retrieve(productId, { expand: ['default_price'] });
    if (product && product.default_price) {
      const priceObj = typeof product.default_price === 'object' ? product.default_price : null;
      const priceId = priceObj ? priceObj.id : (product.default_price as string);
      lineItem = {
        price: priceId,
        quantity: 1,
      };
      logger.info(
        `[stripeService] Queried product ${productId} from Stripe: retrieved price ${priceId}`,
        (req as any).executionId
      );
    } else {
      throw new Error(`Product ${productId} has no default_price configured in Stripe`);
    }
  } catch (pErr: any) {
    logger.error(
      `[stripeService] Failed to query product ${productId} from Stripe: ${pErr.message}`,
      (req as any).executionId
    );
    return res
      .status(500)
      .json({ error: `Failed to query product ${productId} from Stripe: ${pErr.message}` });
  }

  const sessionConfig: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    allow_promotion_codes: true,
    line_items: [lineItem],
    client_reference_id: ownerUid || email,
    metadata: {
      ownerUid: ownerUid || '',
      email: email || '',
      type: 'credit_topup',
      credits: String(creditsCount),
    },
    success_url: defaultSuccess,
    cancel_url: defaultCancel,
  };

  const targetCode = String(promotionCode || couponCode || '').trim();
  if (targetCode) {
    try {
      const promoList = await stripe.promotionCodes.list({
        code: targetCode,
        active: true,
        limit: 1,
      });
      if (promoList.data && promoList.data.length > 0) {
        sessionConfig.discounts = [{ promotion_code: promoList.data[0].id }];
        delete sessionConfig.allow_promotion_codes;
      } else {
        try {
          const coupon = await stripe.coupons.retrieve(targetCode);
          if (coupon && coupon.valid !== false) {
            sessionConfig.discounts = [{ coupon: coupon.id }];
            delete sessionConfig.allow_promotion_codes;
          }
        } catch {
          logger.warn(
            `[stripeService] Coupon code "${targetCode}" not found directly in Stripe, proceeding with allow_promotion_codes=true`,
            (req as any).executionId
          );
        }
      }
    } catch (err: any) {
      logger.warn(
        `[stripeService] Failed to lookup promo code "${targetCode}": ${err.message}`,
        (req as any).executionId
      );
    }
  }

  if (email) {
    sessionConfig.customer_email = email;
  }

  try {
    const session = await stripe.checkout.sessions.create(sessionConfig);
    logger.info(
      `[stripeService] Created Stripe checkout session ${session.id} for user ${userKey}`,
      (req as any).executionId
    );

    return res.status(200).json({
      success: true,
      url: session.url,
      sessionId: session.id,
    });
  } catch (err: any) {
    logger.error(`[stripeService] Stripe Checkout creation failed: ${err.message}`, (req as any).executionId);
    return res.status(500).json({ error: `Stripe Checkout creation failed: ${err.message}` });
  }
}

export async function handleGetProductPrice(req: Request, res: Response): Promise<Response> {
  const stripe = getStripeInstance();
  const productId = String(req.query?.productId || req.body?.productId || getStripeProductId()).trim();

  try {
    const product = await stripe.products.retrieve(productId, { expand: ['default_price'] });
    if (!product.default_price) {
      throw new Error(`Product ${productId} does not have a default_price configured in Stripe`);
    }

    const priceObj = typeof product.default_price === 'object' ? (product.default_price as Stripe.Price) : null;
    const unitAmount = priceObj?.unit_amount;
    if (unitAmount === undefined || unitAmount === null) {
      throw new Error(`Product ${productId} default_price does not specify a unit_amount`);
    }

    const currency = priceObj?.currency;
    if (!currency) {
      throw new Error(`Product ${productId} default_price does not specify a currency`);
    }
    const formattedPrice = (unitAmount / 100).toLocaleString('en-GB', {
      style: 'currency',
      currency: currency.toUpperCase(),
    });

    return res.status(200).json({
      productId: product.id,
      name: product.name,
      description: product.description,
      unitAmount,
      currency,
      formattedPrice,
      priceId: priceObj?.id,
    });
  } catch (err: any) {
    logger.error(
      `[stripeService] Error querying product price for ${productId}: ${err.message}`,
      (req as any).executionId
    );
    return res.status(500).json({ error: err.message });
  }
}

export async function handleVerifyCheckoutSession(
  body: Record<string, any>,
  req: Request,
  res: Response
): Promise<Response> {
  const authUser = await resolveOptionalAuthUser(req);
  const sessionId = (body?.sessionId || req?.query?.sessionId) as string | undefined;
  const ownerUid = (body?.ownerUid || req?.query?.ownerUid || authUser.uid) as string | undefined;

  if (!sessionId) {
    logger.warn('[stripeService] handleVerifyCheckoutSession missing sessionId parameter', (req as any).executionId);
    return res.status(400).json({ error: 'Missing sessionId parameter' });
  }

  const stripe = getStripeInstance();

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session) {
      return res.status(404).json({ error: `Checkout session ${sessionId} not found` });
    }

    if (
      session.payment_status !== 'paid' &&
      !(isStripeSandboxEnabled() && sessionId.startsWith('cs_test_'))
    ) {
      logger.warn(
        `[stripeService] Session ${sessionId} payment_status is '${session.payment_status}', not 'paid'`,
        (req as any).executionId
      );
      return res.status(400).json({
        error: 'Payment has not been completed for this session',
        paymentStatus: session.payment_status,
      });
    }

    const targetUid = ownerUid || session.metadata?.ownerUid || session.client_reference_id;
    if (!targetUid) {
      logger.warn(`[stripeService] Could not determine ownerUid for session ${sessionId}`, (req as any).executionId);
      return res.status(400).json({ error: 'Could not determine ownerUid for checkout session' });
    }

    const addedCredits = Number(session.metadata?.credits) || TOP_UP_CREDITS_AMOUNT;
    const db = admin.firestore();

    // Idempotency check: check if already fulfilled in processed_stripe_sessions
    const sessionRef = db.collection('processed_stripe_sessions').doc(sessionId);
    const sessionSnap = await sessionRef.get();

    if (sessionSnap.exists) {
      logger.info(`[stripeService] Session ${sessionId} was already fulfilled previously.`, (req as any).executionId);
      const userSnap = await db.collection('users').doc(targetUid).get();
      const currentCredits = userSnap.exists ? (userSnap.data()?.aiCredits ?? INITIAL_AI_CREDITS) : INITIAL_AI_CREDITS;
      return res.status(200).json({
        success: true,
        fulfilled: true,
        alreadyFulfilled: true,
        aiCredits: currentCredits,
      });
    }

    // Fulfill credits and record session atomically
    const userRef = db.collection('users').doc(targetUid);
    let updatedCredits = addedCredits;

    await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      const now = new Date().toISOString();
      if (userDoc.exists) {
        const existingCredits =
          typeof userDoc.data()?.aiCredits === 'number' ? userDoc.data()!.aiCredits : INITIAL_AI_CREDITS;
        updatedCredits = existingCredits + addedCredits;
        transaction.update(userRef, {
          aiCredits: updatedCredits,
          updatedAt: now,
        });
      } else {
        updatedCredits = INITIAL_AI_CREDITS + addedCredits;
        transaction.set(
          userRef,
          {
            uid: targetUid,
            email: session.customer_email || session.metadata?.email || '',
            aiCredits: updatedCredits,
            createdAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
      }

      transaction.set(sessionRef, {
        sessionId,
        uid: targetUid,
        credits: addedCredits,
        paymentStatus: session.payment_status,
        fulfilledAt: now,
      });
    });

    logger.info(
      `[stripeService] Successfully verified & fulfilled checkout session ${sessionId}: +${addedCredits} AI credits added to user ${targetUid}`,
      (req as any).executionId
    );

    return res.status(200).json({
      success: true,
      fulfilled: true,
      alreadyFulfilled: false,
      aiCredits: updatedCredits,
    });
  } catch (err: any) {
    logger.error(
      `[stripeService] Error verifying checkout session ${sessionId}: ${err.message}`,
      (req as any).executionId
    );
    return res.status(500).json({ error: `Failed to verify checkout session: ${err.message}` });
  }
}

export async function handleGetUserCredits(req: Request, res: Response): Promise<Response> {
  const authUser = await resolveOptionalAuthUser(req);
  const uid = (req.body?.uid || req.query?.uid || authUser.uid) as string | undefined;
  const email = (req.body?.email || req.query?.email || authUser.email) as string | undefined;

  if (!uid) {
    return res.status(400).json({ error: 'Missing uid parameter' });
  }

  try {
    const aiCredits = await ensureUserCredits(uid, email);
    return res.status(200).json({ uid, aiCredits });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function handleWebhook(req: Request, res: Response): Promise<Response> {
  const stripe = getStripeInstance();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event: any = req.body;
  if (Buffer.isBuffer(event)) {
    try {
      event = JSON.parse(event.toString('utf8'));
    } catch {
      // ignore
    }
  } else if (typeof event === 'string') {
    try {
      event = JSON.parse(event);
    } catch {
      // ignore
    }
  }

  if (stripe && webhookSecret && req.headers['stripe-signature']) {
    try {
      const sig = req.headers['stripe-signature'] as string;
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err: any) {
      logger.error(
        `[STRIPE WEBHOOK ERROR] Signature verification failed: ${err.message}`,
        (req as any).executionId
      );
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }

  logger.info(`[STRIPE WEBHOOK] Received event: ${event?.type}`, (req as any).executionId);

  if (event?.type === 'checkout.session.completed') {
    const session = event.data?.object;
    const sessionId = session?.id;
    const ownerUid = session?.metadata?.ownerUid || session?.client_reference_id;
    const userEmail = session?.metadata?.email || session?.customer_email || '';
    const addedCredits = Number(session?.metadata?.credits) || TOP_UP_CREDITS_AMOUNT;

    logger.info(
      `[STRIPE WEBHOOK] Checkout session completed for sessionId: ${sessionId}, ownerUid: ${ownerUid}, userEmail: ${userEmail}, credits: ${addedCredits}`,
      (req as any).executionId
    );

    if (sessionId) {
      const db = admin.firestore();
      const sessionRef = db.collection('processed_stripe_sessions').doc(sessionId);
      const sessionSnap = await sessionRef.get();
      if (sessionSnap.exists) {
        logger.info(
          `[STRIPE WEBHOOK] Session ${sessionId} already processed and fulfilled.`,
          (req as any).executionId
        );
        return res.status(200).json({ received: true, alreadyFulfilled: true });
      }

      let targetUid = ownerUid;
      if (!targetUid && userEmail) {
        const userQuery = await db.collection('users').where('email', '==', userEmail).get();
        if (!userQuery.empty) {
          targetUid = userQuery.docs[0].id;
        }
      }

      if (targetUid) {
        const userRef = db.collection('users').doc(targetUid);
        await db.runTransaction(async (transaction) => {
          const userDoc = await transaction.get(userRef);
          const now = new Date().toISOString();
          if (userDoc.exists) {
            const existingCredits =
              typeof userDoc.data()?.aiCredits === 'number' ? userDoc.data()!.aiCredits : INITIAL_AI_CREDITS;
            transaction.update(userRef, {
              aiCredits: existingCredits + addedCredits,
              updatedAt: now,
            });
          } else {
            transaction.set(
              userRef,
              {
                uid: targetUid,
                email: userEmail,
                aiCredits: INITIAL_AI_CREDITS + addedCredits,
                createdAt: now,
                updatedAt: now,
              },
              { merge: true }
            );
          }

          transaction.set(sessionRef, {
            sessionId,
            uid: targetUid,
            credits: addedCredits,
            paymentStatus: session.payment_status || 'paid',
            fulfilledAt: now,
          });
        });
        logger.info(
          `[STRIPE WEBHOOK] Successfully credited +${addedCredits} AI credits to user document ${targetUid}`,
          (req as any).executionId
        );
      }
    }
  }

  return res.status(200).json({ received: true });
}

stripeRouter.post('/checkout-session', async (req, res) => {
  await handleCreateCheckoutSession(req.body || {}, req, res);
});

stripeRouter.get('/product-price', async (req, res) => {
  await handleGetProductPrice(req, res);
});

stripeRouter.post('/verify-session', async (req, res) => {
  await handleVerifyCheckoutSession(req.body || {}, req, res);
});

stripeRouter.get('/user-credits', async (req, res) => {
  await handleGetUserCredits(req, res);
});

stripeRouter.post('/webhook', async (req, res) => {
  await handleWebhook(req, res);
});

export { isStripeSandboxEnabled, getStripeSecretKey, getStripePublishableKey };
