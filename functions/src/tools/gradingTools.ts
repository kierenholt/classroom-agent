import * as admin from 'firebase-admin';
import { patchSubmissionGrade, returnSubmission } from '../services/classroomClient';
import { extractDriveFile } from '../services/driveExtractor';

export interface ToolExecutionContext {
  assignmentId: string;
  googleAccessToken: string;
  teacherUserId: string;
}

export const gradingToolDeclarations = [
  {
    name: 'get_assignment_details',
    description: 'Returns the current assignment description, maximum points, due date, active rubric criteria, and submission counts from Firestore.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'set_assignment_rubric',
    description: 'Configures or updates the grading rubric for this assignment. Saves structured criteria in Firestore and updates the marking panel.',
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
    description: 'Lists all students enrolled in this assignment along with their submission status, turn-in state, existing grades, and attachment names.',
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
    description: 'Retrieves and extracts the full content of a student\'s submission, including text from Google Docs/Slides/Sheets, code files, PDFs, or short answers.',
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
    description: 'Grades an individual student submission according to the rubric. Calculates draftGrade, saves feedback comments, syncs to Google Classroom, and updates Firestore. Call once per student.',
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
        draftGrade: { type: 'number', description: 'Total draft grade out of assignment maxPoints' },
        overallFeedback: { type: 'string', description: 'Comprehensive constructive feedback for the student' },
      },
      required: ['studentId', 'rubricScores', 'draftGrade', 'overallFeedback'],
    },
  },
  {
    name: 'return_student_submissions',
    description: 'Promotes draft grades to assigned grades and officially returns submissions to one or more students via Google Classroom.',
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
  const db = admin.firestore();
  const assignRef = db.collection('assignments').doc(assignmentId);

  switch (toolName) {
    case 'get_assignment_details': {
      const snap = await assignRef.get();
      if (!snap.exists) {
        throw new Error(`Assignment ${assignmentId} does not exist in Firestore.`);
      }
      return snap.data();
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

      await assignRef.update({
        rubric: rubricPayload,
        updatedAt: new Date().toISOString(),
      });

      return {
        success: true,
        message: `Rubric updated with ${criteria.length} criteria totaling ${totalCriterionPoints} points.`,
        rubric: rubricPayload,
      };
    }

    case 'list_student_submissions': {
      const { statusFilter = 'ALL' } = args;
      const subsSnap = await assignRef.collection('submissions').get();
      const allSubs = subsSnap.docs.map((d) => d.data());

      const filtered = allSubs.filter((sub: any) => {
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
        totalCount: allSubs.length,
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

      const subRef = assignRef.collection('submissions').doc(studentId);
      const subSnap = await subRef.get();
      if (!subSnap.exists) {
        throw new Error(`Student submission ${studentId} not found.`);
      }

      const subData = subSnap.data()!;
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
        studentId,
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

      const assignSnap = await assignRef.get();
      if (!assignSnap.exists) throw new Error(`Assignment ${assignmentId} does not exist.`);
      const assignData = assignSnap.data()!;

      const subRef = assignRef.collection('submissions').doc(studentId);
      const subSnap = await subRef.get();
      if (!subSnap.exists) throw new Error(`Student ${studentId} submission does not exist.`);
      const subData = subSnap.data()!;

      let syncStatus = 'SYNCED_DRAFT';
      let syncError: string | undefined;

      // 1. Attempt write-back to Google Classroom API
      try {
        await patchSubmissionGrade(
          googleAccessToken,
          assignData.courseId,
          assignData.courseWorkId,
          subData.submissionId,
          draftGrade,
          undefined
        );
      } catch (err: any) {
        // If permission denied due to OAuth developer mismatch, handle fail-fast but allow local persistence
        if (err.message && err.message.includes('403')) {
          syncStatus = 'LOCAL_ONLY_PERMISSION_DENIED';
          syncError = 'Google Classroom API draftGrade write-back requires coursework created by this app. Grade saved in Classroom Agent.';
        } else {
          syncStatus = 'ERROR';
          syncError = err.message || 'Failed to patch grade in Google Classroom.';
        }
      }

      // 2. Prepare submission comments
      const existingComments = subData.comments || [];
      const newComment = {
        id: `comment_${Date.now()}`,
        author: 'Agent',
        content: `Evaluated by Classroom Agent:\nScore: ${draftGrade}/${assignData.maxPoints}\n\n${overallFeedback}`,
        createdAt: new Date().toISOString(),
        syncedToDriveOrClassroom: syncStatus === 'SYNCED_DRAFT',
      };

      // 3. Persist evaluation directly to Firestore
      await subRef.update({
        draftGrade,
        rubricBreakdown: rubricScores || [],
        overallFeedback,
        comments: [...existingComments, newComment],
        classroomSyncStatus: syncStatus,
        classroomSyncError: syncError || null,
        updatedAt: new Date().toISOString(),
      });

      return {
        success: true,
        studentId,
        studentName: subData.studentName,
        draftGrade,
        maxPoints: assignData.maxPoints,
        classroomSyncStatus: syncStatus,
        syncNotice: syncError,
      };
    }

    case 'return_student_submissions': {
      const { studentIds } = args;
      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        throw new Error('studentIds array is required.');
      }

      const assignSnap = await assignRef.get();
      if (!assignSnap.exists) throw new Error(`Assignment ${assignmentId} does not exist.`);
      const assignData = assignSnap.data()!;

      const results: any[] = [];

      for (const studentId of studentIds) {
        const subRef = assignRef.collection('submissions').doc(studentId);
        const subSnap = await subRef.get();
        if (!subSnap.exists) continue;
        const subData = subSnap.data()!;

        const gradeToAssign = subData.draftGrade ?? subData.assignedGrade ?? 0;

        try {
          // Patch assignedGrade
          await patchSubmissionGrade(
            googleAccessToken,
            assignData.courseId,
            assignData.courseWorkId,
            subData.submissionId,
            undefined,
            gradeToAssign
          );

          // Return submission on Classroom
          await returnSubmission(
            googleAccessToken,
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
