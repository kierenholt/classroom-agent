/**
 * Test Seeder Utility for E2E Tests
 * Populates and cleans up test Sidecar fixtures (rubrics & evaluations) strictly within the local Firebase Emulator.
 * Zero mock or dummy data in production.
 */

const FIRESTORE_EMULATOR_HOST = process.env.VITE_FIRESTORE_EMULATOR_HOST || '127.0.0.1';
const FIRESTORE_EMULATOR_PORT = process.env.VITE_FIRESTORE_EMULATOR_PORT || '8080';
const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || 'classroom-agent-511917';

const BASE_URL = `http://${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// In the Firebase Firestore Emulator, `Bearer owner` grants admin bypass of security rules for test seeding/cleanup
const EMULATOR_ADMIN_HEADERS = {
  'Content-Type': 'application/json',
  Authorization: 'Bearer owner',
};

export async function seedTestAssignment(assignmentId: string, assignment: Record<string, any>) {
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

export async function seedTestChatMessage(
  assignmentId: string,
  messageId: string,
  message: { sender: 'user' | 'agent'; content: string; timestamp?: string }
) {
  const url = `${BASE_URL}/assignments/${assignmentId}/messages/${messageId}`;
  const fields: Record<string, any> = {
    sender: { stringValue: message.sender },
    content: { stringValue: message.content },
    timestamp: { stringValue: message.timestamp || new Date().toISOString() },
  };

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
