/**
 * Test Seeder Utility for E2E Tests
 * Populates and cleans up test Sidecar fixtures (rubrics, evaluations, messages, user credits).
 * Uses local Firestore Emulator in `local` mode and live Firestore via Admin SDK in `prod` mode,
 * always cleaning up test documents after each test.
 */

import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const FIRESTORE_EMULATOR_HOST = process.env.VITE_FIRESTORE_EMULATOR_HOST || '127.0.0.1';
const FIRESTORE_EMULATOR_PORT = process.env.VITE_FIRESTORE_EMULATOR_PORT || '8080';
const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || 'classroom-agent-511917';
const IS_PROD = process.env.TEST_ENV === 'prod' || process.env.TEST_ENV === 'production';

const BASE_URL = `http://${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// In the Firebase Firestore Emulator, `Bearer owner` grants admin bypass of security rules for test seeding/cleanup
const EMULATOR_ADMIN_HEADERS = {
  'Content-Type': 'application/json',
  Authorization: 'Bearer owner',
};

let prodDbInstance: any = null;

function getProdDb(): any {
  if (prodDbInstance) return prodDbInstance;
  delete process.env.FIRESTORE_EMULATOR_HOST;
  const firestoreModulePath = path.resolve(process.cwd(), 'functions/node_modules/@google-cloud/firestore');
  const { Firestore } = require(firestoreModulePath);
  const saPath = path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 'serviceAccountKey.json');
  prodDbInstance = new Firestore({
    projectId: PROJECT_ID,
    ...(fs.existsSync(saPath) ? { keyFilename: saPath } : {}),
    ignoreUndefinedProperties: true,
  });
  return prodDbInstance;
}

export async function seedTestAssignment(assignmentId: string, assignment: Record<string, any>) {
  if (IS_PROD) {
    const db = getProdDb();
    const docData: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    if (assignment.rubric) {
      docData.rubric = {
        id: assignment.rubric.id,
        title: assignment.rubric.title,
        criteria: (assignment.rubric.criteria || []).map((c: any) => ({
          id: c.id,
          title: c.title,
          description: c.description || '',
          maxPoints: Number(c.maxPoints),
        })),
        updatedAt: new Date().toISOString(),
      };
    }
    await db.collection('assignments').doc(assignmentId).set(docData, { merge: true });
    return;
  }

  const url = `${BASE_URL}/assignments/${assignmentId}`;

  const fields: Record<string, any> = {
    updatedAt: { stringValue: new Date().toISOString() },
  };

  if (assignment.rubric) {
    fields.rubric = {
      mapValue: {
        fields: {
          id: { stringValue: assignment.rubric.id },
          title: { stringValue: assignment.rubric.title },
          criteria: {
            arrayValue: {
              values: assignment.rubric.criteria.map((c: any) => ({
                mapValue: {
                  fields: {
                    id: { stringValue: c.id },
                    title: { stringValue: c.title },
                    description: { stringValue: c.description || '' },
                    maxPoints: { integerValue: String(c.maxPoints) },
                  },
                },
              })),
            },
          },
          updatedAt: { stringValue: new Date().toISOString() },
        },
      },
    };
  }

  const res = await fetch(url, {
    method: 'PATCH',
    headers: EMULATOR_ADMIN_HEADERS,
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to seed test assignment sidecar: ${text}`);
  }
}

