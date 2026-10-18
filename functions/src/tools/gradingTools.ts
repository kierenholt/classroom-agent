import * as admin from 'firebase-admin';
import {
  fetchLiveWorkspaceFromClassroom,
  parseAssignmentId,
  patchSubmissionGrade,
  returnSubmission,
} from '../services/classroomClient';
import { extractDriveFile } from '../services/driveExtractor';

export interface ToolExecutionContext {
  assignmentId: string;
  googleAccessToken: string;
  teacherUserId: string;
}

export const gradingToolDeclarations = [
  {
    name: 'get_assignment_details',
    description:
      'Returns the live assignment description, maximum points, due date, submission counts from Google Classroom, and active rubric criteria from the sidecar.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'set_assignment_rubric',
    description:
      'Configures or updates the grading rubric for this assignment. Saves structured criteria in the Firestore sidecar and updates the marking panel.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title or name for this rubric' },
        criteria: {
          type: 'array',
          description: 'List of rubric criteria',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Unique identifier for the criterion (e.g. crit_1, thesis, syntax)' },
              title: { type: 'string', description: 'Criterion title (e.g. Thesis Statement, Code Correctness)' },
              description: { type: 'string', description: 'Description of expectations for this criterion' },
              maxPoints: { type: 'number', description: 'Maximum points awarded for this criterion' },
            },
            required: ['id', 'title', 'maxPoints'],
          },
        },
      },
      required: ['criteria'],
    },
  },
  {
    name: 'list_student_submissions',
    description:
      'Lists all students enrolled in this assignment live from Google Classroom along with their submission status, turn-in state, existing grades, and attachment names.',
    parameters: {
      type: 'object',
      properties: {
        statusFilter: {
          type: 'string',
          enum: ['ALL', 'TURNED_IN', 'UNGRADED', 'DRAFT_GRADED', 'RETURNED', 'MISSING'],
          description: 'Filter submissions by status. Defaults to ALL.',
        },
      },
    },
  },
  {
    name: 'get_student_submission_content',
    description:
      "Retrieves and extracts the full live content of a student's submission from Google Classroom & Drive, including text from Google Docs/Slides/Sheets, code files, PDFs, or short answers.",
    parameters: {
      type: 'object',
      properties: {
        studentId: { type: 'string', description: 'The unique studentId to inspect' },
      },
      required: ['studentId'],
    },
  },
  {
    name: 'evaluate_and_grade_submission',
    description:
      'Grades an individual student submission according to the rubric. Writes the grade directly to Google Classroom API and saves the rubric breakdown to the Firestore sidecar. Explains comprehensive critique and rationale directly in the co-pilot chat for the teacher. Call once per student.',
    parameters: {
      type: 'object',
      properties: {
        studentId: { type: 'string', description: 'Unique identifier of the student being graded' },
        rubricScores: {
          type: 'array',
          description: 'Breakdown of scores and comments for each criterion in the rubric',
          items: {
            type: 'object',
            properties: {
              criterionId: { type: 'string', description: 'ID of the rubric criterion' },
              score: { type: 'number', description: 'Score awarded for this criterion' },
              comment: { type: 'string', description: 'Detailed feedback justifying the criterion score' },
            },
            required: ['criterionId', 'score', 'comment'],
          },
        },
        draftGrade: { type: 'number', description: 'Total grade out of assignment maxPoints to assign to the student' },
        overallFeedback: { type: 'string', description: 'Comprehensive constructive feedback for the teacher to review in chat' },
      },
      required: ['studentId', 'rubricScores', 'draftGrade', 'overallFeedback'],
    },
  },
  {
    name: 'return_student_submissions',
    description:
      'Promotes draft grades to assigned grades and officially returns submissions to one or more students via Google Classroom API.',
    parameters: {
      type: 'object',
      properties: {
        studentIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of studentIds whose graded submissions should be returned to them',
        },
      },
      required: ['studentIds'],
    },
  },
];

