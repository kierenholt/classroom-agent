import { test, expect } from '../helpers/logHelper';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

test.describe('Firestore function_logs Tailing & Persistence', () => {
  const EMULATOR_HOST = process.env.VITE_FIRESTORE_EMULATOR_HOST || '127.0.0.1';
  const EMULATOR_PORT = process.env.VITE_FIRESTORE_EMULATOR_PORT || '8080';
  const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || 'classroom-agent-511917';
  const FUNCTIONS_HOST = process.env.VITE_FUNCTIONS_EMULATOR_HOST || '127.0.0.1';
  const FUNCTIONS_PORT = process.env.VITE_FUNCTIONS_EMULATOR_PORT || '5001';

  const isProd = process.env.TEST_ENV === 'prod' || process.env.TEST_ENV === 'production';

  test('functionLogs_cloudFunctionInvoked_persistsToFirestoreAndTails_test', async () => {
    const firestoreModulePath = path.resolve(process.cwd(), 'functions/node_modules/@google-cloud/firestore');
    const { Firestore } = require(firestoreModulePath);
    const fs = require('fs');
    const saPath = path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 'serviceAccountKey.json');

    const db = new Firestore(
      isProd
        ? {
            projectId: PROJECT_ID,
            ...(fs.existsSync(saPath) ? { keyFilename: saPath } : {}),
          }
        : {
            projectId: PROJECT_ID,
            host: `${EMULATOR_HOST}:${EMULATOR_PORT}`,
            ssl: false,
          }
    );

    const testExecutionId = `test_exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 1. Invoke Cloud Functions /health endpoint with custom x-execution-id
    const healthUrl = isProd
      ? `https://europe-west2-${PROJECT_ID}.cloudfunctions.net/api/health`
      : `http://${FUNCTIONS_HOST}:${FUNCTIONS_PORT}/${PROJECT_ID}/europe-west2/api/health`;
    const res = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        'x-execution-id': testExecutionId,
      },
    });

    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.status).toBe('healthy');

    // 2. Query Firestore function_logs collection for the written log entries
    // Poll briefly to allow asynchronous Firestore write to commit
    let logs: any[] = [];
    for (let attempt = 0; attempt < 10; attempt++) {
      const snapshot = await db.collection('function_logs')
        .where('executionId', '==', testExecutionId)
        .get();

      if (snapshot.size >= 2) {
        logs = snapshot.docs.map((doc: any) => doc.data());
        break;
      } else if (!snapshot.empty) {
        logs = snapshot.docs.map((doc: any) => doc.data());
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    expect(logs.length).toBeGreaterThan(0);
    const requestLog = logs.find((l: any) => l.message.includes('--> GET /health'));
    const responseLog = logs.find((l: any) => l.message.includes('<-- GET /health 200'));

    expect(requestLog).toBeDefined();
    expect(requestLog.service).toBe('classroom-agent');
    expect(requestLog.level).toBe('INFO');
    expect(requestLog.executionId).toBe(testExecutionId);
    expect(requestLog.timestamp).toBeDefined();
    expect(requestLog.expireAt).toBeDefined();

    expect(responseLog).toBeDefined();
    expect(responseLog.level).toBe('INFO');
    expect(responseLog.executionId).toBe(testExecutionId);

    // Clean up test logs
    const cleanupSnapshot = await db.collection('function_logs')
      .where('executionId', '==', testExecutionId)
      .get();
    const batch = db.batch();
    cleanupSnapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
    await batch.commit();
  });
});
