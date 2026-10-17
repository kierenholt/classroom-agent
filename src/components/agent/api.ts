export interface ChatStreamCallbacks {
  onToolCallStart?: (tool: { id: string; name: string; args: Record<string, unknown> }) => void;
  onToolCallResult?: (result: { id: string; name: string; success: boolean; result?: unknown; error?: string }) => void;
  onTextChunk?: (chunk: string) => void;
  onDone?: () => void;
  onError?: (err: Error) => void;
}

export interface ChatRequestOptions {
  apiBaseUrl: string;
  projectId: string; // assignmentId
  message: string;
  contextId?: string; // currently selected studentId
  fileAttachment?: { uri: string; mimeType?: string; filename?: string };
  authHeaders: {
    Authorization: string;
    'X-Google-Access-Token': string;
  };
  callbacks: ChatStreamCallbacks;
}

export async function sendChatMessage(options: ChatRequestOptions): Promise<void> {
  const { apiBaseUrl, projectId, message, contextId, fileAttachment, authHeaders, callbacks } = options;

  if (!authHeaders?.Authorization || !authHeaders?.['X-Google-Access-Token']) {
    throw new Error('[Auth Failure] Cannot send chat message without valid Authorization and Google Access tokens.');
  }

  const response = await fetch(`${apiBaseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify({
      projectId,
      message,
      contextId,
      fileUri: fileAttachment?.uri,
      fileMimeType: fileAttachment?.mimeType,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errText}`);
  }

  if (!response.body) {
    throw new Error('ReadableStream not supported on response.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() || ''; // Preserve incomplete trailing chunk

    for (const block of blocks) {
      if (!block.trim()) continue;

      let eventType = 'message';
      let dataStr = '';

      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          dataStr = line.slice(6).trim();
        }
      }

      if (!dataStr) continue;

      try {
        const payload = JSON.parse(dataStr);
        switch (eventType) {
          case 'tool_call_start':
            callbacks.onToolCallStart?.(payload);
            break;
          case 'tool_call_result':
            callbacks.onToolCallResult?.(payload);
            break;
          case 'agent_text':
            if (payload.token) callbacks.onTextChunk?.(payload.token);
            break;
          case 'done':
            callbacks.onDone?.();
            break;
          case 'error':
            callbacks.onError?.(new Error(payload.message || 'Stream error'));
            break;
        }
      } catch {
        console.warn('Failed to parse SSE JSON block:', dataStr);
      }
    }
  }
}
