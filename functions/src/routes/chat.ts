import { Router, Response } from 'express';
import * as admin from 'firebase-admin';
import { GoogleGenAI } from '@google/genai';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { serverEnv } from '../config/env';
import { gradingToolDeclarations, executeGradingTool, ToolExecutionContext } from '../tools/gradingTools';
import {
  getCourse,
  getCourseWork,
  fetchLiveWorkspaceFromClassroom,
  computeRubricTotalPoints,
  parseAssignmentId,
} from '../services/classroomClient';
import { ensureUserCredits } from '../services/creditsService';
import { logger } from '../services/logger';

export const chatRouter = Router();

const TONE_INSTRUCTIONS: Record<string, string> = {
  encouraging:
    'Encouraging & Supportive — highlight student strengths first, frame areas for growth positively, and build student confidence.',
  constructive:
    'Constructive & Balanced — provide objective, balanced critique weighing strengths and areas for improvement equally.',
  direct:
    'Direct & Concise — get straight to the point with clear, no-fluff observations and corrections.',
  formal:
    'Formal & Academic — use scholarly, rigorous academic language and objective evaluative phrasing.',
  warm:
    'Warm & Mentorship-focused — write like a supportive mentor guiding the student on their long-term learning journey.',
};

const DETAIL_LEVEL_INSTRUCTIONS: Record<string, string> = {
  brief:
    'Brief / Summary — keep feedback concise (2-4 sentences or short bullet points focusing strictly on high-impact takeaways).',
  standard:
    'Standard / Balanced — provide clear explanations with specific examples from the student submission.',
  comprehensive:
    'Comprehensive / Deep-Dive — provide thorough, in-depth analysis referencing specific parts of the submission and explaining underlying concepts.',
};

