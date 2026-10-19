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
  fetchCourseWorkRubricFromClassroom,
  computeRubricTotalPoints,
  patchCourseWorkMaxPoints,
  parseAssignmentId,
  patchSubmissionGrade,
  returnSubmission,
  createFeedbackGoogleDoc,
  attachDriveFileToSubmission,
  copyDriveFileForClonedSubmission,
  modifySubmissionAttachments,
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

async function copyRubricToClonedAssignment(
  accessToken: string,
  courseId: string,
  sourceCourseWorkId: string,
  newCourseWorkId: string
): Promise<void> {
  if (!courseId || !sourceCourseWorkId || !newCourseWorkId) return;
  try {
    const db = admin.firestore();
    const sourceAssignmentId = `${courseId}_${sourceCourseWorkId}`;
    const targetAssignmentId = `${courseId}_${newCourseWorkId}`;

    let sourceRubric: any = null;
    const sourceSnap = await db.collection('assignments').doc(sourceAssignmentId).get();
    if (sourceSnap.exists && Array.isArray(sourceSnap.data()?.rubric?.criteria) && sourceSnap.data()!.rubric.criteria.length > 0) {
      sourceRubric = sourceSnap.data()!.rubric;
    } else {
      sourceRubric = await fetchCourseWorkRubricFromClassroom(accessToken, courseId, sourceCourseWorkId);
    }

    if (sourceRubric && Array.isArray(sourceRubric.criteria) && sourceRubric.criteria.length > 0) {
      const now = new Date().toISOString();
      const totalCriterionPoints = computeRubricTotalPoints(sourceRubric);
      await Promise.all([
        db
          .collection('assignments')
          .doc(targetAssignmentId)
          .set(
            {
              rubric: {
                ...sourceRubric,
                id: `cloned_rubric_${newCourseWorkId}`,
                updatedAt: now,
              },
              ...(totalCriterionPoints > 0 ? { maxPoints: totalCriterionPoints } : {}),
              updatedAt: now,
            },
            { merge: true }
          ),
        totalCriterionPoints > 0
          ? patchCourseWorkMaxPoints(accessToken, courseId, newCourseWorkId, totalCriterionPoints).catch(() => null)
          : Promise.resolve(null),
      ]);
    }
  } catch (err: any) {
    logger.warn(`Failed to copy rubric from ${sourceCourseWorkId} to ${newCourseWorkId}: ${err.message}`);
  }
}

