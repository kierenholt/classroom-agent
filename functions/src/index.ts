import * as admin from 'firebase-admin';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';
import express from 'express';
import cors from 'cors';
import { chatRouter } from './routes/chat';
import { classroomRouter } from './routes/classroom';
import { uploadRouter } from './routes/upload';

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

// Routes
app.use('/api/chat', chatRouter);
app.use('/api/classroom', classroomRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/assignments', classroomRouter);

// Root health check endpoint
app.get('/api/health', (_req, res) => {
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
