import { Router, Response } from 'express';
import * as admin from 'firebase-admin';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import {
  listTeacherCourses,
  listCourseWork,
  cloneCourseWorkUnderApp,
  listCourseWorkSubmissions,
  fetchLiveWorkspaceFromClassroom,
  parseAssignmentId,
  patchSubmissionGrade,
  returnSubmission,
} from '../services/classroomClient';
import { extractDriveFile } from '../services/driveExtractor';
import { logger } from '../services/logger';

export const classroomRouter = Router();

function getUpstreamErrorStatus(err: any): number {
  const code = err?.code || err?.status || err?.response?.status;
  const msg = String(err?.message || '');
  if (code === 401 || /invalid credentials|unauthenticated/i.test(msg)) {
    return 401;
  }
  return 500;
}

// 1. List Courses (Live from Google Classroom API)
classroomRouter.get('/courses', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const courses = await listTeacherCourses(req.googleAccessToken!);
    res.json({ courses });
  } catch (err: any) {
    res.status(getUpstreamErrorStatus(err)).json({ error: `Failed to list courses: ${err.message}` });
  }
});

// 2. List Coursework for Course (Live from Google Classroom API)
classroomRouter.get('/courses/:courseId/coursework', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { courseId } = req.params;
  try {
    const coursework = await listCourseWork(req.googleAccessToken!, courseId);
    res.json({ coursework });
  } catch (err: any) {
    res.status(getUpstreamErrorStatus(err)).json({ error: `Failed to list coursework: ${err.message}` });
  }
});

// 3. Clone Coursework for Full Write-Back
classroomRouter.post('/courses/:courseId/coursework/clone', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { courseId } = req.params;
  const { courseWorkId } = req.body;

  if (!courseWorkId) {
    res.status(400).json({ error: 'courseWorkId is required to clone. Fail-fast enabled.' });
    return;
  }

  try {
    const cloned = await cloneCourseWorkUnderApp(req.googleAccessToken!, courseId, courseWorkId);
    res.json({ success: true, clonedCourseWork: cloned });
  } catch (err: any) {
    res.status(getUpstreamErrorStatus(err)).json({ error: `Failed to clone coursework: ${err.message}` });
  }
});