async function cloneSubmissionsToClonedAssignment(
  accessToken: string,
  courseId: string,
  sourceCourseWorkId: string,
  newCourseWorkId: string
): Promise<number> {
  if (!courseId || !sourceCourseWorkId || !newCourseWorkId) return 0;
  try {
    const [sourceSubs, targetSubs] = await Promise.all([
      listCourseWorkSubmissions(accessToken, courseId, sourceCourseWorkId),
      listCourseWorkSubmissions(accessToken, courseId, newCourseWorkId),
    ]);

    const targetSubByUserId = new Map<string, any>();
    for (const tSub of targetSubs) {
      if (tSub.userId) {
        targetSubByUserId.set(tSub.userId, tSub);
      }
    }

    const subsToClone = sourceSubs.filter((s) => {
      const attCount = s.assignmentSubmission?.attachments?.length || 0;
      const hasShortAnswer = Boolean(s.shortAnswerSubmission?.answer?.trim());
      const isTurnedInOrReturned = s.state === 'TURNED_IN' || s.state === 'RETURNED';
      return Boolean(s.userId) && (attCount > 0 || hasShortAnswer || isTurnedInOrReturned);
    });

    if (subsToClone.length === 0) return 0;

    const db = admin.firestore();
    const targetAssignmentId = `${courseId}_${newCourseWorkId}`;
    const now = new Date().toISOString();
    let clonedCount = 0;

    await Promise.all(
      subsToClone.map(async (sourceSub) => {
        const studentId = sourceSub.userId!;
        const targetSub = targetSubByUserId.get(studentId);
        const rawAttachments = sourceSub.assignmentSubmission?.attachments || [];
        const addAttachments: any[] = [];

        for (const att of rawAttachments) {
          if (att.driveFile?.id) {
            try {
              const copied = await copyDriveFileForClonedSubmission(
                accessToken,
                att.driveFile.id,
                att.driveFile.title || undefined
              );
              addAttachments.push({
                driveFile: {
                  id: copied.fileId,
                },
              });
            } catch (copyErr: any) {
              logger.warn(
                `Failed to copy Drive file ${att.driveFile.id} for student ${studentId}: ${copyErr.message}`
              );
            }
          } else if (att.link?.url) {
            addAttachments.push({
              link: {
                url: att.link.url,
              },
            });
          }
        }

        if (addAttachments.length > 0 && targetSub?.id) {
          try {
            await modifySubmissionAttachments(
              accessToken,
              courseId,
              newCourseWorkId,
              targetSub.id,
              addAttachments
            );
          } catch (modErr: any) {
            logger.warn(
              `Failed to attach cloned files to submission ${targetSub.id} for student ${studentId}: ${modErr.message}`
            );
          }
        }

        const shortAnswerText = sourceSub.shortAnswerSubmission?.answer?.trim();
        await db
          .collection('assignments')
          .doc(targetAssignmentId)
          .collection('evaluations')
          .doc(studentId)
          .set(
            {
              studentId,
              ...(targetSub?.id ? { submissionId: targetSub.id } : {}),
              clonedSubmissionState: 'TURNED_IN',
              ...(shortAnswerText ? { clonedShortAnswer: shortAnswerText } : {}),
              classroomSyncStatus: 'UNSAVED',
              updatedAt: now,
            },
            { merge: true }
          );

        clonedCount++;
      })
    );

    return clonedCount;
  } catch (err: any) {
    logger.warn(`Failed to clone submissions from ${sourceCourseWorkId} to ${newCourseWorkId}: ${err.message}`);
    return 0;
  }
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

// 2a. Check if Coursework Has Existing Student Submissions (Used before cloning)
classroomRouter.get(
  '/courses/:courseId/coursework/:courseWorkId/submissions-summary',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { courseId, courseWorkId } = req.params;
    if (!courseId || !courseWorkId) {
      res.status(400).json({ error: 'courseId and courseWorkId are required. Fail-fast enabled.' });
      return;
    }

    try {
      const rawSubs = await listCourseWorkSubmissions(req.googleAccessToken!, courseId, courseWorkId);
      const activeSubmissions = rawSubs.filter((s) => {
        const attCount = s.assignmentSubmission?.attachments?.length || 0;
        const hasShortAnswer = Boolean(s.shortAnswerSubmission?.answer?.trim());
        const isTurnedInOrReturned = s.state === 'TURNED_IN' || s.state === 'RETURNED';
        return attCount > 0 || hasShortAnswer || isTurnedInOrReturned;
      });
      const attachmentCount = activeSubmissions.reduce(
        (sum, s) =>
          sum +
          (s.assignmentSubmission?.attachments?.length || 0) +
          (s.shortAnswerSubmission?.answer?.trim() ? 1 : 0),
        0
      );

      res.json({
        hasSubmissions: activeSubmissions.length > 0,
        submissionCount: activeSubmissions.length,
        attachmentCount,
      });
    } catch (err: any) {
      res.status(getUpstreamErrorStatus(err)).json({
        error: `Failed to check assignment submissions: ${err.message}`,
      });
    }
  }
);

