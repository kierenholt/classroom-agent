import net from 'net';
import path from 'path';
import { createRequire } from 'module';
import { test as base, expect } from '@playwright/test';

const require = createRequire(import.meta.url);

interface ActiveTail {
  type: string;
  unsubscribe?: () => void;
}

let activeTails: ActiveTail[] = [];
let startTime: Date | null = null;
const seenExecutions = new Set<string>();
let activeTestName: string | null = null;

const EMULATOR_HOST = process.env.VITE_FIRESTORE_EMULATOR_HOST || '127.0.0.1';
const EMULATOR_PORT = parseInt(process.env.VITE_FIRESTORE_EMULATOR_PORT || '8080', 10);
const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || 'classroom-agent-511917';

/**
 * Prepares environment variables for logging depending on environment mode.
 */
export async function prepareLoggingEnvironment(isProduction: boolean): Promise<boolean> {
  if (!isProduction) {
    const isEmulatorUp = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection(EMULATOR_PORT, EMULATOR_HOST);
      socket.setTimeout(1500);
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });

    if (!isEmulatorUp) {
      console.log(`[TEST LOG] Firestore emulator not reachable on ${EMULATOR_HOST}:${EMULATOR_PORT}. Skipping log tailing.`);
      return false;
    }
  }
  return true;
}

/**
 * Starts tailing logs from Firestore function_logs collection.
 */
export async function startLogging(testName: string, isProduction: boolean = false, forceResetTime: boolean = false): Promise<void> {
  if (typeof isProduction !== 'boolean') {
    throw new Error('isProduction parameter is required and must be a boolean. Fail-fast enabled.');
  }

  // Prevent redundant tailing listeners if logging is already active for the current test
  if (activeTails.length > 0 && activeTestName === testName) {
    if (forceResetTime) {
      startTime = new Date();
    }
    return;
  }

  await stopLogging();

  const isReady = await prepareLoggingEnvironment(isProduction);
  if (!isReady && !isProduction) {
    return;
  }

  activeTestName = testName;
  seenExecutions.clear();

  const dbOptions: Record<string, any> = {
    projectId: PROJECT_ID,
  };

  if (isProduction) {
    delete process.env.FIRESTORE_EMULATOR_HOST;
    delete process.env.STORAGE_EMULATOR_HOST;
  } else {
    dbOptions.host = `${EMULATOR_HOST}:${EMULATOR_PORT}`;
    dbOptions.ssl = false;
  }

  const firestoreModulePath = path.resolve(process.cwd(), 'functions/node_modules/@google-cloud/firestore');
  const { Firestore } = require(firestoreModulePath);
  const db = new Firestore(dbOptions);

  // Clean up any expired logs in emulator on startup to prevent bloat
  if (!isProduction) {
    try {
      const expiredLogs = await db.collection('function_logs')
        .where('expireAt', '<=', new Date())
        .get();
      if (expiredLogs.size > 0) {
        const batch = db.batch();
        expiredLogs.forEach((doc: any) => batch.delete(doc.ref));
        await batch.commit();
        console.log(`[TEST LOG] Cleaned up ${expiredLogs.size} expired logs from Firestore emulator.`);
      }
    } catch {
      // Ignore local cleanup errors
    }
  }

  startTime = new Date();
  console.log(`[TEST LOG] Connected to Firestore database '(default)' for test "${testName}". Tailing function_logs since ${startTime.toISOString()}...`);

  // Listen to function_logs collection in real time
  const unsubscribe = db.collection('function_logs')
    .where('timestamp', '>=', startTime)
    .onSnapshot((snapshot: any) => {
      const docs = snapshot.docChanges()
        .filter((change: any) => change.type === 'added')
        .map((change: any) => change.doc.data());

      // Sort logs by timestamp client-side to ensure chronological order
      docs.sort((a: any, b: any) => {
        const timeA = a.timestamp ? (typeof a.timestamp.toDate === 'function' ? a.timestamp.toDate().getTime() : new Date(a.timestamp).getTime()) : 0;
        const timeB = b.timestamp ? (typeof b.timestamp.toDate === 'function' ? b.timestamp.toDate().getTime() : new Date(b.timestamp).getTime()) : 0;
        return timeA - timeB;
      });

      docs.forEach((data: any) => {
        const timestampStr = data.timestamp ? (typeof data.timestamp.toDate === 'function' ? data.timestamp.toDate().toISOString() : new Date(data.timestamp).toISOString()) : new Date().toISOString();
        const logLine = `[${timestampStr}] [${(data.service || 'CLASSROOM-AGENT').toUpperCase()}] [${data.level}] ${data.message ? data.message.trim() : ''}`;

        // Print directly to stdout of the test runner
        process.stdout.write(logLine + '\n');

        // Announce execution ID when first detected
        if (data.executionId && !seenExecutions.has(data.executionId)) {
          seenExecutions.add(data.executionId);
          process.stdout.write(`[TEST LOG] Tailing Firestore logs for execution ID: ${data.executionId}\n`);
        }
      });
    }, (err: any) => {
      console.error(`[FIRESTORE LOG TAIL ERROR] ${err.message}`);
    });

  activeTails.push({ type: 'firestore', unsubscribe });
}

/**
 * Stops tailing logs.
 */
export async function stopLogging(): Promise<void> {
  for (const tail of activeTails) {
    if (tail.unsubscribe) {
      tail.unsubscribe();
    }
  }
  activeTails = [];
  activeTestName = null;

  if (seenExecutions.size > 0) {
    console.log(`[TEST LOG] Finished test. Logged execution IDs: ${Array.from(seenExecutions).join(', ')}`);
    seenExecutions.clear();
  }
}

/**
 * Creates a Playwright test fixture wrapper configured for automatic log tailing throughout tests.
 */
export function createLoggingFixture(forcedIsProduction?: boolean) {
  return base.extend({
    autoLog: [
      async ({}, use, testInfo) => {
        const projectIsProd = Boolean((testInfo.project?.use as any)?.isProduction);
        const isProd = typeof forcedIsProduction === 'boolean' ? forcedIsProduction : projectIsProd;
        await startLogging(testInfo.title, isProd);
        await use();
        await stopLogging();
      },
      { auto: true },
    ],
  });
}

export const test = createLoggingFixture();
export { expect };