export async function executeGradingTool(
  toolName: string,
  args: Record<string, any>,
  context: ToolExecutionContext
): Promise<any> {
  const { assignmentId, googleAccessToken } = context;
  const { courseId, courseWorkId } = parseAssignmentId(assignmentId);
  const db = admin.firestore();
  const assignRef = db.collection('assignments').doc(assignmentId);

  switch (toolName) {
    case 'get_assignment_details': {
      const [{ assignment }, sidecarSnap] = await Promise.all([
        fetchLiveWorkspaceFromClassroom(googleAccessToken, courseId, courseWorkId),
        assignRef.get(),
      ]);
      const sidecarData = sidecarSnap.exists ? sidecarSnap.data() : null;
      let activeRubric = sidecarData?.rubric || null;
      if (!activeRubric && assignment.rubric) {
        activeRubric = assignment.rubric;
        await assignRef.set(
          {
            rubric: activeRubric,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }
      return {
        ...assignment,
        rubric: activeRubric,
      };
    }

    case 'set_assignment_rubric': {
      const { title, criteria } = args;
      if (!Array.isArray(criteria) || criteria.length === 0) {
        throw new Error('Rubric must contain at least one criterion.');
      }

      const totalCriterionPoints = criteria.reduce((sum: number, c: any) => sum + (Number(c.maxPoints) || 0), 0);
      const rubricPayload = {
        id: `rubric_${Date.now()}`,
        title: title || 'Grading Rubric',
        criteria,
        updatedAt: new Date().toISOString(),
      };

      await assignRef.set(
        {
          rubric: rubricPayload,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      return {
        success: true,
        message: `Rubric updated with ${criteria.length} criteria totaling ${totalCriterionPoints} points.`,
        rubric: rubricPayload,
      };
    }

    case 'list_student_submissions': {
      const { statusFilter = 'ALL' } = args;
      const [{ submissions: liveSubs }, evalsSnap] = await Promise.all([
        fetchLiveWorkspaceFromClassroom(googleAccessToken, courseId, courseWorkId),
        assignRef.collection('evaluations').get(),
      ]);

      const evalMap = new Map<string, any>();
      evalsSnap.docs.forEach((d) => evalMap.set(d.id, d.data()));

      const mergedSubs = liveSubs.map((sub) => {
        const evalData = evalMap.get(sub.studentId);
        return {
          ...sub,
          draftGrade: evalData?.draftGrade !== undefined ? evalData.draftGrade : sub.draftGrade,
          assignedGrade: evalData?.assignedGrade !== undefined ? evalData.assignedGrade : sub.assignedGrade,
        };
      });

      const filtered = mergedSubs.filter((sub: any) => {
        switch (statusFilter) {
          case 'TURNED_IN':
            return sub.state === 'TURNED_IN';
          case 'UNGRADED':
            return sub.state === 'TURNED_IN' && sub.draftGrade === undefined && sub.assignedGrade === undefined;
          case 'DRAFT_GRADED':
            return sub.draftGrade !== undefined && sub.state !== 'RETURNED';
          case 'RETURNED':
            return sub.state === 'RETURNED';
          case 'MISSING':
            return sub.state === 'CREATED' && (!sub.attachments || sub.attachments.length === 0);
          case 'ALL':
          default:
            return true;
        }
      });

      return {
        totalCount: mergedSubs.length,
        filteredCount: filtered.length,
        submissions: filtered.map((s: any) => ({
          studentId: s.studentId,
          studentName: s.studentName,
          state: s.state,
          draftGrade: s.draftGrade,
          assignedGrade: s.assignedGrade,
          late: s.late,
          attachmentCount: s.attachments?.length || 0,
          attachmentTitles: s.attachments?.map((a: any) => a.title) || [],
        })),
      };
    }

    case 'get_student_submission_content': {
      const { studentId } = args;
      if (!studentId) throw new Error('studentId is required to retrieve submission content.');

      const { submissions } = await fetchLiveWorkspaceFromClassroom(googleAccessToken, courseId, courseWorkId);
      const subData = submissions.find((s) => s.studentId === studentId || s.submissionId === studentId);
      if (!subData) {
        throw new Error(`Student submission ${studentId} not found in Google Classroom.`);
      }

      const attachments = subData.attachments || [];
      const extractedItems: any[] = [];

      for (const att of attachments) {
        if (att.contentPreview) {
          extractedItems.push({
            title: att.title,
            type: att.type,
            content: att.contentPreview,
          });
        } else if (att.driveFileId) {
          try {
            const extracted = await extractDriveFile(googleAccessToken, att.driveFileId, 'text');
            extractedItems.push({
              title: att.title,
              type: att.type,
              content: extracted.textContent || `[File loaded without text content: ${att.title}]`,
            });
          } catch (err: any) {
            extractedItems.push({
              title: att.title,
              type: att.type,
              error: `Failed to extract Drive file: ${err.message}`,
            });
          }
        } else if (att.shortAnswer) {
          extractedItems.push({
            title: att.title || 'Short Answer',
            type: 'SHORT_ANSWER',
            content: att.shortAnswer,
          });
        }
      }

      return {
        studentId: subData.studentId,
        studentName: subData.studentName,
        state: subData.state,
        late: subData.late,
        attachments: extractedItems,
      };
    }

    case 'evaluate_and_grade_submission': {
      const { studentId, rubricScores, draftGrade, overallFeedback } = args;
      if (!studentId) throw new Error('studentId is required for evaluate_and_grade_submission.');
      if (draftGrade === undefined) throw new Error('draftGrade is required.');

      const { assignment, submissions } = await fetchLiveWorkspaceFromClassroom(
        googleAccessToken,
        courseId,
        courseWorkId
      );
      const liveSub = submissions.find((s) => s.studentId === studentId || s.submissionId === studentId);
      if (!liveSub) {
        throw new Error(`Student ${studentId} submission does not exist in Google Classroom.`);
      }

      let syncStatus = 'SYNCED_GRADE';
      let syncError: string | undefined;

      // 1. Write grade directly to Google Classroom API immediately (assignedGrade + draftGrade)
      try {
        await patchSubmissionGrade(
          googleAccessToken,
          courseId,
          courseWorkId,
          liveSub.submissionId,
          draftGrade,
          draftGrade
        );
        try {
          await returnSubmission(
            googleAccessToken,
            courseId,
            courseWorkId,
            liveSub.submissionId
          );
          syncStatus = 'RETURNED';
        } catch {
          syncStatus = 'SYNCED_GRADE';
        }
      } catch (err: any) {
        if (err.message && err.message.includes('403')) {
          syncStatus = 'LOCAL_ONLY_PERMISSION_DENIED';
          syncError =
            'Google Classroom API grade write-back requires coursework created by this app. Grade saved in Classroom Agent sidecar.';
        } else {
          syncStatus = 'ERROR';
          syncError = err.message || 'Failed to patch grade in Google Classroom.';
        }
      }

      // 2. Persist evaluation to Firestore Sidecar (evaluations/{studentId})
      // NOTE: Submission comments are reserved strictly for genuine 2-way dialogue with the student.
      // Agent feedback is delivered exclusively in the Co-Pilot Chat Panel and NOT duplicated into comments.
      const evalRef = assignRef.collection('evaluations').doc(liveSub.studentId);
      const evalSnap = await evalRef.get();
      const existingEval = evalSnap.exists ? evalSnap.data() : null;
      const existingComments = existingEval?.comments || [];

      await evalRef.set(
        {
          studentId: liveSub.studentId,
          submissionId: liveSub.submissionId,
          draftGrade,
          assignedGrade: draftGrade,
          rubricBreakdown: rubricScores || [],
          overallFeedback: overallFeedback || '',
          comments: existingComments,
          classroomSyncStatus: syncStatus,
          classroomSyncError: syncError || null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      return {
        success: true,
        studentId: liveSub.studentId,
        studentName: liveSub.studentName,
        grade: draftGrade,
        assignedGrade: draftGrade,
        maxPoints: assignment.maxPoints,
        rubricScores: rubricScores || [],
        feedback: overallFeedback || '',
        classroomSyncStatus: syncStatus,
        syncNotice: syncError,
      };
    }

    case 'return_student_submissions': {
      const { studentIds } = args;
      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        throw new Error('studentIds array is required.');
      }

      const { submissions: liveSubmissions } = await fetchLiveWorkspaceFromClassroom(
        googleAccessToken,
        courseId,
        courseWorkId
      );
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
            googleAccessToken,
            courseId,
            courseWorkId,
            liveSub.submissionId,
            undefined,
            gradeToAssign
          );

          await returnSubmission(googleAccessToken, courseId, courseWorkId, liveSub.submissionId);

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

      return {
        success: true,
        returnedCount: results.filter((r) => r.status === 'RETURNED').length,
        results,
      };
    }

    default:
      throw new Error(`[Grading Tools] Unknown tool declaration: ${toolName}`);
  }
}
