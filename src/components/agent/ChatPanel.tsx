import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Loader2, AlertCircle, Paperclip, FileText, X } from 'lucide-react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { ToolCallBadge } from './ToolCallBadge';
import { MarkdownRenderer } from './MarkdownRenderer';
import { sendChatMessage } from './api';
import { PersistedChatMessage, ToolCallItem } from '../../types/classroom';
import { useAuth } from '../../context/AuthContext';
import { env } from '../../config/env';

interface ChatPanelProps {
  assignmentId: string;
  selectedStudentId?: string | null;
  title?: string;
  promptStarters?: string[];
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  assignmentId,
  selectedStudentId,
  title = 'Grading Agent Co-Pilot',
  promptStarters = [
    'Generate a grading rubric based on the assignment instructions',
    'Evaluate and grade the currently selected student\'s submission',
    'Mark all turned-in ungraded submissions using the rubric',
    'Summarize class performance and common mistakes across all graded submissions',
  ],
}) => {
  const { getAuthHeaders } = useAuth();
  const [persistedMessages, setPersistedMessages] = useState<PersistedChatMessage[]>([]);
  const [messages, setMessages] = useState<PersistedChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusTicker, setStatusTicker] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [stagedFile, setStagedFile] = useState<{ file: File; uri?: string; uploading: boolean } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Subscribe to Firestore messages collection when idle
  useEffect(() => {
    if (!assignmentId) return;
    const msgsRef = collection(db, 'assignments', assignmentId, 'messages');
    const q = query(msgsRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as PersistedChatMessage));
        setPersistedMessages(docs);
      },
      (err) => {
        console.error('Error listening to chat messages:', err);
      }
    );

    return () => unsubscribe();
  }, [assignmentId]);

  // 2. Reconcile with persisted storage only when idle
  useEffect(() => {
    if (!isStreaming) {
      setMessages(persistedMessages);
    }
  }, [persistedMessages, isStreaming]);

  // 3. Keep scrolled to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, statusTicker, isStreaming]);

  const handleFileUpload = async (file: File): Promise<{ uri: string }> => {
    const headers = await getAuthHeaders();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('assignmentId', assignmentId);

    const res = await fetch(`${env.API_BASE_URL}/upload`, {
      method: 'POST',
      headers: {
        Authorization: headers.Authorization,
        'X-Google-Access-Token': headers['X-Google-Access-Token'],
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Upload failed: ${err}`);
    }

    const data = await res.json();
    return { uri: data.uri };
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStagedFile({ file, uploading: true });
    try {
      const res = await handleFileUpload(file);
      setStagedFile({ file, uri: res.uri, uploading: false });
    } catch (err: any) {
      setErrorText(err.message || 'File upload failed');
      setStagedFile(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = inputText.trim();
    if (!prompt || isStreaming) return;
    if (stagedFile?.uploading) {
      setErrorText('Please wait for file upload to finish.');
      return;
    }

    const filePayload = stagedFile?.uri
      ? {
          uri: stagedFile.uri,
          filename: stagedFile.file.name,
          mimeType: stagedFile.file.type || 'application/octet-stream',
        }
      : undefined;

    setStagedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setInputText('');
    setErrorText(null);
    setIsStreaming(true);
    setStatusTicker('Thinking...');

    const userTurn: PersistedChatMessage = {
      id: `local-user-${Date.now()}`,
      sender: 'user',
      content: prompt,
      fileAttachment: filePayload,
      timestamp: new Date().toISOString(),
    };

    const agentTurn: PersistedChatMessage = {
      id: `local-agent-${Date.now()}`,
      sender: 'agent',
      content: '',
      toolCalls: [],
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userTurn, agentTurn]);

    try {
      const authHeaders = await getAuthHeaders();

      await sendChatMessage({
        apiBaseUrl: env.API_BASE_URL,
        projectId: assignmentId,
        message: prompt,
        contextId: selectedStudentId || undefined,
        fileAttachment: filePayload,
        authHeaders,
        callbacks: {
          onToolCallStart: (tool) => {
            setStatusTicker(`Executing tool: ${tool.name}...`);
            setMessages((prev) => {
              const last = { ...prev[prev.length - 1] };
              last.toolCalls = [
                ...(last.toolCalls || []),
                { id: tool.id, name: tool.name, args: tool.args, status: 'executing' as const },
              ];
              return [...prev.slice(0, -1), last];
            });
          },
          onToolCallResult: (res) => {
            setStatusTicker(`Tool ${res.name} completed`);
            setMessages((prev) => {
              const last = { ...prev[prev.length - 1] };
              last.toolCalls = (last.toolCalls || []).map((t: ToolCallItem) =>
                t.id === res.id || t.name === res.name
                  ? {
                      ...t,
                      status: (res.success ? 'success' : 'error') as 'success' | 'error',
                      result: res.result,
                      error: res.error,
                    }
                  : t
              );
              return [...prev.slice(0, -1), last];
            });
          },
          onTextChunk: (chunk) => {
            setStatusTicker(null);
            setMessages((prev) => {
              const last = { ...prev[prev.length - 1] };
              last.content = (last.content || '') + chunk;
              return [...prev.slice(0, -1), last];
            });
          },
          onDone: () => {
            setIsStreaming(false);
            setStatusTicker(null);
          },
          onError: (err) => {
            setIsStreaming(false);
            setStatusTicker(null);
            setErrorText(err.message);
          },
        },
      });
    } catch (err: any) {
      setIsStreaming(false);
      setStatusTicker(null);
      setErrorText(err.message || 'Connection failed');
    }
  };

  return (
    <div
      data-testid="chat-window"
      className="w-full h-full flex flex-col bg-[#161b22] select-none border-l border-[#30363d]"
    >
      {/* Pane Header */}
      <div className="h-10 border-b border-[#30363d] px-4 flex items-center justify-between bg-[#161b22] shrink-0">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-semibold text-gray-300 tracking-wide uppercase">
            {title}
          </span>
        </div>
      </div>

      {/* Message List */}
      <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-4 font-sans select-text">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-500 space-y-3">
            <Bot className="w-10 h-10 text-gray-600 mb-1" />
            <p className="text-sm font-medium text-gray-400">{title} Ready</p>
            <p className="text-xs text-gray-500 max-w-xs">
              Command the agent to grade submissions, configure rubrics, or inspect student work:
            </p>
            <div className="space-y-1.5 text-xs text-blue-400 text-left w-full mt-2">
              {promptStarters.map((starter, idx) => (
                <button
                  key={idx}
                  onClick={() => setInputText(starter)}
                  className="w-full text-left p-2 rounded bg-[#0d1117] hover:bg-[#21262d] border border-[#30363d] transition-colors"
                >
                  &quot;{starter}&quot;
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center space-x-1.5 text-[11px] text-gray-400 mb-1 px-1">
                {msg.sender === 'user' ? (
                  <>
                    <span className="font-semibold text-blue-300">Teacher</span>
                    <User className="w-3 h-3 text-blue-400" />
                  </>
                ) : (
                  <>
                    <Bot className="w-3 h-3 text-purple-400" />
                    <span className="font-semibold text-purple-300">Agent</span>
                  </>
                )}
              </div>

              <div
                className={`max-w-[90%] rounded-lg px-3.5 py-2.5 text-xs leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-[#1c1836] text-gray-100 border border-purple-500/30 shadow-sm w-full'
                }`}
              >
                {/* File Attachment Pill */}
                {msg.fileAttachment && (
                  <div className="mb-2 flex items-center space-x-1.5 bg-black/20 px-2 py-1 rounded text-[11px] border border-white/10">
                    <FileText className="w-3.5 h-3.5 text-blue-300 shrink-0" />
                    <span className="truncate">{msg.fileAttachment.filename}</span>
                  </div>
                )}

                {/* Collapsible Tool Call Badges */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {msg.toolCalls.map((tool, idx) => (
                      <ToolCallBadge key={tool.id || idx} tool={tool} />
                    ))}
                  </div>
                )}

                {/* Message Content */}
                {msg.sender === 'agent' ? (
                  <MarkdownRenderer content={msg.content} />
                ) : (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Floating Status Ticker */}
      {statusTicker && (
        <div className="px-4 py-1.5 bg-[#1f1b38] border-t border-purple-900/40 flex items-center space-x-2 text-[11px] text-purple-300 animate-pulse shrink-0">
          <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
          <span>{statusTicker}</span>
        </div>
      )}

      {/* Error Banner */}
      {errorText && (
        <div className="px-4 py-1.5 bg-red-950/60 border-t border-red-800/50 flex items-center space-x-2 text-[11px] text-red-300 shrink-0">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{errorText}</span>
          <button onClick={() => setErrorText(null)} className="ml-auto text-red-400 hover:text-white">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Staged File Upload Pill */}
      {stagedFile && (
        <div className="px-3 py-1 bg-[#1c2128] border-t border-[#30363d] flex items-center justify-between text-xs text-gray-300 shrink-0">
          <div className="flex items-center space-x-2 truncate">
            {stagedFile.uploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 shrink-0" />
            ) : (
              <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            )}
            <span className="truncate">{stagedFile.file.name}</span>
          </div>
          <button
            onClick={() => setStagedFile(null)}
            className="text-gray-400 hover:text-white p-0.5"
            disabled={stagedFile.uploading}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Input Bar */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-[#30363d] bg-[#161b22] flex items-center space-x-2 shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          accept=".pdf,.txt,.md,.json,.csv,.doc,.docx"
        />
        <button
          type="button"
          data-testid="chat-attach-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isStreaming}
          className="p-2 rounded text-gray-400 hover:text-gray-200 hover:bg-[#21262d] transition-colors disabled:opacity-50"
          title="Attach rubric or mark scheme document"
        >
          <Paperclip className="w-4 h-4" />
        </button>

        <input
          type="text"
          data-testid="chat-input"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Command the agent..."
          disabled={isStreaming}
          className="flex-1 bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-purple-500 placeholder-gray-500 disabled:opacity-50"
        />

        <button
          type="submit"
          data-testid="chat-send-button"
          disabled={isStreaming || !inputText.trim()}
          className="p-2 rounded bg-purple-600 hover:bg-purple-500 text-white transition-colors disabled:opacity-40 disabled:hover:bg-purple-600"
        >
          {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
};
