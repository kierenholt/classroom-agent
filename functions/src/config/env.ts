import * as dotenv from 'dotenv';
import * as path from 'path';

const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';

// In local emulator, prioritize .env.local from project root.
// In production or deployment discovery, prioritize functions/.env.classroom-agent-511917 and root .env.production.
if (isEmulator) {
  dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });
}
dotenv.config({ path: path.resolve(__dirname, '../../.env.classroom-agent-511917') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.production') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(`[Server Configuration Failure] Missing mandatory environment variable: ${key}. Fail-fast enabled.`);
  }
  return value.trim();
}

export function isStripeSandboxEnabled(): boolean {
  const raw = requireEnv('STRIPE_SANDBOX_ENABLED').toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(
    `[Server Configuration Failure] Invalid STRIPE_SANDBOX_ENABLED value "${raw}". Must be "true" or "false". Fail-fast enabled.`
  );
}

export function getStripeSecretKey(): string {
  if (isStripeSandboxEnabled()) {
    return requireEnv('STRIPE_SANDBOX_SECRET_KEY');
  }
  return requireEnv('STRIPE_LIVE_SECRET_KEY');
}

export function getStripePublishableKey(): string {
  if (isStripeSandboxEnabled()) {
    return requireEnv('STRIPE_SANDBOX_PUBLISHABLE_KEY');
  }
  return requireEnv('STRIPE_LIVE_PUBLISHABLE_KEY');
}

export function getStripeProductId(): string {
  if (isStripeSandboxEnabled()) {
    return requireEnv('STRIPE_SANDBOX_PRODUCT_ID');
  }
  return requireEnv('STRIPE_LIVE_PRODUCT_ID');
}

export function getStripeAccountId(): string {
  if (isStripeSandboxEnabled()) {
    return requireEnv('STRIPE_SANDBOX_ACCOUNT_ID');
  }
  return requireEnv('STRIPE_LIVE_ACCOUNT_ID');
}

export const serverEnv = {
  GCP_PROJECT_ID: requireEnv('GCP_PROJECT_ID'),
  GEMINI_API_KEY: requireEnv('GEMINI_API_KEY'),
  GEMINI_MODEL: requireEnv('GEMINI_MODEL'),
  STRIPE_SANDBOX_ENABLED: isStripeSandboxEnabled(),
  STRIPE_SECRET_KEY: getStripeSecretKey(),
  STRIPE_PUBLISHABLE_KEY: getStripePublishableKey(),
  STRIPE_PRODUCT_ID: getStripeProductId(),
  STRIPE_ACCOUNT_ID: getStripeAccountId(),
};