// 2b. Create New Coursework for Course (Live in Google Classroom API)
classroomRouter.post('/courses/:courseId/coursework', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { courseId } = req.params;
  const { title, description, maxPoints, dueDate, state, sourceCourseWorkId, cloneSubmissions } = req.body || {};

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

    if (sourceCourseWorkId && String(sourceCourseWorkId).trim() && created.id) {
      const cleanSourceId = String(sourceCourseWorkId).trim();
      await Promise.all([
        copyRubricToClonedAssignment(req.googleAccessToken!, courseId, cleanSourceId, created.id),
        cloneSubmissions === true
          ? cloneSubmissionsToClonedAssignment(req.googleAccessToken!, courseId, cleanSourceId, created.id)
          : Promise.resolve(0),
      ]);
    }

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
  const { courseWorkId, cloneSubmissions } = req.body;

  if (!courseWorkId) {
    res.status(400).json({ error: 'courseWorkId is required to clone. Fail-fast enabled.' });
    return;
  }

  try {
    const cloned = await cloneCourseWorkUnderApp(req.googleAccessToken!, courseId, courseWorkId);
    if (cloned.id) {
      const cleanSourceId = String(courseWorkId).trim();
      await Promise.all([
        copyRubricToClonedAssignment(req.googleAccessToken!, courseId, cleanSourceId, cloned.id),
        cloneSubmissions === true
          ? cloneSubmissionsToClonedAssignment(req.googleAccessToken!, courseId, cleanSourceId, cloned.id)
          : Promise.resolve(0),
      ]);
    }
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
      const db = admin.firestore();
      const assignmentId = `${courseId}_${courseWorkId}`;
      const assignRef = db.collection('assignments').doc(assignmentId);
      const [workspace, snap] = await Promise.all([
        fetchLiveWorkspaceFromClassroom(req.googleAccessToken!, courseId, courseWorkId),
        assignRef.get(),
      ]);
      const sidecarData = snap.exists ? snap.data() : null;

      if (sidecarData?.rubric) {
        workspace.assignment.rubric = sidecarData.rubric;
        const rubricPoints = computeRubricTotalPoints(sidecarData.rubric);
        if (rubricPoints > 0) {
          workspace.assignment.maxPoints = rubricPoints;
        } else if (typeof sidecarData.maxPoints === 'number' && sidecarData.maxPoints > 0) {
          workspace.assignment.maxPoints = sidecarData.maxPoints;
        }
      } else if (workspace.assignment.rubric) {
        const rubricPoints = computeRubricTotalPoints(workspace.assignment.rubric);
        if (rubricPoints > 0) {
          workspace.assignment.maxPoints = rubricPoints;
        }
        await assignRef.set(
          {
            rubric: workspace.assignment.rubric,
            ...(rubricPoints > 0 ? { maxPoints: rubricPoints } : {}),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } else if (typeof sidecarData?.maxPoints === 'number' && sidecarData.maxPoints > 0) {
        workspace.assignment.maxPoints = sidecarData.maxPoints;
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
    const db = admin.firestore();
    const assignmentId = `${courseId}_${courseWorkId}`;
    const assignRef = db.collection('assignments').doc(assignmentId);
    const [workspace, snap] = await Promise.all([
      fetchLiveWorkspaceFromClassroom(req.googleAccessToken!, courseId, courseWorkId),
      assignRef.get(),
    ]);
    const sidecarData = snap.exists ? snap.data() : null;

    if (sidecarData?.rubric) {
      workspace.assignment.rubric = sidecarData.rubric;
      const rubricPoints = computeRubricTotalPoints(sidecarData.rubric);
      if (rubricPoints > 0) {
        workspace.assignment.maxPoints = rubricPoints;
      } else if (typeof sidecarData.maxPoints === 'number' && sidecarData.maxPoints > 0) {
        workspace.assignment.maxPoints = sidecarData.maxPoints;
      }
    } else if (workspace.assignment.rubric) {
      const rubricPoints = computeRubricTotalPoints(workspace.assignment.rubric);
      if (rubricPoints > 0) {
        workspace.assignment.maxPoints = rubricPoints;
      }
      await assignRef.set(
        {
          rubric: workspace.assignment.rubric,
          ...(rubricPoints > 0 ? { maxPoints: rubricPoints } : {}),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } else if (typeof sidecarData?.maxPoints === 'number' && sidecarData.maxPoints > 0) {
      workspace.assignment.maxPoints = sidecarData.maxPoints;
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
    res.setHeader('Cache-Control', 'private, max-age=3600');
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

// 6b. Set / Update Assignment Rubric Endpoint (Saves to Firestore assignments/{assignmentId} and updates Classroom maxPoints)
classroomRouter.post(
  '/assignments/:assignmentId/rubric',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { assignmentId } = req.params;
    const { title, criteria } = req.body;

    if (!assignmentId) {
      res.status(400).json({ error: 'assignmentId is required. Fail-fast enabled.' });
      return;
    }

    let courseId: string;
    let courseWorkId: string;
    try {
      const parsed = parseAssignmentId(assignmentId);
      courseId = parsed.courseId;
      courseWorkId = parsed.courseWorkId;
    } catch (err: any) {
      res.status(400).json({ error: err.message });
      return;
    }

    if (!Array.isArray(criteria) || criteria.length === 0) {
      res.status(400).json({ error: 'Rubric must contain at least one criterion. Fail-fast enabled.' });
      return;
    }

    for (let i = 0; i < criteria.length; i++) {
      const c = criteria[i];
      if (!c || typeof c.title !== 'string' || !c.title.trim()) {
        res.status(400).json({ error: `Criterion at index ${i} must have a non-empty title. Fail-fast enabled.` });
        return;
      }
      const points = Number(c.maxPoints);
      if (Number.isNaN(points) || points <= 0) {
        res.status(400).json({ error: `Criterion "${c.title}" must have maxPoints greater than 0. Fail-fast enabled.` });
        return;
      }
    }

    try {
      const sanitizedCriteria = criteria.map((c: any, idx: number) => ({
        id: c.id && typeof c.id === 'string' && c.id.trim() ? c.id.trim() : `crit_${Date.now()}_${idx}`,
        title: c.title.trim(),
        description: typeof c.description === 'string' ? c.description.trim() : '',
        maxPoints: Number(c.maxPoints),
      }));

      const totalCriterionPoints = sanitizedCriteria.reduce(
        (sum: number, c: any) => sum + c.maxPoints,
        0
      );

      const db = admin.firestore();
      const assignRef = db.collection('assignments').doc(assignmentId);
      const assignSnap = await assignRef.get();
      const existingData = assignSnap.exists ? assignSnap.data() : null;

      const rubricPayload = {
        id: existingData?.rubric?.id || `rubric_${Date.now()}`,
        title: typeof title === 'string' && title.trim() ? title.trim() : 'Grading Rubric',
        criteria: sanitizedCriteria,
        updatedAt: new Date().toISOString(),
      };

      await Promise.all([
        assignRef.set(
          {
            rubric: rubricPayload,
            maxPoints: totalCriterionPoints,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        ),
        patchCourseWorkMaxPoints(req.googleAccessToken!, courseId, courseWorkId, totalCriterionPoints).catch(
          (patchErr: any) => {
            logger.warn(
              `Could not patch Classroom courseWork maxPoints to ${totalCriterionPoints} for ${assignmentId}: ${patchErr.message}`,
              (req as any).executionId
            );
            return null;
          }
        ),
      ]);

      res.status(200).json({
        success: true,
        rubric: rubricPayload,
        maxPoints: totalCriterionPoints,
      });
    } catch (err: any) {
      res.status(500).json({ error: `Failed to save rubric: ${err.message}` });
    }
  }
);

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
        syncStatus = 'DRAFT';
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
      action: bodyAction,
    } = req.body;

    try {
      const { courseId, courseWorkId } = parseAssignmentId(assignmentId);
      const token = req.googleAccessToken!;
      const db = admin.firestore();
      const evalRef = db.collection('assignments').doc(assignmentId).collection('evaluations').doc(studentId);
      const evalSnap = await evalRef.get();
      const existingEval = evalSnap.exists ? evalSnap.data() : null;

      const effectiveAction: 'draft' | 'return' = bodyAction === 'draft' ? 'draft' : 'return';

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
          error: 'Nothing to submit: neither a score nor a feedback document was provided.',
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
      let syncStatus: 'DRAFT' | 'RETURNED' = effectiveAction === 'draft' ? 'DRAFT' : 'RETURNED';
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

      // 2. If a numerical score is present, patch grade according to effectiveAction ('draft' vs 'return')
      if (hasScore) {
        try {
          if (effectiveAction === 'draft') {
            // Draft action: patch draftGrade only, do NOT return submission to student
            await patchSubmissionGrade(token, courseId, courseWorkId, submissionId, effectiveGrade, undefined);
            syncStatus = 'DRAFT';
          } else {
            // Return action: patch draftGrade + assignedGrade and return submission
            await patchSubmissionGrade(token, courseId, courseWorkId, submissionId, effectiveGrade, effectiveGrade);
            try {
              await returnSubmission(token, courseId, courseWorkId, submissionId);
            } catch (returnErr: any) {
              syncWarnings.push(`Grade patched, but Classroom return warning: ${returnErr.message}`);
            }
            syncStatus = 'RETURNED';
          }
        } catch (gradeErr: any) {
          if (gradeErr.message && gradeErr.message.includes('403')) {
            syncWarnings.push(
              'Google Classroom API grade write-back requires coursework created by this app. Grade saved in Classroom Agent sidecar.'
            );
          } else {
            syncWarnings.push(gradeErr.message || 'Failed to patch grade in Google Classroom.');
          }
          if (effectiveAction === 'return') {
            try {
              await returnSubmission(token, courseId, courseWorkId, submissionId);
            } catch {
              // ignore secondary error
            }
            syncStatus = 'RETURNED';
          }
        }
      } else if (effectiveAction === 'return') {
        // Feedback-doc-only return: still return submission in Classroom and set RETURNED
        try {
          await returnSubmission(token, courseId, courseWorkId, submissionId);
        } catch (returnErr: any) {
          syncWarnings.push(`Classroom return warning: ${returnErr.message}`);
        }
        syncStatus = 'RETURNED';
      }

      const timestamp = new Date().toISOString();
      const effectiveRubricBreakdown =
        bodyRubricBreakdown !== undefined ? bodyRubricBreakdown : existingEval?.rubricBreakdown || [];
      const comments = existingEval?.comments ? [...existingEval.comments] : [];
      const syncError = syncWarnings.length > 0 ? syncWarnings.join(' ') : null;

      await evalRef.set(
        {
          studentId,
          submissionId,
          draftGrade: hasScore ? effectiveGrade : null,
          ...(hasScore && effectiveAction === 'return' ? { assignedGrade: effectiveGrade } : {}),
          rubricBreakdown: effectiveRubricBreakdown,
          overallFeedback: cleanFeedback,
          comments,
          ...(feedbackDocId ? { feedbackDocId } : {}),
          ...(feedbackDocUrl ? { feedbackDocUrl } : {}),
          ...(effectiveAction === 'draft' ? { draftedAt: timestamp } : { approvedAt: timestamp }),
          classroomSyncStatus: syncStatus,
          classroomSyncError: syncError,
          updatedAt: timestamp,
        },
        { merge: true }
      );

      res.json({
        success: true,
        studentId,
        submissionId,
        draftGrade: hasScore ? effectiveGrade : null,
        assignedGrade: hasScore && effectiveAction === 'return' ? effectiveGrade : null,
        overallFeedback: cleanFeedback,
        feedbackDocId: feedbackDocId || null,
        feedbackDocUrl: feedbackDocUrl || null,
        approvedAt: effectiveAction === 'draft' ? existingEval?.approvedAt || null : timestamp,
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
    const { studentIds, grades: bodyGrades } = req.body;

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
        const evalRef = assignRef.collection('evaluations').doc(studentId);
        const evalSnap = await evalRef.get();
        const evalData = evalSnap.exists ? evalSnap.data() : null;

        const submissionId = liveSub?.submissionId || evalData?.submissionId;
        const studentName = liveSub?.studentName || evalData?.studentName || studentId;

        if (!submissionId) {
          results.push({ studentId, studentName, status: 'ERROR', error: 'Submission not found in Classroom' });
          continue;
        }

        const overrideGrade =
          bodyGrades && typeof bodyGrades === 'object' && typeof bodyGrades[studentId] === 'number'
            ? bodyGrades[studentId]
            : undefined;

        const gradeToAssign =
          overrideGrade ??
          evalData?.draftGrade ??
          liveSub?.draftGrade ??
          evalData?.assignedGrade ??
          liveSub?.assignedGrade ??
          undefined;
        const hasGrade = typeof gradeToAssign === 'number' && !Number.isNaN(gradeToAssign);
        const syncWarnings: string[] = [];

        if (hasGrade) {
          try {
            await patchSubmissionGrade(
              token,
              courseId,
              courseWorkId,
              submissionId,
              gradeToAssign,
              gradeToAssign
            );
          } catch (gradeErr: any) {
            syncWarnings.push(gradeErr.message);
          }
        }

        try {
          await returnSubmission(token, courseId, courseWorkId, submissionId);
        } catch (retErr: any) {
          syncWarnings.push(retErr.message);
        }

        const timestamp = new Date().toISOString();
        await evalRef.set(
          {
            studentId,
            submissionId,
            ...(hasGrade ? { draftGrade: gradeToAssign, assignedGrade: gradeToAssign } : {}),
            approvedAt: timestamp,
            classroomSyncStatus: 'RETURNED',
            classroomSyncError: syncWarnings.length > 0 ? syncWarnings.join(' ') : null,
            updatedAt: timestamp,
          },
          { merge: true }
        );

        results.push({
          studentId,
          studentName,
          status: 'RETURNED',
          assignedGrade: hasGrade ? gradeToAssign : null,
          warning: syncWarnings.length > 0 ? syncWarnings.join(' ') : undefined,
        });
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
