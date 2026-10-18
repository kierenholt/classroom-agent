import { Router, Response } from 'express';
import * as admin from 'firebase-admin';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import {
  listTeacherCourses,
  listCourseWork,
  createCourseWork,
  cloneCourseWorkUnderApp,
  listCourseWorkSubmissions,
  fetchLiveWorkspaceFromClassroom,
  parseAssignmentId,
  patchSubmissionGrade,
  returnSubmission,
  createFeedbackGoogleDoc,
  attachDriveFileToSubmission,
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

// 0. Preload Courses and Coursework in Parallel for Instant UI
classroomRouter.get('/preload', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const courses = await listTeacherCourses(req.googleAccessToken!);
    const courseworkByCourseId: Record<string, any[]> = {};

    await Promise.all(
      (courses || []).map(async (course) => {
        if (!course.id) return;
        try {
          const cw = await listCourseWork(req.googleAccessToken!, course.id);
          courseworkByCourseId[course.id] = cw || [];
        } catch (err: any) {
          logger.warn(`Failed to preload coursework for course ${course.id}: ${err.message}`, (req as any).executionId);
          courseworkByCourseId[course.id] = [];
        }
      })
    );

    res.json({ courses: courses || [], courseworkByCourseId });
  } catch (err: any) {
    res.status(getUpstreamErrorStatus(err)).json({ error: `Failed to preload assignments: ${err.message}` });
  }
});

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

