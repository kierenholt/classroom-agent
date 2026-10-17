import { Router, Response } from 'express';
import * as admin from 'firebase-admin';
import { GoogleGenAI } from '@google/genai';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { serverEnv } from '../config/env';
import { gradingToolDeclarations, executeGradingTool, ToolExecutionContext } from '../tools/gradingTools';

export const chatRouter = Router();

chatRouter.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { projectId, message, fileUri, fileMimeType, contextId } = req.body;

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
    // 1. Fetch assignment details for system grounding
    const assignSnap = await assignmentRef.get();
    if (!assignSnap.exists) {
      throw new Error(`Assignment ${projectId} not found in Firestore.`);
    }
    const assignmentData = assignSnap.data()!;

    // 2. Fetch recent chat history
    const msgsSnap = await assignmentRef
      .collection('messages')
      .orderBy('timestamp', 'asc')
      .limitToLast(12)
      .get();

    const previousMessages = msgsSnap.docs.map((d) => d.data());

    // 3. Construct System Instruction
    const systemInstruction = `You are Classroom Agent, an expert AI grading co-pilot for Google Classroom.
Assignment Context:
- Course: "${assignmentData.courseName || 'Unknown Course'}"
- Assignment Title: "${assignmentData.title}"
- Max Points: ${assignmentData.maxPoints}
- Description: "${assignmentData.description || 'No description provided'}"
- Current Rubric Criteria: ${JSON.stringify(assignmentData.rubric?.criteria || [])}
${contextId ? `- Currently Focused Student: "${contextId}"` : ''}

Operational Guidelines:
1. When asked to mark, evaluate, or grade submissions:
   - Call "get_student_submission_content" to thoroughly read the student's work.
   - For batch grading, call "evaluate_and_grade_submission" for each student individually so progress is clearly visible.
   - Always provide specific criterion scores, actionable justification, and constructive overall feedback.
2. When asked to create or update a rubric, use "set_assignment_rubric".
3. When asked to return grades to students, use "return_student_submissions".
4. Maintain a professional, encouraging, and pedagogically sound tone.`;

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

          executedToolCalls.push({
            id: toolId,
            name: toolName,
            args: toolArgs,
            status: success ? 'success' : 'error',
            result: resultOutput,
            error: errorMessage,
          });

          responseParts.push({
            functionResponse: {
              name: toolName,
              response: resultOutput,
            },
          });
        }

        // Supply tool responses back to conversation
        contents.push({ role: 'tool', parts: responseParts });
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

    // 6. Persist completed turns in Firestore
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
    console.error('Chat loop error:', err);
    sendEvent('error', { message: err.message || 'Internal agent error occurred.' });
    res.end();
  }
});
