import * as admin from 'firebase-admin';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';
import express from 'express';
import cors from 'cors';
import { chatRouter } from './routes/chat';
import { classroomRouter } from './routes/classroom';
import { uploadRouter } from './routes/upload';
import { requestLogger } from './services/logger';

// Set global options for 2nd Gen Cloud Functions
setGlobalOptions({ region: 'europe-west2' });

// Initialize Firebase Admin SDK
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const app = express();

// Middleware
app.use(cors({ origin: true }));
app.use(express.json());
app.use(requestLogger);

// Routes mounted under the `api` Cloud Function (e.g., .../europe-west2/api/chat, .../europe-west2/api/classroom)
app.use('/chat', chatRouter);
app.use('/classroom', classroomRouter);
app.use('/upload', uploadRouter);
app.use('/assignments', classroomRouter);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Export Cloud Function
export const api = onRequest(
  {
    region: 'europe-west2',
    cors: true,
    timeoutSeconds: 300,
    memory: '1GiB',
  },
  app
);