export async function seedTestSubmission(assignmentId: string, studentId: string, evaluation: Record<string, any>) {
  if (IS_PROD) {
    const db = getProdDb();
    const docData: Record<string, any> = {
      studentId,
      submissionId: evaluation.submissionId || studentId,
      overallFeedback: evaluation.overallFeedback || '',
      classroomSyncStatus: evaluation.classroomSyncStatus || 'UNSAVED',
      updatedAt: new Date().toISOString(),
      rubricBreakdown: (evaluation.rubricBreakdown || []).map((b: any) => ({
        criterionId: b.criterionId,
        score: Number(b.score),
        comment: b.comment || '',
      })),
      comments: (evaluation.comments || []).map((c: any) => ({
        id: c.id,
        author: c.author,
        content: c.content,
        createdAt: c.createdAt || new Date().toISOString(),
        syncedToDriveOrClassroom: c.syncedToDriveOrClassroom ?? true,
      })),
    };
    if (evaluation.draftGrade !== undefined) docData.draftGrade = Number(evaluation.draftGrade);
    if (evaluation.assignedGrade !== undefined) docData.assignedGrade = Number(evaluation.assignedGrade);
    if (evaluation.feedbackDocId !== undefined) docData.feedbackDocId = evaluation.feedbackDocId;
    if (evaluation.feedbackDocUrl !== undefined) docData.feedbackDocUrl = evaluation.feedbackDocUrl;

    await db.collection('assignments').doc(assignmentId).collection('evaluations').doc(studentId).set(docData, { merge: true });
    return;
  }

  const url = `${BASE_URL}/assignments/${assignmentId}/evaluations/${studentId}`;

  const fields: Record<string, any> = {
    studentId: { stringValue: studentId },
    submissionId: { stringValue: evaluation.submissionId || studentId },
    overallFeedback: { stringValue: evaluation.overallFeedback || '' },
    classroomSyncStatus: { stringValue: evaluation.classroomSyncStatus || 'UNSAVED' },
    updatedAt: { stringValue: new Date().toISOString() },
    rubricBreakdown: {
      arrayValue: {
        values: (evaluation.rubricBreakdown || []).map((b: any) => ({
          mapValue: {
            fields: {
              criterionId: { stringValue: b.criterionId },
              score: { integerValue: String(b.score) },
              comment: { stringValue: b.comment || '' },
            },
          },
        })),
      },
    },
    comments: {
      arrayValue: {
        values: (evaluation.comments || []).map((c: any) => ({
          mapValue: {
            fields: {
              id: { stringValue: c.id },
              author: { stringValue: c.author },
              content: { stringValue: c.content },
              createdAt: { stringValue: c.createdAt || new Date().toISOString() },
              syncedToDriveOrClassroom: { booleanValue: c.syncedToDriveOrClassroom ?? true },
            },
          },
        })),
      },
    },
  };

  if (evaluation.draftGrade !== undefined) {
    fields.draftGrade = { integerValue: String(evaluation.draftGrade) };
  }
  if (evaluation.assignedGrade !== undefined) {
    fields.assignedGrade = { integerValue: String(evaluation.assignedGrade) };
  }
  if (evaluation.feedbackDocId !== undefined) {
    fields.feedbackDocId = { stringValue: evaluation.feedbackDocId };
  }
  if (evaluation.feedbackDocUrl !== undefined) {
    fields.feedbackDocUrl = { stringValue: evaluation.feedbackDocUrl };
  }

  const res = await fetch(url, {
    method: 'PATCH',
    headers: EMULATOR_ADMIN_HEADERS,
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to seed test evaluation sidecar: ${text}`);
  }
}

function toFirestoreValue(val: any): Record<string, any> {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map((item) => toFirestoreValue(item)),
      },
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export async function seedTestChatMessage(
  assignmentId: string,
  messageId: string,
  message: { sender: 'user' | 'agent'; content: string; timestamp?: string; toolCalls?: any[] }
) {
  if (IS_PROD) {
    const db = getProdDb();
    const docData: Record<string, any> = {
      sender: message.sender,
      content: message.content,
      timestamp: message.timestamp || new Date().toISOString(),
    };
    if (message.toolCalls) {
      docData.toolCalls = message.toolCalls;
    }
    await db.collection('assignments').doc(assignmentId).collection('messages').doc(messageId).set(docData, { merge: true });
    return;
  }

  const url = `${BASE_URL}/assignments/${assignmentId}/messages/${messageId}`;
  const fields: Record<string, any> = {
    sender: { stringValue: message.sender },
    content: { stringValue: message.content },
    timestamp: { stringValue: message.timestamp || new Date().toISOString() },
  };

  if (message.toolCalls) {
    fields.toolCalls = toFirestoreValue(message.toolCalls);
  }

  const res = await fetch(url, {
    method: 'PATCH',
    headers: EMULATOR_ADMIN_HEADERS,
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to seed test chat message: ${text}`);
  }
}

export async function cleanupTestAssignment(assignmentId: string, studentIds: string[] = []) {
  if (IS_PROD) {
    const db = getProdDb();
    const assignmentRef = db.collection('assignments').doc(assignmentId);
    for (const sId of studentIds) {
      await assignmentRef.collection('evaluations').doc(sId).delete().catch(() => {});
    }
    try {
      const evalSnap = await assignmentRef.collection('evaluations').get();
      await Promise.all(evalSnap.docs.map((d: any) => d.ref.delete().catch(() => {})));
    } catch {
      // ignore
    }
    try {
      const msgSnap = await assignmentRef.collection('messages').get();
      await Promise.all(msgSnap.docs.map((d: any) => d.ref.delete().catch(() => {})));
    } catch {
      // ignore
    }
    await assignmentRef.delete().catch(() => {});
    return;
  }

  for (const sId of studentIds) {
    try {
      await fetch(`${BASE_URL}/assignments/${assignmentId}/evaluations/${sId}`, {
        method: 'DELETE',
        headers: EMULATOR_ADMIN_HEADERS,
      });
    } catch {
      // ignore
    }
  }

  // Also clean up any persisted chat messages in assignments/{assignmentId}/messages
  try {
    const msgsRes = await fetch(`${BASE_URL}/assignments/${assignmentId}/messages`, {
      headers: EMULATOR_ADMIN_HEADERS,
    });
    if (msgsRes.ok) {
      const msgsData = await msgsRes.json();
      const docs: any[] = msgsData.documents || [];
      await Promise.all(
        docs.map((doc) =>
          fetch(`http://${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}/v1/${doc.name}`, {
            method: 'DELETE',
            headers: EMULATOR_ADMIN_HEADERS,
          }).catch(() => {})
        )
      );
    }
  } catch {
    // ignore
  }

  try {
    await fetch(`${BASE_URL}/assignments/${assignmentId}`, {
      method: 'DELETE',
      headers: EMULATOR_ADMIN_HEADERS,
    });
  } catch {
    // ignore
  }
}

export async function seedTestUserCredits(uid: string, aiCredits: number) {
  if (IS_PROD) {
    const db = getProdDb();
    await db.collection('users').doc(uid).set(
      {
        uid,
        aiCredits: Number(aiCredits),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    return;
  }

  const url = `${BASE_URL}/users/${uid}`;
  const now = new Date().toISOString();
  const fields: Record<string, any> = {
    uid: { stringValue: uid },
    aiCredits: { integerValue: String(aiCredits) },
    updatedAt: { stringValue: now },
  };

  const res = await fetch(url, {
    method: 'PATCH',
    headers: EMULATOR_ADMIN_HEADERS,
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to seed test user credits: ${text}`);
  }
}

export async function deleteTestUser(uid: string) {
  if (IS_PROD) {
    const db = getProdDb();
    await db.collection('users').doc(uid).delete().catch(() => {});
    return;
  }

  try {
    await fetch(`${BASE_URL}/users/${uid}`, {
      method: 'DELETE',
      headers: EMULATOR_ADMIN_HEADERS,
    });
  } catch {
    // ignore
  }
}
