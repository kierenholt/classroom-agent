import * as admin from 'firebase-admin';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export interface LogEntry {
  level: LogLevel;
  message: string;
  service?: string;
  executionId?: string;
  metadata?: Record<string, any>;
}

export interface AuthenticatedLogRequest extends Request {
  executionId?: string;
}

function sanitizeFirestoreData(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeFirestoreData);
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = sanitizeFirestoreData(value);
    }
  }
  return result;
}

/**
 * Writes a structured log entry to Firestore's function_logs collection and stdout/stderr.
 */
export async function writeFunctionLog(entry: LogEntry): Promise<void> {
  const service = entry.service || 'classroom-agent';
  const executionId = entry.executionId || 'system';
  const now = new Date();
  const expireAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24-hour retention

  // Local console mirroring
  const consoleMsg = `[${now.toISOString()}] [${service.toUpperCase()}] [${entry.level}] ${entry.message.trim()}`;
  if (entry.level === 'ERROR') {
    console.error(consoleMsg, entry.metadata || '');
  } else if (entry.level === 'WARN') {
    console.warn(consoleMsg, entry.metadata || '');
  } else {
    console.log(consoleMsg, entry.metadata || '');
  }

  // Firestore function_logs write
  try {
    if (admin.apps.length > 0) {
      const db = admin.firestore();
      const sanitizedMetadata = entry.metadata ? sanitizeFirestoreData(entry.metadata) : null;
      await db.collection('function_logs').add({
        timestamp: now,
        service,
        level: entry.level,
        message: entry.message,
        executionId,
        expireAt,
        ...(sanitizedMetadata ? { metadata: sanitizedMetadata } : {}),
      });
    }
  } catch (err: any) {
    // Non-blocking fallback: logging failure must never abort request execution
    console.warn(`[LOGGER WARNING] Failed to persist log entry to Firestore function_logs: ${err.message}`);
  }
}

export const logger = {
  info: (message: string, executionId?: string, metadata?: Record<string, any>) =>
    writeFunctionLog({ level: 'INFO', message, executionId, metadata }),
  warn: (message: string, executionId?: string, metadata?: Record<string, any>) =>
    writeFunctionLog({ level: 'WARN', message, executionId, metadata }),
  error: (message: string, executionId?: string, metadata?: Record<string, any>) =>
    writeFunctionLog({ level: 'ERROR', message, executionId, metadata }),
  debug: (message: string, executionId?: string, metadata?: Record<string, any>) =>
    writeFunctionLog({ level: 'DEBUG', message, executionId, metadata }),
};

/**
 * Express middleware to assign executionId and log incoming requests and response latency.
 */
export function requestLogger(req: AuthenticatedLogRequest, res: Response, next: NextFunction): void {
  const headerExecutionId = req.headers['x-execution-id'];
  const executionId = (Array.isArray(headerExecutionId) ? headerExecutionId[0] : headerExecutionId) || crypto.randomUUID();
  req.executionId = executionId;

  const startHrTime = process.hrtime();
  const method = req.method;
  const path = req.originalUrl || req.url;

  // Log request arrival
  const arrivalLogPromise = logger.info(`--> ${method} ${path}`, executionId, {
    method,
    path,
    ip: req.ip || 'unknown',
  });

  // Intercept res.end so both arrival and completion logs flush to Firestore before Cloud Run throttles CPU
  const originalEnd = res.end.bind(res);
  let endCalled = false;

  (res as any).end = function (...args: any[]) {
    if (endCalled) {
      return originalEnd(...args);
    }
    endCalled = true;

    const elapsedHrTime = process.hrtime(startHrTime);
    const elapsedMs = Math.round((elapsedHrTime[0] * 1000) + (elapsedHrTime[1] / 1000000));
    const statusCode = res.statusCode;

    let level: LogLevel = 'INFO';
    if (statusCode >= 500) {
      level = 'ERROR';
    } else if (statusCode >= 400) {
      level = 'WARN';
    }

    const completionLogPromise = writeFunctionLog({
      level,
      message: `<-- ${method} ${path} ${statusCode} (${elapsedMs}ms)`,
      executionId,
      metadata: {
        method,
        path,
        statusCode,
        durationMs: elapsedMs,
      },
    });

    Promise.allSettled([arrivalLogPromise, completionLogPromise]).finally(() => {
      originalEnd(...args);
    });

    return res;
  };

  next();
}
