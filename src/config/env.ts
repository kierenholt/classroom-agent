/**
 * Fail-Fast Client Environment Validator
 * Throws explicit errors immediately if any mandatory environment variable is missing.
 * No silent default fallbacks.
 */

function requireEnv(key: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(`[Configuration Failure] Missing mandatory environment variable: ${key}. Fail-fast enabled.`);
  }
  return value.trim();
}

const useFirebaseEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';

export const env = {
  PORT: Number(requireEnv('VITE_PORT', import.meta.env.VITE_PORT)),
  API_BASE_URL: requireEnv('VITE_API_BASE_URL', import.meta.env.VITE_API_BASE_URL)
    .replace(/\/+$/, '')
    .replace(/\/api\/api$/, '/api'),
  
  FIREBASE_API_KEY: requireEnv('VITE_FIREBASE_API_KEY', import.meta.env.VITE_FIREBASE_API_KEY),
  FIREBASE_AUTH_DOMAIN: requireEnv('VITE_FIREBASE_AUTH_DOMAIN', import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  FIREBASE_PROJECT_ID: requireEnv('VITE_FIREBASE_PROJECT_ID', import.meta.env.VITE_FIREBASE_PROJECT_ID),
  FIREBASE_STORAGE_BUCKET: requireEnv('VITE_FIREBASE_STORAGE_BUCKET', import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  FIREBASE_MESSAGING_SENDER_ID: requireEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  FIREBASE_APP_ID: requireEnv('VITE_FIREBASE_APP_ID', import.meta.env.VITE_FIREBASE_APP_ID),

  USE_FIREBASE_EMULATORS: useFirebaseEmulators,
  FIRESTORE_EMULATOR_HOST: useFirebaseEmulators
    ? requireEnv('VITE_FIRESTORE_EMULATOR_HOST', import.meta.env.VITE_FIRESTORE_EMULATOR_HOST)
    : (import.meta.env.VITE_FIRESTORE_EMULATOR_HOST || ''),
  FIRESTORE_EMULATOR_PORT: useFirebaseEmulators
    ? Number(requireEnv('VITE_FIRESTORE_EMULATOR_PORT', import.meta.env.VITE_FIRESTORE_EMULATOR_PORT))
    : Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || 0),
  STORAGE_EMULATOR_HOST: useFirebaseEmulators
    ? requireEnv('VITE_STORAGE_EMULATOR_HOST', import.meta.env.VITE_STORAGE_EMULATOR_HOST)
    : (import.meta.env.VITE_STORAGE_EMULATOR_HOST || ''),
  STORAGE_EMULATOR_PORT: useFirebaseEmulators
    ? Number(requireEnv('VITE_STORAGE_EMULATOR_PORT', import.meta.env.VITE_STORAGE_EMULATOR_PORT))
    : Number(import.meta.env.VITE_STORAGE_EMULATOR_PORT || 0),
  FUNCTIONS_EMULATOR_HOST: useFirebaseEmulators
    ? requireEnv('VITE_FUNCTIONS_EMULATOR_HOST', import.meta.env.VITE_FUNCTIONS_EMULATOR_HOST)
    : (import.meta.env.VITE_FUNCTIONS_EMULATOR_HOST || ''),
  FUNCTIONS_EMULATOR_PORT: useFirebaseEmulators
    ? Number(requireEnv('VITE_FUNCTIONS_EMULATOR_PORT', import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT))
    : Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || 0),
  ENABLE_EXTRACTED_TEXT_TOGGLE: import.meta.env.VITE_ENABLE_EXTRACTED_TEXT_TOGGLE === 'true',
} as const;
