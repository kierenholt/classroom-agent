import * as dotenv from 'dotenv';
import * as path from 'path';

// Attempt to load .env.local and .env from project root if not already set
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(`[Server Configuration Failure] Missing mandatory environment variable: ${key}. Fail-fast enabled.`);
  }
  return value.trim();
}

export const serverEnv = {
  GCP_PROJECT_ID: process.env.GCP_PROJECT_ID || process.env.GCLOUD_PROJECT || requireEnv('GCP_PROJECT_ID'),
  GEMINI_API_KEY: requireEnv('GEMINI_API_KEY'),
  GEMINI_MODEL: requireEnv('GEMINI_MODEL'),
};
