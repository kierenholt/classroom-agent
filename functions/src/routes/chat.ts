import { Router, Response } from 'express';
import * as admin from 'firebase-admin';
import { GoogleGenAI } from '@google/genai';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { serverEnv } from '../config/env';
import { gradingToolDeclarations, executeGradingTool, ToolExecutionContext } from '../tools/gradingTools';
import { getCourse, getCourseWork, parseAssignmentId } from '../services/classroomClient';
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
  const { projectId, message, fileUri, fileMimeType, contextId, feedbackSettings } = req.body;

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
    // 1. Fetch live assignment details from Google Classroom API + optional rubric from Firestore Sidecar
    const { courseId, courseWorkId } = parseAssignmentId(projectId);
    const [course, coursework, sidecarSnap] = await Promise.all([
      getCourse(req.googleAccessToken, courseId),
      getCourseWork(req.googleAccessToken, courseId, courseWorkId),
      assignmentRef.get(),
    ]);

    const sidecarData = sidecarSnap.exists ? sidecarSnap.data() : null;

    // 2. Fetch recent chat history from Firestore Sidecar
    const msgsSnap = await assignmentRef
      .collection('messages')
      .orderBy('timestamp', 'asc')
      .limitToLast(12)
      .get();

    const previousMessages = msgsSnap.docs.map((d) => d.data());

    // 3. Construct System Instruction
    const systemInstruction = `You are Classroom Agent, an expert AI grading co-pilot for Google Classroom.
Assignment Context (Live from Google Classroom):
- Course: "${course.name || 'Classroom Course'}" (Course ID: "${courseId}")
- Assignment Title: "${coursework.title || 'Classroom Assignment'}"
- Max Points: ${coursework.maxPoints || 100}
- Description: "${coursework.description || 'No description provided'}"
- Current Rubric Criteria: ${useRubricDuringFeedback ? JSON.stringify(sidecarData?.rubric?.criteria || []) : 'Disabled by teacher preference (evaluate holistically against assignment description)'}
${contextId ? `- Currently Focused Student: "${contextId}"` : ''}

Teacher Feedback Preferences (Strictly Enforce):
- Tone: ${TONE_INSTRUCTIONS[tone]}
- Level of Detail: ${DETAIL_LEVEL_INSTRUCTIONS[detailLevel]}
- Use Rubric During Feedback: ${
      useRubricDuringFeedback
        ? 'ON — Evaluate the submission against each rubric criterion, populate rubricScores in evaluate_and_grade_submission, and reference the rubric criteria in your feedback.'
        : 'OFF — Evaluate the submission holistically against the assignment description without referencing or breaking down rubric criteria in your written feedback.'
    }
- Provide Next Steps: ${
      provideNextSteps
        ? 'ON — Always include a clear "Next Steps" section with actionable recommendations for how the student can improve or extend their learning.'
        : 'OFF — Do NOT include a "Next Steps" section or future improvement tasks; focus strictly on evaluating the submitted work as-is.'
    }
- Show Scores in Written Feedback: ${
      showScores
        ? 'ON — Include the numerical score/grade and point breakdown in your written feedback and chat summary.'
        : 'OFF — Do NOT mention or display any numerical scores, point values, or fractions (e.g. 85/100) anywhere in your written overallFeedback, criterion comments, or chat response to the teacher.'
    }${
      customAgentInstructions
        ? `\n- Custom Agent Instructions: ${customAgentInstructions}`
        : ''
    }

Operational Guidelines:
1. When asked to mark, evaluate, provide feedback, or grade submissions:
   - Call "get_student_submission_content" to thoroughly read the student's work.
   - Call "evaluate_and_grade_submission" to stage the evaluation for teacher review and approval in the chat panel (for batch grading, call it once per student).
   - "evaluate_and_grade_submission" supports proposing a score only (pass draftGrade, omit overallFeedback), a feedback document only (pass overallFeedback, omit draftGrade), or both (pass both draftGrade and overallFeedback), depending on what the teacher requested.
   - Always provide actionable justification and constructive summary directly in your chat response for the teacher to review, strictly adhering to the Teacher Feedback Preferences above. The student submission comments thread in Zone C is reserved strictly for genuine 2-way teacher/student dialogue.
2. When asked to create or update a rubric for the current assignment, use "set_assignment_rubric".
3. When asked to return grades to students directly, use "return_student_submissions".
4. When asked to create a new assignment in Google Classroom, use "create_classroom_assignment" (defaults to the current course "${courseId}" unless the teacher specifies another class, in which case call "list_teacher_courses" first to resolve the target courseId).`;

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

          // Telemetry start event
          sendEvent('tool_call_start', { id: toolId, name: toolName, args: toolArgs });
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

          // Telemetry result event
          sendEvent('tool_call_result', {
            id: toolId,
            name: toolName,
            success,
            result: resultOutput,
            error: errorMessage,
          });
          logger.info(`Tool ${toolName} finished (${success ? 'SUCCESS' : 'ERROR'})`, (req as any).executionId, { toolName, success, error: errorMessage });

          executedToolCalls.push({
            id: toolId,
            name: toolName,
            args: toolArgs,
            status: success ? 'success' : 'error',
            result: resultOutput,
            error: errorMessage || null,
          });

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
