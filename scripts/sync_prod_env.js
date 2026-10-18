#!/usr/bin/env node
/**
 * Syncs backend/server environment variables from root `.env.production`
 * into `functions/.env.classroom-agent-511917` for Firebase Cloud Functions (europe-west2) deployment.
 *
 * Excludes client-only `VITE_*` variables and Firebase CLI reserved prefixes (`FIREBASE_*`, `GCLOUD_*`).
 * Fails fast if `.env.production` or any mandatory server variable is missing.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const prodEnvPath = path.join(rootDir, '.env.production');
const targetEnvPath = path.join(rootDir, 'functions', '.env.classroom-agent-511917');

if (!fs.existsSync(prodEnvPath)) {
  console.error(`[sync_prod_env] ERROR: Missing ${prodEnvPath}. Fail-fast enabled.`);
  process.exit(1);
}

const rawContent = fs.readFileSync(prodEnvPath, 'utf8');
const parsed = dotenv.parse(rawContent);

const REQUIRED_KEYS = [
  'GCP_PROJECT_ID',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'STRIPE_SANDBOX_ENABLED',
  'STRIPE_SANDBOX_PRODUCT_ID',
  'STRIPE_SANDBOX_ACCOUNT_ID',
  'STRIPE_SANDBOX_SECRET_KEY',
  'STRIPE_SANDBOX_PUBLISHABLE_KEY',
  'STRIPE_LIVE_PRODUCT_ID',
  'STRIPE_LIVE_ACCOUNT_ID',
  'STRIPE_LIVE_SECRET_KEY',
  'STRIPE_LIVE_PUBLISHABLE_KEY',
];

for (const key of REQUIRED_KEYS) {
  if (!parsed[key] || parsed[key].trim() === '') {
    console.error(`[sync_prod_env] ERROR: Missing mandatory server env variable "${key}" in .env.production.`);
    process.exit(1);
  }
}

const lines = [
  '# Auto-generated from .env.production by scripts/sync_prod_env.js',
  '# Used by Firebase Cloud Functions (region: europe-west2) in project classroom-agent-511917',
];

for (const [key, value] of Object.entries(parsed)) {
  if (
    key.startsWith('VITE_') ||
    key.startsWith('FIREBASE_') ||
    key.startsWith('GCLOUD_') ||
    key.startsWith('TEST_')
  ) {
    continue;
  }
  lines.push(`${key}=${value}`);
}

fs.writeFileSync(targetEnvPath, lines.join('\n') + '\n', 'utf8');
console.error(`[sync_prod_env] Synced production server environment variables to ${path.relative(rootDir, targetEnvPath)}`);
