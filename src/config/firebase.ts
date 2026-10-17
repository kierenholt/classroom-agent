import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { env } from './env';

const firebaseConfig = {
  apiKey: env.FIREBASE_API_KEY,
  authDomain: env.FIREBASE_AUTH_DOMAIN,
  projectId: env.FIREBASE_PROJECT_ID,
  storageBucket: env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID,
  appId: env.FIREBASE_APP_ID,
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Configure Google OAuth provider with required Classroom and Drive scopes
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.addScope('https://www.googleapis.com/auth/classroom.courses.readonly');
googleAuthProvider.addScope('https://www.googleapis.com/auth/classroom.coursework.students');
googleAuthProvider.addScope('https://www.googleapis.com/auth/classroom.rosters.readonly');
googleAuthProvider.addScope('https://www.googleapis.com/auth/classroom.student-submissions.students.readonly');
googleAuthProvider.addScope('https://www.googleapis.com/auth/drive.readonly');
googleAuthProvider.addScope('https://www.googleapis.com/auth/drive.file');
googleAuthProvider.setCustomParameters({
  prompt: 'consent',
  access_type: 'offline',
});

// Emulator connection with idempotency check
let emulatorsConnected = false;
if (env.USE_FIREBASE_EMULATORS && !emulatorsConnected) {
  try {
    connectAuthEmulator(auth, env.AUTH_EMULATOR_URL, { disableWarnings: true });
    connectFirestoreEmulator(db, env.FIRESTORE_EMULATOR_HOST, env.FIRESTORE_EMULATOR_PORT);
    connectStorageEmulator(storage, env.STORAGE_EMULATOR_HOST, env.STORAGE_EMULATOR_PORT);
    emulatorsConnected = true;
    console.info('[Firebase] Connected to local emulators successfully.');
  } catch (err) {
    console.warn('[Firebase] Emulator connection warning:', err);
  }
}
