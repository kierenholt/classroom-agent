import { Router, Response } from 'express';
import * as admin from 'firebase-admin';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import {
  listTeacherCourses,
  listCourseWork,
  getCourseWork,
  cloneCourseWorkUnderApp,
  listCourseStudents,
  listCourseWorkSubmissions,
  patchSubmissionGrade,
  returnSubmission,
} from '../services/classroomClient';
import { extractDriveFile } from '../services/driveExtractor';

export const classroomRouter = Router();

// 1. List Courses
classroomRouter.get('/courses', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const courses = await listTeacherCourses(req.googleAccessToken!);
    res.json({ courses });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to list courses: ${err.message}` });
  }
});

// 2. List Coursework for Course
classroomRouter.get('/courses/:courseId/coursework', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { courseId } = req.params;
  try {
    const coursework = await listCourseWork(req.googleAccessToken!, courseId);
    res.json({ coursework });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to list coursework: ${err.message}` });
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
    res.status(500).json({ error: `Failed to clone coursework: ${err.message}` });
  }
});

// 4. Sync Assignment, Roster, and Submissions to Firestore
classroomRouter.post('/sync-assignment', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { courseId, courseWorkId } = req.body;

  if (!courseId || !courseWorkId) {
    res.status(400).json({ error: 'courseId and courseWorkId are required. Fail-fast enabled.' });
    return;
  }

  const token = req.googleAccessToken!;
  const db = admin.firestore();

  try {
    // 1. Fetch coursework metadata
    const coursework = await getCourseWork(token, courseId, courseWorkId);
    const assignmentId = `${courseId}_${courseWorkId}`;

    // 2. Fetch course details to get course name
    const courses = await listTeacherCourses(token);
    const courseObj = courses.find((c) => c.id === courseId);
    const courseName = courseObj?.name || 'Classroom Course';

    // 3. Fetch enrolled students
    const students = await listCourseStudents(token, courseId);
    const studentMap = new Map<string, { name: string; email?: string | null; photoUrl?: string | null }>();
    for (const st of students) {
      if (st.userId) {
        studentMap.set(st.userId, {
          name: st.profile?.name?.fullName || 'Student',
          email: st.profile?.emailAddress,
          photoUrl: st.profile?.photoUrl,
        });
      }
    }

    // 4. Fetch submissions
    const rawSubmissions = await listCourseWorkSubmissions(token, courseId, courseWorkId);

    // 5. Upsert Assignment Document
    const assignRef = db.collection('assignments').doc(assignmentId);
    const existingAssignSnap = await assignRef.get();
    const existingData = existingAssignSnap.exists ? existingAssignSnap.data() : null;

    let turnedInCount = 0;
    let draftGradedCount = 0;
    let returnedCount = 0;

    const batch = db.batch();

    for (const sub of rawSubmissions) {
      const studentId = sub.userId || sub.id!;
      const profile = studentMap.get(studentId) || { name: 'Student' };

      const isTurnedIn = sub.state === 'TURNED_IN';
      const isReturned = sub.state === 'RETURNED';
      const hasDraft = sub.draftGrade !== undefined;

      if (isTurnedIn) turnedInCount++;
      if (hasDraft && !isReturned) draftGradedCount++;
      if (isReturned) returnedCount++;

      // Process attachments
      const attachments: any[] = [];
      const driveFiles = sub.assignmentSubmission?.attachments || [];
      for (const att of driveFiles) {
        if (att.driveFile) {
          const file = att.driveFile;
          let fileType = 'PDF';
          const title = file.title || 'Attachment';

          if (title.endsWith('.doc') || title.endsWith('.docx') || file.alternateLink?.includes('document')) {
            fileType = 'GOOGLE_DOC';
          } else if (title.endsWith('.ppt') || title.endsWith('.pptx') || file.alternateLink?.includes('presentation')) {
            fileType = 'GOOGLE_SLIDES';
          } else if (title.endsWith('.xls') || title.endsWith('.xlsx') || file.alternateLink?.includes('spreadsheets')) {
            fileType = 'GOOGLE_SHEETS';
          } else if (
            title.endsWith('.py') ||
            title.endsWith('.js') ||
            title.endsWith('.ts') ||
            title.endsWith('.java') ||
            title.endsWith('.cpp') ||
            title.endsWith('.html') ||
            title.endsWith('.css')
          ) {
            fileType = 'CODE';
          } else if (title.endsWith('.png') || title.endsWith('.jpg') || title.endsWith('.jpeg')) {
            fileType = 'IMAGE';
          }

          attachments.push({
            id: file.id || `file_${Math.random().toString(36).substring(2, 7)}`,
            title,
            type: fileType,
            driveFileId: file.id,
            alternateLink: file.alternateLink,
            thumbnailUrl: file.thumbnailUrl,
          });
        } else if (att.link) {
          attachments.push({
            id: `link_${Math.random().toString(36).substring(2, 7)}`,
            title: att.link.title || att.link.url || 'Link',
            type: 'LINK',
            alternateLink: att.link.url,
          });
        }
      }

      if (sub.shortAnswerSubmission) {
        attachments.push({
          id: `sa_${sub.id}`,
          title: 'Short Answer Response',
          type: 'SHORT_ANSWER',
          shortAnswer: sub.shortAnswerSubmission.answer || '',
        });
      }

      const subDocRef = assignRef.collection('submissions').doc(studentId);
      const subPayload = {
        studentId,
        submissionId: sub.id || studentId,
        studentName: profile.name,
        studentEmail: profile.email || null,
        studentAvatarUrl: profile.photoUrl || null,
        state: sub.state || 'CREATED',
        late: sub.late || false,
        attachments,
        draftGrade: sub.draftGrade,
        assignedGrade: sub.assignedGrade,
        rubricBreakdown: [],
        overallFeedback: '',
        comments: [],
        classroomSyncStatus: isReturned ? 'RETURNED' : hasDraft ? 'SYNCED_DRAFT' : 'UNSAVED',
        updatedAt: new Date().toISOString(),
      };

      batch.set(subDocRef, subPayload, { merge: true });
    }

    const assignmentPayload = {
      courseId,
      courseName,
      courseWorkId,
      title: coursework.title || 'Classroom Assignment',
      description: coursework.description || '',
      maxPoints: coursework.maxPoints || 100,
      dueDate: coursework.dueDate ? `${coursework.dueDate.year}-${coursework.dueDate.month}-${coursework.dueDate.day}` : null,
      state: coursework.state || 'PUBLISHED',
      apiWriteBackEligible: coursework.associatedWithDeveloper || false,
      rubric: existingData?.rubric || null,
      submissionStats: {
        total: rawSubmissions.length,
        turnedIn: turnedInCount,
        draftGraded: draftGradedCount,
        returned: returnedCount,
        missing: Math.max(0, rawSubmissions.length - turnedInCount - returnedCount),
      },
      createdAt: existingData?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    batch.set(assignRef, assignmentPayload, { merge: true });
    await batch.commit();

    res.json({
      success: true,
      assignmentId,
      submissionCount: rawSubmissions.length,
    });
  } catch (err: any) {
    console.error('Sync assignment failure:', err);
    res.status(500).json({ error: `Sync assignment failed: ${err.message}` });
  }
});

