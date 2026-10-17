/**
 * Test Seeder Utility for E2E Tests
 * Populates and cleans up test fixtures strictly within the local Firebase Emulator.
 * Zero mock or dummy data in production.
 */

const FIRESTORE_EMULATOR_HOST = process.env.VITE_FIRESTORE_EMULATOR_HOST || '127.0.0.1';
const FIRESTORE_EMULATOR_PORT = process.env.VITE_FIRESTORE_EMULATOR_PORT || '8080';
const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || 'classroom-agent-511917';

const BASE_URL = `http://${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

export async function seedTestAssignment(assignmentId: string, assignment: Record<string, any>) {
  const url = `${BASE_URL}/assignments/${assignmentId}`;
  
  // Format fields for Firestore REST API
  const fields: Record<string, any> = {
    courseId: { stringValue: assignment.courseId },
    courseName: { stringValue: assignment.courseName },
    courseWorkId: { stringValue: assignment.courseWorkId },
    title: { stringValue: assignment.title },
    description: { stringValue: assignment.description || '' },
    maxPoints: { integerValue: String(assignment.maxPoints || 100) },
    state: { stringValue: assignment.state || 'PUBLISHED' },
    apiWriteBackEligible: { booleanValue: assignment.apiWriteBackEligible ?? true },
    createdAt: { stringValue: new Date().toISOString() },
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to seed test assignment: ${text}`);
  }
}

export async function seedTestSubmission(assignmentId: string, studentId: string, submission: Record<string, any>) {
  const url = `${BASE_URL}/assignments/${assignmentId}/submissions/${studentId}`;

  const fields: Record<string, any> = {
    studentId: { stringValue: studentId },
    submissionId: { stringValue: submission.submissionId || studentId },
    studentName: { stringValue: submission.studentName },
    state: { stringValue: submission.state || 'TURNED_IN' },
    late: { booleanValue: submission.late || false },
    overallFeedback: { stringValue: submission.overallFeedback || '' },
    classroomSyncStatus: { stringValue: submission.classroomSyncStatus || 'UNSAVED' },
    updatedAt: { stringValue: new Date().toISOString() },
    attachments: {
      arrayValue: {
        values: (submission.attachments || []).map((att: any) => ({
          mapValue: {
            fields: {
              id: { stringValue: att.id },
              title: { stringValue: att.title },
              type: { stringValue: att.type },
              contentPreview: { stringValue: att.contentPreview || '' },
              alternateLink: { stringValue: att.alternateLink || '' },
            },
          },
        })),
      },
    },
    rubricBreakdown: {
      arrayValue: {
        values: (submission.rubricBreakdown || []).map((b: any) => ({
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
        values: (submission.comments || []).map((c: any) => ({
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

  if (submission.draftGrade !== undefined) {
    fields.draftGrade = { integerValue: String(submission.draftGrade) };
  }
  if (submission.assignedGrade !== undefined) {
    fields.assignedGrade = { integerValue: String(submission.assignedGrade) };
  }

  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to seed test submission: ${text}`);
  }
}

export async function cleanupTestAssignment(assignmentId: string, studentIds: string[] = []) {
  // Delete subcollection documents
  for (const sId of studentIds) {
    try {
      await fetch(`${BASE_URL}/assignments/${assignmentId}/submissions/${sId}`, { method: 'DELETE' });
    } catch {
      // ignore
    }
  }

  // Delete assignment document
  try {
    await fetch(`${BASE_URL}/assignments/${assignmentId}`, { method: 'DELETE' });
  } catch {
    // ignore
  }
}