// 2b. Create New Coursework for Course (Live in Google Classroom API)
classroomRouter.post('/courses/:courseId/coursework', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { courseId } = req.params;
  const { title, description, maxPoints, dueDate, state } = req.body || {};

  if (!courseId || !courseId.trim()) {
    res.status(400).json({ error: 'courseId is required to create coursework. Fail-fast enabled.' });
    return;
  }
  if (!title || !String(title).trim()) {
    res.status(400).json({ error: 'Assignment title is required to create coursework. Fail-fast enabled.' });
    return;
  }

  try {
    const created = await createCourseWork(req.googleAccessToken!, courseId, {
      title: String(title).trim(),
      description: description ? String(description).trim() : undefined,
      maxPoints: maxPoints !== undefined ? Number(maxPoints) : 100,
      dueDate: dueDate ? String(dueDate).trim() : undefined,
      state: state === 'DRAFT' ? 'DRAFT' : 'PUBLISHED',
    });
    res.json({ success: true, courseWork: created });
  } catch (err: any) {
    logger.error(`Failed to create coursework in course ${courseId}: ${err.message}`, (req as any).executionId, {
      error: err.message,
      stack: err.stack,
    });
    res.status(getUpstreamErrorStatus(err)).json({ error: `Failed to create assignment: ${err.message}` });
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

// 7. Manual Grade / Draft Save Endpoint (Writes draftGrade to Google Classroom API if numeric + rubric/feedback to Firestore Sidecar)
classroomRouter.post(
  '/assignments/:assignmentId/submissions/:studentId/grade',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { assignmentId, studentId } = req.params;
    const { draftGrade, rubricBreakdown, overallFeedback, submissionId: bodySubmissionId } = req.body;

    const hasNumericGrade = typeof draftGrade === 'number' && !Number.isNaN(draftGrade);
    const hasFeedback = typeof overallFeedback === 'string';

    if (!hasNumericGrade && !hasFeedback) {
      res.status(400).json({ error: 'draftGrade or overallFeedback is required. Fail-fast enabled.' });
      return;
    }

    try {
      const { courseId, courseWorkId } = parseAssignmentId(assignmentId);
      const token = req.googleAccessToken!;

      const db = admin.firestore();
      const evalRef = db.collection('assignments').doc(assignmentId).collection('evaluations').doc(studentId);
      const evalSnap = await evalRef.get();
      const existingEval = evalSnap.exists ? evalSnap.data() : null;

      let submissionId = bodySubmissionId || existingEval?.submissionId;
      if (!submissionId && hasNumericGrade) {
        const rawSubs = await listCourseWorkSubmissions(token, courseId, courseWorkId);
        const matched = rawSubs.find((s) => s.userId === studentId || s.id === studentId);
        if (!matched || !matched.id) {
          res.status(404).json({ error: `Student submission for ${studentId} not found in Google Classroom.` });
          return;
        }
        submissionId = matched.id;
      }

      let syncStatus = existingEval?.classroomSyncStatus || 'PENDING_APPROVAL';
      let syncError: string | undefined;

      if (hasNumericGrade && submissionId) {
        syncStatus = 'SYNCED_DRAFT';
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
      }

      const comments = existingEval?.comments ? [...existingEval.comments] : [];
      const effectiveDraftGrade = hasNumericGrade
        ? draftGrade
        : draftGrade === null
        ? null
        : existingEval?.draftGrade ?? null;

      await evalRef.set(
        {
          studentId,
          ...(submissionId ? { submissionId } : {}),
          draftGrade: effectiveDraftGrade,
          rubricBreakdown: rubricBreakdown !== undefined ? rubricBreakdown : existingEval?.rubricBreakdown || [],
          overallFeedback: overallFeedback !== undefined ? overallFeedback : existingEval?.overallFeedback || '',
          comments,
          classroomSyncStatus: syncStatus,
          classroomSyncError: syncError || null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      res.json({
        success: true,
        draftGrade: effectiveDraftGrade,
        overallFeedback: overallFeedback !== undefined ? overallFeedback : existingEval?.overallFeedback || '',
        classroomSyncStatus: syncStatus,
        classroomSyncError: syncError,
      });
    } catch (err: any) {
      res.status(getUpstreamErrorStatus(err)).json({ error: `Failed to save grade: ${err.message}` });
    }
  }
);

// 7b. Approve Evaluation Endpoint (Creates & attaches Google Doc for feedback document + patches & returns grade in Google Classroom API)
classroomRouter.post(
  '/assignments/:assignmentId/submissions/:studentId/approve',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { assignmentId, studentId } = req.params;
    const {
      draftGrade: bodyDraftGrade,
      overallFeedback: bodyFeedback,
      rubricBreakdown: bodyRubricBreakdown,
      submissionId: bodySubmissionId,
      studentName: bodyStudentName,
      assignmentTitle: bodyAssignmentTitle,
    } = req.body;

    try {
      const { courseId, courseWorkId } = parseAssignmentId(assignmentId);
      const token = req.googleAccessToken!;
      const db = admin.firestore();
      const evalRef = db.collection('assignments').doc(assignmentId).collection('evaluations').doc(studentId);
      const evalSnap = await evalRef.get();
      const existingEval = evalSnap.exists ? evalSnap.data() : null;

      const effectiveGrade =
        bodyDraftGrade !== undefined
          ? bodyDraftGrade
          : existingEval?.draftGrade !== undefined
          ? existingEval.draftGrade
          : null;
      const hasScore = typeof effectiveGrade === 'number' && !Number.isNaN(effectiveGrade);

      const rawFeedback =
        bodyFeedback !== undefined
          ? bodyFeedback
          : existingEval?.overallFeedback !== undefined
          ? existingEval.overallFeedback
          : '';
      const cleanFeedback = typeof rawFeedback === 'string' ? rawFeedback.trim() : '';
      const hasFeedbackDoc = cleanFeedback.length > 0;

      if (!hasScore && !hasFeedbackDoc) {
        res.status(400).json({
          error: 'Nothing to approve: neither a score nor a feedback document was provided.',
        });
        return;
      }

      let submissionId = bodySubmissionId || existingEval?.submissionId;
      let studentName = bodyStudentName || existingEval?.studentName || studentId;
      let assignmentTitle = bodyAssignmentTitle || 'Classroom Assignment';

      if (!submissionId) {
        try {
          const workspace = await fetchLiveWorkspaceFromClassroom(token, courseId, courseWorkId);
          assignmentTitle = workspace.assignment.title || assignmentTitle;
          const matchedSub = workspace.submissions.find(
            (s) => s.studentId === studentId || s.submissionId === studentId
          );
          if (matchedSub) {
            submissionId = matchedSub.submissionId;
            studentName = matchedSub.studentName || studentName;
          }
        } catch (err: any) {
          logger.warn(`Approve workspace lookup fallback warning: ${err.message}`, (req as any).executionId);
        }
      }

      if (!submissionId) {
        res.status(404).json({ error: `Student submission for ${studentId} not found in Google Classroom.` });
        return;
      }

      let feedbackDocId: string | undefined = existingEval?.feedbackDocId;
      let feedbackDocUrl: string | undefined = existingEval?.feedbackDocUrl;
      let syncStatus = 'APPROVED';
      const syncWarnings: string[] = [];

      // 1. If a feedback document is present, create a formatted Google Doc in Drive & attach to the Classroom submission
      if (hasFeedbackDoc) {
        const docTitle = `Feedback - ${assignmentTitle} - ${studentName}`;
        try {
          const createdDoc = await createFeedbackGoogleDoc(token, docTitle, cleanFeedback);
          feedbackDocId = createdDoc.fileId;
          feedbackDocUrl = createdDoc.webViewLink;

          try {
            await attachDriveFileToSubmission(token, courseId, courseWorkId, submissionId, createdDoc.fileId);
          } catch (attachErr: any) {
            if (attachErr.message && attachErr.message.includes('403')) {
              syncWarnings.push(
                'Feedback Google Doc created in Drive, but attaching directly to Classroom submission requires coursework created by this app.'
              );
            } else {
              syncWarnings.push(`Feedback Doc created, but Classroom attachment failed: ${attachErr.message}`);
            }
          }
        } catch (docErr: any) {
          syncWarnings.push(`Failed to create Google Doc in Drive: ${docErr.message}`);
        }
      }

      // 2. If a numerical score is present, patch draftGrade + assignedGrade and return the submission in Google Classroom
      if (hasScore) {
        try {
          await patchSubmissionGrade(token, courseId, courseWorkId, submissionId, effectiveGrade, effectiveGrade);
          try {
            await returnSubmission(token, courseId, courseWorkId, submissionId);
            syncStatus = 'RETURNED';
          } catch {
            syncStatus = 'APPROVED';
          }
        } catch (gradeErr: any) {
          if (gradeErr.message && gradeErr.message.includes('403')) {
            syncStatus = 'LOCAL_ONLY_PERMISSION_DENIED';
            syncWarnings.push(
              'Google Classroom API grade write-back requires coursework created by this app. Grade approved in Classroom Agent sidecar.'
            );
          } else {
            syncStatus = 'ERROR';
            syncWarnings.push(gradeErr.message || 'Failed to patch grade in Google Classroom.');
          }
        }
      } else if (syncWarnings.length > 0 && syncWarnings.some((w) => w.includes('requires coursework created by this app'))) {
        syncStatus = 'LOCAL_ONLY_PERMISSION_DENIED';
      }

      const approvedAt = new Date().toISOString();
      const effectiveRubricBreakdown =
        bodyRubricBreakdown !== undefined ? bodyRubricBreakdown : existingEval?.rubricBreakdown || [];
      const comments = existingEval?.comments ? [...existingEval.comments] : [];
      const syncError = syncWarnings.length > 0 ? syncWarnings.join(' ') : null;

      await evalRef.set(
        {
          studentId,
          submissionId,
          draftGrade: hasScore ? effectiveGrade : null,
          ...(hasScore ? { assignedGrade: effectiveGrade } : {}),
          rubricBreakdown: effectiveRubricBreakdown,
          overallFeedback: cleanFeedback,
          comments,
          ...(feedbackDocId ? { feedbackDocId } : {}),
          ...(feedbackDocUrl ? { feedbackDocUrl } : {}),
          approvedAt,
          classroomSyncStatus: syncStatus,
          classroomSyncError: syncError,
          updatedAt: approvedAt,
        },
        { merge: true }
      );

      res.json({
        success: true,
        studentId,
        submissionId,
        draftGrade: hasScore ? effectiveGrade : null,
        assignedGrade: hasScore ? effectiveGrade : null,
        overallFeedback: cleanFeedback,
        feedbackDocId: feedbackDocId || null,
        feedbackDocUrl: feedbackDocUrl || null,
        approvedAt,
        classroomSyncStatus: syncStatus,
        classroomSyncError: syncError,
      });
    } catch (err: any) {
      logger.error(`Approve evaluation error: ${err.message}`, (req as any).executionId, {
        error: err.message,
        stack: err.stack,
      });
      res.status(getUpstreamErrorStatus(err)).json({ error: `Failed to approve evaluation: ${err.message}` });
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