chatRouter.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { projectId, message, fileUri, fileMimeType, contextId, feedbackSettings, workspaceContext } = req.body;

  const tone = feedbackSettings?.tone && TONE_INSTRUCTIONS[feedbackSettings.tone] ? feedbackSettings.tone : 'encouraging';
  const detailLevel =
    feedbackSettings?.detailLevel && DETAIL_LEVEL_INSTRUCTIONS[feedbackSettings.detailLevel]
      ? feedbackSettings.detailLevel
      : 'standard';
  const useRubricDuringFeedback =
    typeof feedbackSettings?.useRubricDuringFeedback === 'boolean' ? feedbackSettings.useRubricDuringFeedback : true;
  const provideNextSteps =
    typeof feedbackSettings?.provideNextSteps === 'boolean' ? feedbackSettings.provideNextSteps : true;
  const showScores =
    typeof feedbackSettings?.showScores === 'boolean' ? feedbackSettings.showScores : true;
  const customAgentInstructions =
    typeof feedbackSettings?.customAgentInstructions === 'string'
      ? feedbackSettings.customAgentInstructions.trim()
      : '';

  // Fail-fast validation
  if (!projectId || typeof projectId !== 'string' || projectId.trim() === '') {
    res.status(400).json({ error: '[Chat Error] Missing mandatory projectId (assignmentId). Fail-fast enabled.' });
    return;
  }
  if (!message || typeof message !== 'string' || message.trim() === '') {
    res.status(400).json({ error: '[Chat Error] Missing mandatory message string. Fail-fast enabled.' });
    return;
  }
  if (!req.googleAccessToken) {
    res.status(401).json({ error: '[Chat Error] Missing Google OAuth access token. Fail-fast enabled.' });
    return;
  }
  if (!req.user?.uid) {
    res.status(401).json({ error: '[Chat Error] Missing authenticated teacher uid. Fail-fast enabled.' });
    return;
  }

  // Enforce non-zero AI credits before the agent can respond
  const currentCredits = await ensureUserCredits(req.user.uid, req.user.email);
  if (currentCredits <= 0) {
    res.status(402).json({
      error: 'You have 0 AI credits remaining. Please top up your AI credits to continue using the Grading Agent.',
      code: 'OUT_OF_CREDITS',
      aiCredits: 0,
    });
    return;
  }

  // Set SSE streaming headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendEvent = (eventType: string, payload: Record<string, any>) => {
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`);
  };

  const db = admin.firestore();
  const assignmentRef = db.collection('assignments').doc(projectId);

  try {
    // 1. Fetch live assignment + roster/submissions from Google Classroom API + sidecar rubric & evaluations
    const { courseId, courseWorkId } = parseAssignmentId(projectId);
    const [workspaceData, sidecarSnap, evalsSnap] = await Promise.all([
      fetchLiveWorkspaceFromClassroom(req.googleAccessToken, courseId, courseWorkId).catch(async () => {
        const [course, coursework] = await Promise.all([
          getCourse(req.googleAccessToken!, courseId),
          getCourseWork(req.googleAccessToken!, courseId, courseWorkId),
        ]);
        return {
          assignment: {
            id: projectId,
            courseId,
            courseName: course.name || 'Classroom Course',
            courseWorkId,
            title: coursework.title || 'Classroom Assignment',
            description: coursework.description || '',
            maxPoints: coursework.maxPoints || 100,
            dueDate: undefined,
            state: (coursework.state || 'PUBLISHED') as 'PUBLISHED' | 'DRAFT',
            rubric: undefined,
          },
          submissions: [] as any[],
        };
      }),
      assignmentRef.get(),
      assignmentRef.collection('evaluations').get(),
    ]);

    const sidecarData = sidecarSnap.exists ? sidecarSnap.data() : null;
    const evalMap = new Map<string, any>();
    evalsSnap.docs.forEach((d) => evalMap.set(d.id, d.data()));

    const liveSubs = workspaceData.submissions || [];
    const mergedSubs = liveSubs.map((sub: any) => {
      const sidecarEval = evalMap.get(sub.studentId);
      const isReturned = sidecarEval?.classroomSyncStatus === 'RETURNED' || sub.state === 'RETURNED';
      return {
        ...sub,
        state: isReturned ? 'RETURNED' : sub.state,
        draftGrade:
          sidecarEval?.draftGrade !== undefined && sidecarEval?.draftGrade !== null
            ? sidecarEval.draftGrade
            : sub.draftGrade,
        assignedGrade:
          sidecarEval?.assignedGrade !== undefined && sidecarEval?.assignedGrade !== null
            ? sidecarEval.assignedGrade
            : sub.assignedGrade,
        classroomSyncStatus: sidecarEval?.classroomSyncStatus || sub.classroomSyncStatus,
      };
    });

    const totalStudents = mergedSubs.length;
    const turnedInCount = mergedSubs.filter((s: any) => s.state === 'TURNED_IN').length;
    const ungradedTurnedInCount = mergedSubs.filter(
      (s: any) => s.state === 'TURNED_IN' && s.draftGrade === undefined && s.assignedGrade === undefined
    ).length;
    const draftGradedCount = mergedSubs.filter(
      (s: any) => s.draftGrade !== undefined && s.state !== 'RETURNED'
    ).length;
    const returnedCount = mergedSubs.filter((s: any) => s.state === 'RETURNED').length;
    const missingCount = mergedSubs.filter(
      (s: any) => s.state === 'CREATED' && (!s.attachments || s.attachments.length === 0)
    ).length;

    const focusedSub = contextId ? mergedSubs.find((s: any) => s.studentId === contextId) : null;
    const focusedStudentSummary = contextId
      ? focusedSub
        ? `"${focusedSub.studentName}" (studentId: "${focusedSub.studentId}", state: ${focusedSub.state}${
            focusedSub.assignedGrade !== undefined
              ? `, assignedGrade: ${focusedSub.assignedGrade}`
              : focusedSub.draftGrade !== undefined
                ? `, draftGrade: ${focusedSub.draftGrade}`
                : ', ungraded'
          }, attachments: ${focusedSub.attachments?.length || 0})`
        : `"${contextId}"`
      : 'None selected';

    const checkedIds: string[] = Array.isArray(workspaceContext?.checkedStudentIds)
      ? workspaceContext.checkedStudentIds
      : [];
    const checkedStudentsSummary =
      checkedIds.length > 0
        ? checkedIds
            .map((id) => {
              const sub = mergedSubs.find((s: any) => s.studentId === id);
              return sub ? `"${sub.studentName}" (studentId: "${sub.studentId}")` : `"${id}"`;
            })
            .join(', ')
        : 'None checked';

    const openTabsList = Array.isArray(workspaceContext?.openTabs) ? workspaceContext.openTabs : [];
    const openTabsSummary =
      openTabsList.length > 0
        ? openTabsList
            .map(
              (t: any) =>
                `"${t.courseName} — ${t.assignmentTitle}" (${t.assignmentId}${t.isActive ? ', ACTIVE TAB' : ''})`
            )
            .join('; ')
        : `"${workspaceData.assignment.courseName} — ${workspaceData.assignment.title}" (${projectId}, ACTIVE TAB)`;

    const teacherName = req.user.name || (req.user.email ? req.user.email.split('@')[0] : 'Teacher');
    const teacherEmail = req.user.email || 'Unknown email';
    const showRubricPaneStatus = workspaceContext?.showRubricPane === false ? 'Hidden' : 'Visible';
    const showToolCallsStatus = workspaceContext?.showToolCalls === true ? 'Visible' : 'Hidden';
    const activeRubric = sidecarData?.rubric || workspaceData.assignment.rubric || null;
    const rubricTotalPoints = computeRubricTotalPoints(activeRubric);
    const effectiveMaxPoints =
      rubricTotalPoints > 0
        ? rubricTotalPoints
        : typeof sidecarData?.maxPoints === 'number' && sidecarData.maxPoints > 0
          ? sidecarData.maxPoints
          : workspaceData.assignment.maxPoints || 100;

    // 2. Fetch recent chat history from Firestore Sidecar
    const msgsSnap = await assignmentRef
      .collection('messages')
      .orderBy('timestamp', 'asc')
      .limitToLast(12)
      .get();

    const previousMessages = msgsSnap.docs.map((d) => d.data());

    const hasActiveRubric = Array.isArray(activeRubric?.criteria) && activeRubric.criteria.length > 0;
    const lastAgentMsg = [...previousMessages].reverse().find((m: any) => m.sender === 'agent');
    const lastAgentAskedForRubric =
      !hasActiveRubric &&
      Boolean(lastAgentMsg?.content && /\brubric\b/i.test(String(lastAgentMsg.content)));

    const explicitWithoutRubricInMessage =
      /\b(without\s+(a\s+|an\s+|the\s+)?rubric|no\s+rubric|skip\s+(the\s+)?rubric|don'?t\s+(need|want|use|generate|create)\s+(a\s+|an\s+|the\s+)?rubric|grade\s+anyway|mark\s+anyway|evaluate\s+anyway)\b/i.test(
        message
      );
    const negativeReplyToRubricPrompt =
      lastAgentAskedForRubric &&
      /^\s*(no|nope|nah|not\s+now|no\s+thanks|no\s*,?\s*thank\s+you|no\s*,?\s*just\s+(grade|mark|evaluate|score)|just\s+(grade|mark|evaluate|score)|skip(\s+it)?|proceed\s+without|continue\s+without)\b/i.test(
        message.trim()
      );

    let rubricOptOut = Boolean(sidecarData?.rubricOptOut);
    if (!hasActiveRubric && !rubricOptOut && (explicitWithoutRubricInMessage || negativeReplyToRubricPrompt)) {
      rubricOptOut = true;
      await assignmentRef.set(
        {
          rubricOptOut: true,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    const affirmativeReplyToRubricPrompt =
      lastAgentAskedForRubric &&
      /^\s*(yes|yep|yeah|sure|ok|okay|please|yes\s*,?\s*please|go\s+ahead|do\s+it|generate(\s+it|\s+one|\s+the\s+rubric|\s+a\s+rubric)?|create(\s+it|\s+one|\s+the\s+rubric|\s+a\s+rubric)?)\b/i.test(
        message.trim()
      );
    const explicitRubricGenerationInMessage =
      /\b(generate|create|build|make|set\s+up|set_assignment_rubric|draft)\s+(a\s+|an\s+|the\s+|new\s+|2-criterion\s+|3-criterion\s+|4-criterion\s+)?(grading\s+|marking\s+|evaluation\s+)?rubric\b/i.test(
        message
      ) || /\bset_assignment_rubric\b/i.test(message);
    const isRubricGenerationRequest = affirmativeReplyToRubricPrompt || explicitRubricGenerationInMessage;

    const isExplicitDoNotGrade = /\b(do\s+not\s+grade|don'?t\s+grade|without\s+grading)\b/i.test(message);
    const hasGradingKeywords =
      /\b(grade|grading|mark|marking|evaluate|evaluating|evaluate_and_grade_submission|score|scoring|assess|assessing|provide\s+feedback|give\s+feedback)\b/i.test(
        message
      );
    const isGradingRequest = !isExplicitDoNotGrade && !isRubricGenerationRequest && hasGradingKeywords;

    const blockSubmissionReadForMissingRubric =
      useRubricDuringFeedback && !hasActiveRubric && !rubricOptOut && isGradingRequest;

    const rubricContextStatus = !useRubricDuringFeedback
      ? 'Disabled by teacher preference (evaluate holistically against assignment description)'
      : hasActiveRubric
        ? JSON.stringify(activeRubric.criteria)
        : rubricOptOut
          ? 'None (Teacher explicitly opted to grade without a rubric for this assignment — evaluate holistically against the assignment description and pass rubricScores: [])'
          : 'NO RUBRIC EXISTS YET (Missing Rubric Rule Active — see Operational Guideline 1)';

    // 3. Construct System Instruction with Teacher, Workspace, and Live Assignment Digest
    const systemInstruction = `You are Classroom Agent, an expert AI grading co-pilot and technical support assistant for Google Classroom.

