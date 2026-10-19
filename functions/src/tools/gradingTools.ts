import * as admin from 'firebase-admin';
import {
  listTeacherCourses,
  getCourse,
  createCourseWork,
  fetchLiveWorkspaceFromClassroom,
  computeRubricTotalPoints,
  patchCourseWorkMaxPoints,
  parseAssignmentId,
  patchSubmissionGrade,
  returnSubmission,
} from '../services/classroomClient';
import { extractDriveFile } from '../services/driveExtractor';
import { deductUserCredit } from '../services/creditsService';
import { USER_GUIDE_MARKDOWN } from './userGuideContent';

export interface ToolExecutionContext {
  assignmentId: string;
  googleAccessToken: string;
  teacherUserId: string;
}

export const gradingToolDeclarations = [
  {
    name: 'get_user_guide',
    description:
      'Returns the complete Classroom Agent User Guide & Technical Support Reference. Call this tool whenever the teacher asks "how do I do XYZ?", asks about UI features, buttons, tabs, settings, grading modes, approving feedback, rubrics, AI credits/billing, or troubleshooting.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
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
    name: 'list_teacher_courses',
    description:
      'Lists all active Google Classroom courses where the authenticated teacher teaches, returning course IDs, names, and sections.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'create_classroom_assignment',
    description:
      'Creates a new assignment (coursework) in Google Classroom. By default, creates the assignment in the currently open course unless a specific courseId is provided. Optionally attaches an initial grading rubric in the Firestore sidecar.',
    parameters: {
      type: 'object',
      properties: {
        courseId: {
          type: 'string',
          description:
            'Optional Google Classroom courseId to create the assignment in. If omitted, defaults to the courseId of the currently open assignment.',
        },
        title: {
          type: 'string',
          description: 'Title of the new assignment (required).',
        },
        description: {
          type: 'string',
          description: 'Assignment instructions, prompt, or description for students.',
        },
        maxPoints: {
          type: 'number',
          description: 'Maximum points for the assignment (if rubricCriteria is provided, maxPoints is automatically set to the sum of rubric criteria maxPoints; otherwise defaults to 100).',
        },
        dueDate: {
          type: 'string',
          description: 'Optional due date in YYYY-MM-DD format (must be a future date if provided).',
        },
        state: {
          type: 'string',
          enum: ['PUBLISHED', 'DRAFT'],
          description: 'Whether to publish the assignment immediately or save as draft (defaults to PUBLISHED).',
        },
        rubricTitle: {
          type: 'string',
          description: 'Optional title for an initial grading rubric to attach to the new assignment.',
        },
        rubricCriteria: {
          type: 'array',
          description:
            'Optional list of rubric criteria to initialize for the newly created assignment in the Firestore sidecar.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Unique identifier for the criterion (e.g. crit_1, thesis, syntax)' },
              title: { type: 'string', description: 'Criterion title' },
              description: { type: 'string', description: 'Description of expectations for this criterion' },
              maxPoints: { type: 'number', description: 'Maximum points awarded for this criterion' },
            },
            required: ['id', 'title', 'maxPoints'],
          },
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'set_assignment_rubric',
    description:
      'Configures or updates the grading rubric for this assignment. Saves structured criteria in the Firestore sidecar, updates the assignment maxPoints to match the rubric total points, and updates the marking panel.',
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
      'Evaluates an individual student submission and stages a proposed score, a feedback document, or both in the Firestore sidecar for teacher preview and approval in the chat panel. Call once per student.',
    parameters: {
      type: 'object',
      properties: {
        studentId: { type: 'string', description: 'Unique identifier of the student being evaluated' },
        rubricScores: {
          type: 'array',
          description: 'Breakdown of scores and comments for each criterion in the rubric (pass empty array [] if rubric evaluation is disabled)',
          items: {
            type: 'object',
            properties: {
              criterionId: { type: 'string', description: 'ID of the rubric criterion' },
              score: { type: 'number', description: 'Score awarded for this criterion (must not exceed the criterion maxPoints)' },
              comment: { type: 'string', description: 'Detailed feedback justifying the criterion score' },
            },
            required: ['criterionId', 'score', 'comment'],
          },
        },
        draftGrade: {
          type: 'number',
          description: 'Total numerical grade out of assignment maxPoints to propose for the student. When a rubric is used (rubricScores is non-empty), draftGrade MUST be the exact sum of the scores in rubricScores out of the rubric total maxPoints — NEVER scale or convert to 100. Omit if only generating a written feedback document without a score.',
        },
        overallFeedback: {
          type: 'string',
          description: 'Comprehensive constructive feedback document for the teacher to preview, edit, and approve. Omit or pass empty string if only proposing a numerical score.',
        },
      },
      required: ['studentId'],
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
    case 'get_user_guide': {
      return {
        guide: USER_GUIDE_MARKDOWN,
      };
    }

    case 'get_assignment_details': {
      const [{ assignment }, sidecarSnap] = await Promise.all([
        fetchLiveWorkspaceFromClassroom(googleAccessToken, courseId, courseWorkId),
        assignRef.get(),
      ]);
      const sidecarData = sidecarSnap.exists ? sidecarSnap.data() : null;
      let activeRubric = sidecarData?.rubric || null;
      if (!activeRubric && assignment.rubric) {
        activeRubric = assignment.rubric;
        const rubricPoints = computeRubricTotalPoints(activeRubric);
        await assignRef.set(
          {
            rubric: activeRubric,
            ...(rubricPoints > 0 ? { maxPoints: rubricPoints } : {}),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }
      const rubricTotalPoints = computeRubricTotalPoints(activeRubric);
      const effectiveMaxPoints =
        rubricTotalPoints > 0
          ? rubricTotalPoints
          : typeof sidecarData?.maxPoints === 'number' && sidecarData.maxPoints > 0
            ? sidecarData.maxPoints
            : assignment.maxPoints || 100;

      return {
        ...assignment,
        maxPoints: effectiveMaxPoints,
        rubric: activeRubric,
      };
    }

    case 'list_teacher_courses': {
      const courses = await listTeacherCourses(googleAccessToken);
      return {
        count: courses.length,
        courses: courses.map((c) => ({
          id: c.id,
          name: c.name,
          section: c.section || undefined,
          courseState: c.courseState || 'ACTIVE',
        })),
      };
    }

    case 'create_classroom_assignment': {
      const targetCourseId = args.courseId && String(args.courseId).trim() ? String(args.courseId).trim() : courseId;
      const title = args.title ? String(args.title).trim() : '';
      if (!title) {
        throw new Error('Assignment title is required for create_classroom_assignment.');
      }

      const rubricTotalPoints = Array.isArray(args.rubricCriteria)
        ? computeRubricTotalPoints({ criteria: args.rubricCriteria })
        : 0;
      const effectiveMaxPoints =
        rubricTotalPoints > 0
          ? rubricTotalPoints
          : args.maxPoints !== undefined
            ? Number(args.maxPoints)
            : 100;

      const [created, targetCourse] = await Promise.all([
        createCourseWork(googleAccessToken, targetCourseId, {
          title,
          description: args.description ? String(args.description).trim() : undefined,
          maxPoints: effectiveMaxPoints,
          dueDate: args.dueDate ? String(args.dueDate).trim() : undefined,
          state: args.state === 'DRAFT' ? 'DRAFT' : 'PUBLISHED',
        }),
        getCourse(googleAccessToken, targetCourseId).catch(() => null),
      ]);

      if (!created.id) {
        throw new Error('Google Classroom API did not return a courseWork id.');
      }

      const newAssignmentId = `${targetCourseId}_${created.id}`;
      let savedRubric: any = null;

      if (Array.isArray(args.rubricCriteria) && args.rubricCriteria.length > 0) {
        savedRubric = {
          id: `rubric_${Date.now()}`,
          title: args.rubricTitle || `${title} Rubric`,
          criteria: args.rubricCriteria,
          updatedAt: new Date().toISOString(),
        };
        await db
          .collection('assignments')
          .doc(newAssignmentId)
          .set(
            {
              rubric: savedRubric,
              maxPoints: effectiveMaxPoints,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
      }

      return {
        success: true,
        assignmentId: newAssignmentId,
        courseId: targetCourseId,
        courseName: targetCourse?.name || 'Classroom Course',
        courseWorkId: created.id,
        title: created.title || title,
        description: created.description || '',
        maxPoints: effectiveMaxPoints,
        state: created.state || 'PUBLISHED',
        alternateLink: created.alternateLink || undefined,
        rubric: savedRubric || undefined,
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

      await Promise.all([
        assignRef.set(
          {
            rubric: rubricPayload,
            maxPoints: totalCriterionPoints,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        ),
        patchCourseWorkMaxPoints(googleAccessToken, courseId, courseWorkId, totalCriterionPoints).catch(() => null),
      ]);

      return {
        success: true,
        message: `Rubric updated with ${criteria.length} criteria totaling ${totalCriterionPoints} points. Assignment maxPoints set to ${totalCriterionPoints}.`,
        maxPoints: totalCriterionPoints,
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
        const isReturned = evalData?.classroomSyncStatus === 'RETURNED' || sub.state === 'RETURNED';
        const isTurnedIn = evalData?.clonedSubmissionState === 'TURNED_IN' || sub.state === 'TURNED_IN';
        return {
          ...sub,
          state: isReturned ? 'RETURNED' : isTurnedIn ? 'TURNED_IN' : sub.state,
          draftGrade: evalData?.draftGrade !== undefined && evalData?.draftGrade !== null ? evalData.draftGrade : sub.draftGrade,
          assignedGrade: evalData?.assignedGrade !== undefined && evalData?.assignedGrade !== null ? evalData.assignedGrade : sub.assignedGrade,
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

      const [{ submissions }, evalSnap] = await Promise.all([
        fetchLiveWorkspaceFromClassroom(googleAccessToken, courseId, courseWorkId),
        assignRef.collection('evaluations').doc(studentId).get(),
      ]);
      const subData = submissions.find((s) => s.studentId === studentId || s.submissionId === studentId);
      if (!subData) {
        throw new Error(`Student submission ${studentId} not found in Google Classroom.`);
      }
      const evalData = evalSnap.exists ? evalSnap.data() : null;

      // Each time the agent fetches a student's work, deduct 1 AI credit (clamped at 0)
      let remainingAiCredits: number | undefined;
      if (context.teacherUserId) {
        remainingAiCredits = await deductUserCredit(context.teacherUserId, 1);
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

      if (evalData?.clonedShortAnswer && !extractedItems.some((i) => i.type === 'SHORT_ANSWER')) {
        extractedItems.push({
          title: 'Short Answer Response',
          type: 'SHORT_ANSWER',
          content: evalData.clonedShortAnswer,
        });
      }

      return {
        studentId: subData.studentId,
        studentName: subData.studentName,
        state: evalData?.clonedSubmissionState === 'TURNED_IN' && subData.state !== 'RETURNED' ? 'TURNED_IN' : subData.state,
        late: subData.late,
        attachments: extractedItems,
        ...(remainingAiCredits !== undefined ? { remainingAiCredits } : {}),
      };
    }

    case 'evaluate_and_grade_submission': {
      const { studentId, rubricScores, draftGrade, overallFeedback } = args;
      if (!studentId) throw new Error('studentId is required for evaluate_and_grade_submission.');

      const hasExplicitScore = typeof draftGrade === 'number' && !Number.isNaN(draftGrade);
      let cleanFeedback = typeof overallFeedback === 'string' ? overallFeedback.trim() : '';
      const hasFeedbackDoc = cleanFeedback.length > 0;

      const [{ assignment, submissions }, sidecarSnap] = await Promise.all([
        fetchLiveWorkspaceFromClassroom(googleAccessToken, courseId, courseWorkId),
        assignRef.get(),
      ]);
      const liveSub = submissions.find((s) => s.studentId === studentId || s.submissionId === studentId);
      if (!liveSub) {
        throw new Error(`Student ${studentId} submission does not exist in Google Classroom.`);
      }

      const sidecarData = sidecarSnap.exists ? sidecarSnap.data() : null;
      const activeRubric = sidecarData?.rubric || assignment.rubric || null;
      const rubricTotalPoints = computeRubricTotalPoints(activeRubric);
      const effectiveMaxPoints =
        rubricTotalPoints > 0
          ? rubricTotalPoints
          : typeof sidecarData?.maxPoints === 'number' && sidecarData.maxPoints > 0
            ? sidecarData.maxPoints
            : assignment.maxPoints || 100;

      const criteriaById = new Map<string, any>();
      if (activeRubric && Array.isArray(activeRubric.criteria)) {
        for (const c of activeRubric.criteria) {
          if (c && c.id) criteriaById.set(String(c.id), c);
        }
      }

      const sanitizedRubricScores = Array.isArray(rubricScores)
        ? rubricScores.map((item: any) => {
            const crit = criteriaById.get(String(item.criterionId || ''));
            let score = Number(item.score) || 0;
            if (crit && typeof crit.maxPoints === 'number' && crit.maxPoints > 0) {
              score = Math.max(0, Math.min(score, Number(crit.maxPoints)));
            } else {
              score = Math.max(0, score);
            }
            return {
              ...item,
              criterionId: String(item.criterionId || ''),
              score,
              comment: typeof item.comment === 'string' ? item.comment : '',
            };
          })
        : [];

      const hasRubricBreakdownScores = sanitizedRubricScores.length > 0;
      const rubricScoreSum = sanitizedRubricScores.reduce(
        (sum: number, item: any) => sum + (Number(item.score) || 0),
        0
      );

      // When rubricScores are provided alongside a proposed score (or when rubricScores are provided without feedback),
      // the total grade MUST be calculated as the sum of the rubric criterion scores out of the rubric's total maxPoints.
      const hasScore = hasExplicitScore || (!hasFeedbackDoc && hasRubricBreakdownScores);
      if (!hasScore && !hasFeedbackDoc) {
        throw new Error('At least one of draftGrade (score) or overallFeedback (feedback document) is required.');
      }

      let stagedGrade: number | null = null;
      if (hasScore) {
        if (hasRubricBreakdownScores && rubricTotalPoints > 0) {
          stagedGrade = rubricScoreSum;
        } else {
          stagedGrade = Math.max(0, Math.min(Number(draftGrade), effectiveMaxPoints));
        }
      }

      // If the written feedback document mistakenly formatted Total Score out of 100 when effectiveMaxPoints != 100,
      // normalize the Total Score line to use stagedGrade / effectiveMaxPoints.
      if (cleanFeedback && stagedGrade !== null && effectiveMaxPoints !== 100) {
        cleanFeedback = cleanFeedback.replace(
          /(Total\s+Score|Overall\s+Score|Final\s+Grade|Overall\s+Grade)(\s*\*?\*?:\s*\*?\*?)\s*\d+(?:\.\d+)?\s*\/\s*100\b/gi,
          `$1$2${stagedGrade} / ${effectiveMaxPoints}`
        );
      }

      // Stage evaluation in Firestore Sidecar (evaluations/{studentId}) as PENDING_APPROVAL.
      // Writes to Google Classroom API only happen when the teacher clicks "Approve" in the Chat Panel.
      const evalRef = assignRef.collection('evaluations').doc(liveSub.studentId);
      const evalSnap = await evalRef.get();
      const existingEval = evalSnap.exists ? evalSnap.data() : null;
      const existingComments = existingEval?.comments || [];

      await evalRef.set(
        {
          studentId: liveSub.studentId,
          submissionId: liveSub.submissionId,
          draftGrade: stagedGrade,
          rubricBreakdown: sanitizedRubricScores,
          overallFeedback: cleanFeedback,
          comments: existingComments,
          classroomSyncStatus: 'PENDING_APPROVAL',
          classroomSyncError: null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      return {
        success: true,
        studentId: liveSub.studentId,
        studentName: liveSub.studentName,
        submissionId: liveSub.submissionId,
        grade: stagedGrade,
        maxPoints: effectiveMaxPoints,
        rubricScores: sanitizedRubricScores,
        feedback: cleanFeedback,
        hasScore,
        hasFeedbackDoc,
        classroomSyncStatus: 'PENDING_APPROVAL',
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
        const evalRef = assignRef.collection('evaluations').doc(studentId);
        const evalSnap = await evalRef.get();
        const evalData = evalSnap.exists ? evalSnap.data() : null;

        const submissionId = liveSub?.submissionId || evalData?.submissionId;
        const studentName = liveSub?.studentName || evalData?.studentName || studentId;

        if (!submissionId) {
          results.push({ studentId, studentName, status: 'ERROR', error: 'Submission not found in Classroom' });
          continue;
        }

        const gradeToAssign =
          evalData?.draftGrade ?? liveSub?.draftGrade ?? evalData?.assignedGrade ?? liveSub?.assignedGrade ?? undefined;
        const hasGrade = typeof gradeToAssign === 'number' && !Number.isNaN(gradeToAssign);
        const syncWarnings: string[] = [];

        if (hasGrade) {
          try {
            await patchSubmissionGrade(
              googleAccessToken,
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
          await returnSubmission(googleAccessToken, courseId, courseWorkId, submissionId);
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