// 4. Live Workspace Read (Option 2: Live Google Classroom Course + CourseWork + Roster + Submissions)
classroomRouter.get(
  '/courses/:courseId/coursework/:courseWorkId/workspace',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { courseId, courseWorkId } = req.params;

    if (!courseId || !courseWorkId) {
      res.status(400).json({ error: 'courseId and courseWorkId are required. Fail-fast enabled.' });
      return;
    }

    try {
      const workspace = await fetchLiveWorkspaceFromClassroom(req.googleAccessToken!, courseId, courseWorkId);
      if (workspace.assignment.rubric) {
        const db = admin.firestore();
        const assignRef = db.collection('assignments').doc(workspace.assignment.id);
        const snap = await assignRef.get();
        if (!snap.exists || !snap.data()?.rubric) {
          await assignRef.set(
            {
              rubric: workspace.assignment.rubric,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        }
      }
      res.json(workspace);
    } catch (err: any) {
      logger.error(`Live workspace fetch error: ${err.message}`, (req as any).executionId, { error: err.message, stack: err.stack });
      res.status(getUpstreamErrorStatus(err)).json({ error: `Failed to fetch live workspace from Google Classroom: ${err.message}` });
    }
  }
);

// 5. Verify / Open Assignment Workspace (Zero duplicate Firestore roster/submission storage)
classroomRouter.post('/sync-assignment', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { courseId, courseWorkId } = req.body;

  if (!courseId || !courseWorkId) {
    res.status(400).json({ error: 'courseId and courseWorkId are required. Fail-fast enabled.' });
    return;
  }

  try {
    const workspace = await fetchLiveWorkspaceFromClassroom(req.googleAccessToken!, courseId, courseWorkId);
    if (workspace.assignment.rubric) {
      const db = admin.firestore();
      const assignRef = db.collection('assignments').doc(workspace.assignment.id);
      const snap = await assignRef.get();
      if (!snap.exists || !snap.data()?.rubric) {
        await assignRef.set(
          {
            rubric: workspace.assignment.rubric,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }
    }
    res.json({
      success: true,
      assignmentId: workspace.assignment.id,
      submissionCount: workspace.submissions.length,
      assignment: workspace.assignment,
      submissions: workspace.submissions,
    });
  } catch (err: any) {
    logger.error(`Live assignment fetch failure: ${err.message}`, (req as any).executionId, { error: err.message, stack: err.stack });
    res.status(getUpstreamErrorStatus(err)).json({ error: `Failed to load live assignment from Classroom: ${err.message}` });
  }
});

// 6. Drive File Preview / Content
classroomRouter.get('/drive-file/:fileId', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { fileId } = req.params;
  const exportType = (req.query.exportType as 'text' | 'preview' | 'raw') || 'preview';

  try {
    const extracted = await extractDriveFile(req.googleAccessToken!, fileId, exportType);
    if (extracted.buffer) {
      res.setHeader('Content-Type', extracted.mimeType);
      res.send(extracted.buffer);
    } else {
      res.setHeader('Content-Type', extracted.mimeType);
      res.send(extracted.textContent || '');
    }
  } catch (err: any) {
    res.status(getUpstreamErrorStatus(err)).json({ error: `Failed to retrieve Drive file: ${err.message}` });
  }
});

// 7. Manual Grade Endpoint (Writes draftGrade to Google Classroom API + rubric/comments to Firestore Sidecar)
classroomRouter.post(
  '/assignments/:assignmentId/submissions/:studentId/grade',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { assignmentId, studentId } = req.params;
    const { draftGrade, rubricBreakdown, overallFeedback, submissionId: bodySubmissionId } = req.body;

    if (draftGrade === undefined) {
      res.status(400).json({ error: 'draftGrade is required. Fail-fast enabled.' });
      return;
    }

    try {
      const { courseId, courseWorkId } = parseAssignmentId(assignmentId);
      const token = req.googleAccessToken!;

      let submissionId = bodySubmissionId;
      if (!submissionId) {
        const rawSubs = await listCourseWorkSubmissions(token, courseId, courseWorkId);
        const matched = rawSubs.find((s) => s.userId === studentId || s.id === studentId);
        if (!matched || !matched.id) {
          res.status(404).json({ error: `Student submission for ${studentId} not found in Google Classroom.` });
          return;
        }
        submissionId = matched.id;
      }

      let syncStatus = 'SYNCED_DRAFT';
      let syncError: string | undefined;

      try {
        await patchSubmissionGrade(token, courseId, courseWorkId, submissionId, draftGrade, undefined);
      } catch (err: any) {
        if (err.message && err.message.includes('403')) {
          syncStatus = 'LOCAL_ONLY_PERMISSION_DENIED';
          syncError = 'Google Classroom API draftGrade write-back requires coursework created by this app.';
        } else {
          syncStatus = 'ERROR';
          syncError = err.message;
        }
      }

      const db = admin.firestore();
      const evalRef = db.collection('assignments').doc(assignmentId).collection('evaluations').doc(studentId);
      const evalSnap = await evalRef.get();
      const existingEval = evalSnap.exists ? evalSnap.data() : null;

      const comments = existingEval?.comments ? [...existingEval.comments] : [];

      await evalRef.set(
        {
          studentId,
          submissionId,
          draftGrade,
          rubricBreakdown: rubricBreakdown || [],
          overallFeedback: overallFeedback || '',
          comments,
          classroomSyncStatus: syncStatus,
          classroomSyncError: syncError || null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      res.json({
        success: true,
        draftGrade,
        classroomSyncStatus: syncStatus,
        classroomSyncError: syncError,
      });
    } catch (err: any) {
      res.status(getUpstreamErrorStatus(err)).json({ error: `Failed to save grade: ${err.message}` });
    }
  }
);

// 8. Return Submissions Endpoint (Promotes draftGrade -> assignedGrade + returns in Google Classroom API + updates Sidecar)
classroomRouter.post(
  '/assignments/:assignmentId/return',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { assignmentId } = req.params;
    const { studentIds } = req.body;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      res.status(400).json({ error: 'studentIds array is required. Fail-fast enabled.' });
      return;
    }

    try {
      const { courseId, courseWorkId } = parseAssignmentId(assignmentId);
      const token = req.googleAccessToken!;
      const db = admin.firestore();
      const assignRef = db.collection('assignments').doc(assignmentId);

      // Fetch live submissions from Google Classroom
      const { submissions: liveSubmissions } = await fetchLiveWorkspaceFromClassroom(token, courseId, courseWorkId);
      const liveSubMap = new Map(liveSubmissions.map((s) => [s.studentId, s]));

      const results: any[] = [];

      for (const studentId of studentIds) {
        const liveSub = liveSubMap.get(studentId);
        if (!liveSub) {
          results.push({ studentId, studentName: studentId, status: 'ERROR', error: 'Submission not found in Classroom' });
          continue;
        }

        const evalRef = assignRef.collection('evaluations').doc(studentId);
        const evalSnap = await evalRef.get();
        const evalData = evalSnap.exists ? evalSnap.data() : null;

        const gradeToAssign =
          evalData?.draftGrade ?? liveSub.draftGrade ?? evalData?.assignedGrade ?? liveSub.assignedGrade ?? 0;

        try {
          await patchSubmissionGrade(
            token,
            courseId,
            courseWorkId,
            liveSub.submissionId,
            undefined,
            gradeToAssign
          );

          await returnSubmission(token, courseId, courseWorkId, liveSub.submissionId);

          await evalRef.set(
            {
              studentId,
              submissionId: liveSub.submissionId,
              assignedGrade: gradeToAssign,
              classroomSyncStatus: 'RETURNED',
              classroomSyncError: null,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );

          results.push({
            studentId,
            studentName: liveSub.studentName,
            status: 'RETURNED',
            assignedGrade: gradeToAssign,
          });
        } catch (err: any) {
          results.push({
            studentId,
            studentName: liveSub.studentName,
            status: 'ERROR',
            error: err.message,
          });
        }
      }

      res.json({
        success: true,
        returnedCount: results.filter((r) => r.status === 'RETURNED').length,
        results,
      });
    } catch (err: any) {
      res.status(getUpstreamErrorStatus(err)).json({ error: `Failed to return submissions: ${err.message}` });
    }
  }
);