// 5. Drive File Preview / Content
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
    res.status(500).json({ error: `Failed to retrieve Drive file: ${err.message}` });
  }
});

// 6. Manual Grade Endpoint
classroomRouter.post(
  '/assignments/:assignmentId/submissions/:studentId/grade',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { assignmentId, studentId } = req.params;
    const { draftGrade, rubricBreakdown, overallFeedback } = req.body;

    if (draftGrade === undefined) {
      res.status(400).json({ error: 'draftGrade is required. Fail-fast enabled.' });
      return;
    }

    const db = admin.firestore();
    const assignRef = db.collection('assignments').doc(assignmentId);
    const assignSnap = await assignRef.get();
    if (!assignSnap.exists) {
      res.status(404).json({ error: 'Assignment not found.' });
      return;
    }
    const assignData = assignSnap.data()!;

    const subRef = assignRef.collection('submissions').doc(studentId);
    const subSnap = await subRef.get();
    if (!subSnap.exists) {
      res.status(404).json({ error: 'Student submission not found.' });
      return;
    }
    const subData = subSnap.data()!;

    let syncStatus = 'SYNCED_DRAFT';
    let syncError: string | undefined;

    try {
      await patchSubmissionGrade(
        req.googleAccessToken!,
        assignData.courseId,
        assignData.courseWorkId,
        subData.submissionId,
        draftGrade,
        undefined
      );
    } catch (err: any) {
      if (err.message && err.message.includes('403')) {
        syncStatus = 'LOCAL_ONLY_PERMISSION_DENIED';
        syncError = 'Google Classroom API draftGrade write-back requires coursework created by this app.';
      } else {
        syncStatus = 'ERROR';
        syncError = err.message;
      }
    }

    const comments = subData.comments || [];
    if (overallFeedback) {
      comments.push({
        id: `comment_${Date.now()}`,
        author: 'Teacher',
        content: overallFeedback,
        createdAt: new Date().toISOString(),
        syncedToDriveOrClassroom: syncStatus === 'SYNCED_DRAFT',
      });
    }

    await subRef.update({
      draftGrade,
      rubricBreakdown: rubricBreakdown || [],
      overallFeedback: overallFeedback || '',
      comments,
      classroomSyncStatus: syncStatus,
      classroomSyncError: syncError || null,
      updatedAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      draftGrade,
      classroomSyncStatus: syncStatus,
      classroomSyncError: syncError,
    });
  }
);

// 7. Return Submissions Endpoint
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

    const db = admin.firestore();
    const assignRef = db.collection('assignments').doc(assignmentId);
    const assignSnap = await assignRef.get();
    if (!assignSnap.exists) {
      res.status(404).json({ error: 'Assignment not found.' });
      return;
    }
    const assignData = assignSnap.data()!;

    const results: any[] = [];

    for (const studentId of studentIds) {
      const subRef = assignRef.collection('submissions').doc(studentId);
      const subSnap = await subRef.get();
      if (!subSnap.exists) continue;
      const subData = subSnap.data()!;

      const gradeToAssign = subData.draftGrade ?? subData.assignedGrade ?? 0;

      try {
        await patchSubmissionGrade(
          req.googleAccessToken!,
          assignData.courseId,
          assignData.courseWorkId,
          subData.submissionId,
          undefined,
          gradeToAssign
        );

        await returnSubmission(
          req.googleAccessToken!,
          assignData.courseId,
          assignData.courseWorkId,
          subData.submissionId
        );

        await subRef.update({
          state: 'RETURNED',
          assignedGrade: gradeToAssign,
          classroomSyncStatus: 'RETURNED',
          updatedAt: new Date().toISOString(),
        });

        results.push({ studentId, studentName: subData.studentName, status: 'RETURNED', assignedGrade: gradeToAssign });
      } catch (err: any) {
        results.push({ studentId, studentName: subData.studentName, status: 'ERROR', error: err.message });
      }
    }

    res.json({
      success: true,
      returnedCount: results.filter((r) => r.status === 'RETURNED').length,
      results,
    });
  }
);