Teacher & Account Context:
- Teacher Name: "${teacherName}"
- Teacher Email: "${teacherEmail}"
- Remaining AI Credits: ${currentCredits} (1 credit is deducted only when reading a student's submission via "get_student_submission_content"; general chat, rubric generation, and support questions cost 0 credits)

Workspace & UI Context:
- Open Assignment Tabs: ${openTabsSummary}
- Currently Focused Student in Preview Canvas: ${focusedStudentSummary}
- Checked Students in Roster (for batch actions): ${checkedStudentsSummary}
- Workspace Display State: Rubric Breakdown Pane is ${showRubricPaneStatus}, Tool Call Telemetry Badges are ${showToolCallsStatus}

Assignment Context (Live from Google Classroom):
- Course: "${workspaceData.assignment.courseName}" (Course ID: "${courseId}")
- Assignment Title: "${workspaceData.assignment.title}" (Assignment ID: "${projectId}")
- Max Points: ${effectiveMaxPoints}${rubricTotalPoints > 0 ? ` (set by active rubric total of ${rubricTotalPoints} points)` : ''}
- Description: "${workspaceData.assignment.description || 'No description provided'}"
- Live Submission Counts: Total Enrolled: ${totalStudents} | Turned In: ${turnedInCount} (Ungraded Turn-ins: ${ungradedTurnedInCount}) | Draft Graded: ${draftGradedCount} | Returned: ${returnedCount} | Missing: ${missingCount}
- Current Rubric Criteria: ${rubricContextStatus}

Teacher Feedback Preferences (Strictly Enforce):
- Tone: ${TONE_INSTRUCTIONS[tone]}
- Level of Detail: ${DETAIL_LEVEL_INSTRUCTIONS[detailLevel]}
- Use Rubric During Feedback: ${
      useRubricDuringFeedback
        ? hasActiveRubric
          ? `ON — Evaluate the submission against each rubric criterion, populate rubricScores in evaluate_and_grade_submission, and reference the rubric criteria in your feedback. IMPORTANT: When a rubric is present, the assignment's Max Points is the sum of the rubric criteria maxPoints (${effectiveMaxPoints}), and both your written Total Score and draftGrade MUST equal the exact sum of the awarded rubric criterion scores out of ${effectiveMaxPoints} — NEVER scale or convert the score to 100.`
          : rubricOptOut
            ? 'ON (Teacher opted to grade this assignment without a rubric) — Evaluate the submission holistically against the assignment description, pass rubricScores: [] in evaluate_and_grade_submission, and do NOT ask again about generating a rubric.'
            : 'ON (No rubric exists yet) — If asked to grade, mark, score, or evaluate submissions, you MUST ask the teacher if they want to generate a grading rubric first before reading or grading any submission.'
        : 'OFF — Evaluate the submission holistically against the assignment description without referencing or breaking down rubric criteria in your written feedback.'
    }
- Provide Next Steps: ${
      provideNextSteps
        ? 'ON — Always include a clear "Next Steps" section with actionable recommendations for how the student can improve or extend their learning.'
        : 'OFF — Do NOT include a "Next Steps" section or future improvement tasks; focus strictly on evaluating the submitted work as-is.'
    }
- Show Scores in Written Feedback: ${
      showScores
        ? `ON — Include the numerical score/grade out of ${effectiveMaxPoints} and point breakdown in your written feedback and chat summary.`
        : 'OFF — Do NOT mention or display any numerical scores, point values, or fractions (e.g. 85/100) anywhere in your written overallFeedback, criterion comments, or chat response to the teacher.'
    }${
      customAgentInstructions
        ? `\n- Custom Agent Instructions: ${customAgentInstructions}`
        : ''
    }

Operational Guidelines:
1. When asked to mark, evaluate, provide feedback, or grade submissions:
   - MISSING RUBRIC RULE: When "Use Rubric During Feedback" is ON, NO rubric exists yet, and the teacher has NOT opted out of using a rubric:
     * Do NOT call "get_student_submission_content" or "evaluate_and_grade_submission" yet (so 0 AI credits are spent).
     * Instead, ask the teacher in plain conversational text if they would like you to generate a grading rubric first before grading.
     * If the teacher replies "Yes" (to generate a rubric first), call "set_assignment_rubric" to generate and save the rubric based on the assignment instructions, and then PAUSE (do not call "get_student_submission_content" or "evaluate_and_grade_submission" in the same turn) so the teacher can review or edit the rubric criteria in the workspace before grading begins.
     * If the teacher replies "No" (or has opted to grade without a rubric), immediately proceed to read ("get_student_submission_content") and grade ("evaluate_and_grade_submission" with rubricScores: []) the requested submission(s) holistically without asking again.
   - Note: If the teacher only asks to read or summarize a student's submission without grading/evaluating it, you may call "get_student_submission_content" directly without a rubric.
   - When grading (with an active rubric, or after opting out of a rubric, or when Use Rubric During Feedback is OFF):
     * Call "get_student_submission_content" to thoroughly read the student's work.
     * Call "evaluate_and_grade_submission" to stage the evaluation for teacher review and approval in the chat panel (for batch grading, call it once per student).
     * When a rubric is active, calculate each student's total score and draftGrade by summing the points awarded across the rubric criteria out of ${effectiveMaxPoints} (never scale to 100).
     * "evaluate_and_grade_submission" supports proposing a score only (pass draftGrade, omit overallFeedback), a feedback document only (pass overallFeedback, omit draftGrade), or both (pass both draftGrade and overallFeedback), depending on what the teacher requested.
     * Always provide actionable justification and constructive summary directly in your chat response for the teacher to review, strictly adhering to the Teacher Feedback Preferences above. The student submission comments thread in Zone C is reserved strictly for genuine 2-way teacher/student dialogue.
2. When asked to create or update a rubric for the current assignment, use "set_assignment_rubric". After generating a rubric, pause and let the teacher review or edit the criteria before grading begins.
3. When asked to return grades to students directly, use "return_student_submissions".
4. When asked to create a new assignment in Google Classroom, use "create_classroom_assignment" (defaults to the current course "${courseId}" unless the teacher specifies another class, in which case call "list_teacher_courses" first to resolve the target courseId).
5. When the teacher asks for technical support, product help, or "how do I do XYZ?" (e.g., how to use UI buttons, tabs, settings, grading modes, preview/approve workflow, rubrics, AI credits/top-ups, or troubleshooting), call "get_user_guide" to retrieve the complete Classroom Agent User Guide and provide clear, step-by-step instructions tailored to their current workspace state.`;

    // 4. Initialize Gemini client
    const ai = new GoogleGenAI({ apiKey: serverEnv.GEMINI_API_KEY });

    // 5. Build contents array
    const contents: any[] = [];

    // Append history
    for (const prev of previousMessages) {
      if (prev.sender === 'user') {
        const parts: any[] = [{ text: prev.content }];
        if (prev.fileAttachment?.uri) {
          parts.push({
            fileData: {
              fileUri: prev.fileAttachment.uri,
              mimeType: prev.fileAttachment.mimeType || 'application/pdf',
            },
          });
        }
        contents.push({ role: 'user', parts });
      } else if (prev.sender === 'agent' && prev.content) {
        contents.push({ role: 'model', parts: [{ text: prev.content }] });
      }
    }

    // Current turn user parts
    const currentParts: any[] = [{ text: message }];
    if (fileUri) {
      currentParts.push({
        fileData: {
          fileUri,
          mimeType: fileMimeType || 'application/pdf',
        },
      });
    }
    contents.push({ role: 'user', parts: currentParts });

    const toolExecutionContext: ToolExecutionContext = {
      assignmentId: projectId,
      googleAccessToken: req.googleAccessToken,
      teacherUserId: req.user?.uid || 'teacher',
      useRubricDuringFeedback,
      rubricOptOut,
      blockSubmissionReadForMissingRubric,
      rubricCreatedInThisTurn: false,
    };

    let isTurnFinished = false;
    const MAX_TURNS = 20;
    let turnCount = 0;
    const executedToolCalls: any[] = [];
    let accumulatedAgentText = '';

    while (!isTurnFinished && turnCount < MAX_TURNS) {
      turnCount++;

      const response = await ai.models.generateContent({
        model: serverEnv.GEMINI_MODEL,
        contents,
        config: {
          tools: [{ functionDeclarations: gradingToolDeclarations as any }],
          temperature: 0.2,
          systemInstruction,
        },
      });

      const candidate = response.candidates?.[0];
      if (!candidate || !candidate.content) {
        throw new Error('Gemini returned an empty candidate response.');
      }

      // CRITICAL: Preserve thought_signature and model turn verbatim
      contents.push(candidate.content);

      const parts = candidate.content.parts || [];
      const functionCalls = parts.filter((p: any) => !!p.functionCall).map((p: any) => p.functionCall!);

      if (functionCalls.length > 0) {
        const responseParts: any[] = [];

        for (const call of functionCalls) {
          const toolId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const toolName = call.name;
          const toolArgs = (call.args || {}) as Record<string, any>;

          logger.info(`Agent invoking tool: ${toolName}`, (req as any).executionId, { toolName, toolArgs });

          let resultOutput: any;
          let success = true;
          let errorMessage: string | undefined;

          try {
            resultOutput = await executeGradingTool(toolName, toolArgs, toolExecutionContext);
          } catch (err: any) {
            success = false;
            errorMessage = err.message || 'Execution failed';
            resultOutput = { error: errorMessage };
          }

          const isGuardrailInterception =
            resultOutput?.status === 'RUBRIC_REQUIRED_CONFIRMATION' ||
            resultOutput?.status === 'PAUSE_FOR_RUBRIC_REVIEW';

          if (!isGuardrailInterception) {
            sendEvent('tool_call_start', { id: toolId, name: toolName, args: toolArgs });
            sendEvent('tool_call_result', {
              id: toolId,
              name: toolName,
              success,
              result: resultOutput,
              error: errorMessage,
            });
            executedToolCalls.push({
              id: toolId,
              name: toolName,
              args: toolArgs,
              status: success ? 'success' : 'error',
              result: resultOutput,
              error: errorMessage || null,
            });
          }

          logger.info(
            `Tool ${toolName} finished (${isGuardrailInterception ? resultOutput.status : success ? 'SUCCESS' : 'ERROR'})`,
            (req as any).executionId,
            { toolName, success, status: resultOutput?.status, error: errorMessage }
          );

          responseParts.push({
            functionResponse: {
              ...(call.id ? { id: call.id } : {}),
              name: toolName,
              response: resultOutput,
            },
          });
        }

        // Supply tool responses back to conversation using 'user' role required by Gemini API
        contents.push({ role: 'user', parts: responseParts });
      } else {
        // No function calls: extract final text and stream tokens
        isTurnFinished = true;
        const textParts = parts.filter((p: any) => !!p.text).map((p: any) => p.text!) || [];
        accumulatedAgentText = textParts.join('');

        const CHUNK_SIZE = 24;
        for (let i = 0; i < accumulatedAgentText.length; i += CHUNK_SIZE) {
          const token = accumulatedAgentText.slice(i, i + CHUNK_SIZE);
          sendEvent('agent_text', { token });
        }
      }
    }

    // 6. Persist completed turns in Firestore Sidecar
    const messagesColl = assignmentRef.collection('messages');
    const timestamp = new Date().toISOString();

    // User message
    await messagesColl.add({
      sender: 'user',
      content: message,
      fileAttachment: fileUri ? { uri: fileUri, mimeType: fileMimeType, filename: 'rubric-attachment' } : null,
      timestamp,
    });

    // Agent message
    await messagesColl.add({
      sender: 'agent',
      content: accumulatedAgentText,
      toolCalls: executedToolCalls,
      timestamp: new Date().toISOString(),
    });

    sendEvent('done', {});
    res.end();
  } catch (err: any) {
    logger.error(`Chat loop error: ${err.message}`, (req as any).executionId, { error: err.message, stack: err.stack });
    sendEvent('error', { message: err.message || 'Internal agent error occurred.' });
    res.end();
  }
});
