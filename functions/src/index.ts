import * as admin from 'firebase-admin';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';
import express from 'express';
import cors from 'cors';
import { chatRouter } from './routes/chat';
import { classroomRouter } from './routes/classroom';
import { uploadRouter } from './routes/upload';
import { stripeRouter } from './routes/stripe';
import { requestLogger } from './services/logger';

// Set global options for 2nd Gen Cloud Functions
setGlobalOptions({ region: 'europe-west2' });

import './config/env';
import * as path from 'path';
import * as fs from 'fs';

// Ensure auth emulation is completely disabled: Firebase Admin Auth must always verify real tokens with Google
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;

// Initialize Firebase Admin SDK
// STRICT PRODUCTION POLICY: On GCP Cloud Functions, strictly initialize with zero arguments using
// Google Cloud managed Application Default Credentials (ADC). Never load serviceAccountKey.json in production.
if (admin.apps.length === 0) {
  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
  if (isEmulator) {
    const candidatePaths = [
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH ? path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH) : '',
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH ? path.resolve(__dirname, '../..', process.env.FIREBASE_SERVICE_ACCOUNT_PATH) : '',
      path.resolve(__dirname, '../../serviceAccountKey.json'),
      path.resolve(process.cwd(), 'serviceAccountKey.json'),
    ].filter(Boolean);

    const saPath = candidatePaths.find((p) => fs.existsSync(p));
    if (saPath) {
      const serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id || 'classroom-agent-511917',
      });
      console.log(`[Firebase Admin] Initialized in emulator with service account: ${saPath}`);
    } else {
      console.warn('[Firebase Admin] No serviceAccountKey.json found for emulator; falling back to default admin.initializeApp()');
      admin.initializeApp();
    }
  } else {
    // Production runtime on GCP: strictly use managed GCP environment credentials
    admin.initializeApp();
  }
}

// Enable Firestore to ignore undefined properties
admin.firestore().settings({ ignoreUndefinedProperties: true });

const app = express();

// Middleware (preserve rawBody for Stripe Webhook signature verification)
app.use(cors({ origin: true }));
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(requestLogger);

// Routes mounted under both `/` (direct Cloud Function URL .../europe-west2/api/*)
// and `/api` (Firebase Hosting rewrite /api/** -> function `api` in europe-west2)
const apiRouter = express.Router();
apiRouter.use('/chat', chatRouter);
apiRouter.use('/classroom', classroomRouter);
apiRouter.use('/upload', uploadRouter);
apiRouter.use('/assignments', classroomRouter);
apiRouter.use('/stripe', stripeRouter);

// Health check endpoint
apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'healthy', region: 'europe-west2', timestamp: new Date().toISOString() });
});

app.use('/api', apiRouter);
app.use('/', apiRouter);

// Export Cloud Function in europe-west2
export const api = onRequest(
  {
    region: 'europe-west2',
    cors: true,
    invoker: 'public',
    timeoutSeconds: 300,
    memory: '1GiB',
  },
  app
);
