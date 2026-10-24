import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Bot,
  User,
  Loader2,
  AlertCircle,
  Paperclip,
  FileText,
  X,
  Eye,
  Save,
  Clock,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Zap,
} from 'lucide-react';
import { doc, collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { ToolCallBadge } from './ToolCallBadge';
import { MarkdownRenderer } from './MarkdownRenderer';
import { FeedbackPreviewModal } from './FeedbackPreviewModal';
import { sendChatMessage } from './api';
import { PersistedChatMessage, ToolCallItem, StudentEvaluationSidecarDoc } from '../../types/classroom';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useClassroomData } from '../../context/ClassroomDataContext';
import { useCredits } from '../../context/CreditsContext';
import { env } from '../../config/env';

interface ChatPanelProps {
  assignmentId: string;
  selectedStudentId?: string | null;
  checkedStudentIds?: string[];
  openTabs?: Array<{
    assignmentId: string;
    courseName: string;
    assignmentTitle: string;
    isActive: boolean;
  }>;
  title?: string;
  promptStarters?: string[];
  onOpenAssignment?: (assignmentId: string, meta?: { courseName?: string; assignmentTitle?: string }) => void;
}

interface ExtractedEvaluationItem {
  studentId: string;
  studentName: string;
  submissionId?: string;
  score: number | null;
  maxPoints: number;
  feedback: string;
  hasScore: boolean;
  hasFeedbackDoc: boolean;
  isDrafted: boolean;
  isReturned: boolean;
  feedbackDocUrl?: string;
}

interface ExtractedCreatedAssignmentItem {
  assignmentId: string;
  courseId: string;
  courseName: string;
  courseWorkId: string;
  title: string;
  maxPoints: number;
  state: string;
  alternateLink?: string;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  assignmentId,
  selectedStudentId,
  checkedStudentIds = [],
  openTabs = [],
  title = 'Agent',
  promptStarters = [
    'Generate a grading rubric based on the assignment instructions',
    'Evaluate and grade the currently selected student\'s submission',
    'Mark all turned-in ungraded submissions using the rubric',
    'Create a new follow-up assignment in this class',
  ],
  onOpenAssignment,
}) => {
  const { getAuthHeaders } = useAuth();
  const {
    feedbackSettings,
    showRubricPane,
    showToolCalls,
    showExtractedTextToggle,
    showQuickActions,
    quickActions,
  } = useSettings();
  const enabledQuickActions = quickActions.filter((a) => a.enabled);
  const { fetchCourseworkForCourse } = useClassroomData();
  const { aiCredits, openTopUpModal } = useCredits();
  const isOutOfCredits = aiCredits !== null && aiCredits <= 0;
  const [persistedMessages, setPersistedMessages] = useState<PersistedChatMessage[]>([]);
  const [messages, setMessages] = useState<PersistedChatMessage[]>([]);
  const [evaluationsMap, setEvaluationsMap] = useState<Record<string, StudentEvaluationSidecarDoc>>({});
  const [sidecarAssignmentMaxPoints, setSidecarAssignmentMaxPoints] = useState<number | undefined>(undefined);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusTicker, setStatusTicker] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [stagedFile, setStagedFile] = useState<{ file: File; uri?: string; uploading: boolean } | null>(null);

  // Preview Modal & Approval state
  const [previewTarget, setPreviewTarget] = useState<ExtractedEvaluationItem | null>(null);
  const [approvingStudentIds, setApprovingStudentIds] = useState<Record<string, boolean>>({});

  // Minimised chat messages tracking (persisted to localStorage)
  const [minimisedMessageIds, setMinimisedMessageIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined' || !assignmentId) return new Set();
    try {
      const stored = window.localStorage.getItem(`classroom_agent_minimised_messages_${assignmentId}`);
      if (stored) {
        return new Set(JSON.parse(stored));
      }
    } catch (err) {
      console.error('Failed to load minimised messages from localStorage:', err);
    }
    return new Set();
  });

  useEffect(() => {
    if (!assignmentId) return;
    try {
      const stored = window.localStorage.getItem(`classroom_agent_minimised_messages_${assignmentId}`);
      if (stored) {
        setMinimisedMessageIds(new Set(JSON.parse(stored)));
      } else {
        setMinimisedMessageIds(new Set());
      }
    } catch (err) {
      console.error('Failed to load minimised messages from localStorage:', err);
      setMinimisedMessageIds(new Set());
    }
  }, [assignmentId]);

  const toggleMinimiseMessage = (messageId: string) => {
    setMinimisedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      try {
        window.localStorage.setItem(
          `classroom_agent_minimised_messages_${assignmentId}`,
          JSON.stringify(Array.from(next))
        );
      } catch (err) {
        console.error('Failed to save minimised messages to localStorage:', err);
      }
      return next;
    });
  };

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

  // 1a. Subscribe to Firestore assignment sidecar doc for rubric / maxPoints
  useEffect(() => {
    if (!assignmentId) return;
    const assignRef = doc(db, 'assignments', assignmentId);
    const unsubscribe = onSnapshot(
      assignRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const criteria = data?.rubric?.criteria;
          if (Array.isArray(criteria) && criteria.length > 0) {
            const rubricSum = criteria.reduce((sum: number, c: any) => sum + (Number(c.maxPoints) || 0), 0);
            if (rubricSum > 0) {
              setSidecarAssignmentMaxPoints(rubricSum);
              return;
            }
          }
          if (typeof data?.maxPoints === 'number' && data.maxPoints > 0) {
            setSidecarAssignmentMaxPoints(data.maxPoints);
            return;
          }
        }
        setSidecarAssignmentMaxPoints(undefined);
      },
      (err) => {
        console.error('Error listening to assignment sidecar doc in ChatPanel:', err);
      }
    );

    return () => unsubscribe();
  }, [assignmentId]);

  // 1b. Subscribe to Firestore evaluations sidecar so edits and approvals reflect live in chat cards
  useEffect(() => {
    if (!assignmentId) return;
    const evalsRef = collection(db, 'assignments', assignmentId, 'evaluations');
    const unsubscribe = onSnapshot(
      evalsRef,
      (snapshot) => {
        const map: Record<string, StudentEvaluationSidecarDoc> = {};
        snapshot.docs.forEach((d) => {
          map[d.id] = d.data() as StudentEvaluationSidecarDoc;
        });
        setEvaluationsMap(map);
      },
      (err) => {
        console.error('Error listening to evaluations in ChatPanel:', err);
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

  const extractEvaluationsFromMessage = (msg: PersistedChatMessage): ExtractedEvaluationItem[] => {
    if (msg.sender !== 'agent' || !msg.toolCalls || msg.toolCalls.length === 0) return [];
    const items: ExtractedEvaluationItem[] = [];
    const seenStudents = new Set<string>();

    for (const tool of msg.toolCalls) {
      if (tool.name !== 'evaluate_and_grade_submission' || tool.status !== 'success') continue;
      const res = (tool.result || {}) as Record<string, any>;
      const args = (tool.args || {}) as Record<string, any>;
      const studentId = String(res.studentId || args.studentId || '').trim();
      if (!studentId || seenStudents.has(studentId)) continue;
      seenStudents.add(studentId);

      const sidecar = evaluationsMap[studentId];
      const studentName = String(res.studentName || studentId);
      const submissionId = sidecar?.submissionId || (res.submissionId ? String(res.submissionId) : undefined);
      const maxPoints =
        sidecarAssignmentMaxPoints !== undefined
          ? sidecarAssignmentMaxPoints
          : typeof res.maxPoints === 'number'
            ? res.maxPoints
            : 100;

      let rawScore: number | null = null;
      if (sidecar && sidecar.draftGrade !== undefined) {
        rawScore = sidecar.draftGrade;
      } else if (typeof res.grade === 'number') {
        rawScore = res.grade;
      } else if (typeof args.draftGrade === 'number') {
        rawScore = args.draftGrade;
      }
      const hasScore = typeof rawScore === 'number' && !Number.isNaN(rawScore);

      let feedback = '';
      if (sidecar && typeof sidecar.overallFeedback === 'string') {
        feedback = sidecar.overallFeedback;
      } else if (typeof res.feedback === 'string') {
        feedback = res.feedback;
      } else if (typeof args.overallFeedback === 'string') {
        feedback = args.overallFeedback;
      }
      const hasFeedbackDoc = feedback.trim().length > 0;

      if (!hasScore && !hasFeedbackDoc) continue;

      const syncStatus = sidecar?.classroomSyncStatus || res.classroomSyncStatus || 'PENDING_APPROVAL';
      const isReturned = syncStatus === 'RETURNED' || syncStatus === 'APPROVED';
      const isDrafted = !isReturned && syncStatus === 'DRAFT';

      items.push({
        studentId,
        studentName,
        submissionId,
        score: hasScore ? rawScore : null,
        maxPoints,
        feedback,
        hasScore,
        hasFeedbackDoc,
        isDrafted,
        isReturned,
        feedbackDocUrl: sidecar?.feedbackDocUrl,
      });
    }

    return items;
  };

  const extractCreatedAssignmentsFromMessage = (msg: PersistedChatMessage): ExtractedCreatedAssignmentItem[] => {
    if (msg.sender !== 'agent' || !msg.toolCalls || msg.toolCalls.length === 0) return [];
    const items: ExtractedCreatedAssignmentItem[] = [];
    const seenIds = new Set<string>();

    for (const tool of msg.toolCalls) {
      if (tool.name !== 'create_classroom_assignment' || tool.status !== 'success') continue;
      const res = (tool.result || {}) as Record<string, any>;
      const args = (tool.args || {}) as Record<string, any>;
      const createdAssignmentId = String(res.assignmentId || '').trim();
      const courseWorkId = String(res.courseWorkId || '').trim();
      if (!createdAssignmentId || !courseWorkId || seenIds.has(createdAssignmentId)) continue;
      seenIds.add(createdAssignmentId);

      items.push({
        assignmentId: createdAssignmentId,
        courseId: String(res.courseId || args.courseId || ''),
        courseName: String(res.courseName || 'Classroom Course'),
        courseWorkId,
        title: String(res.title || args.title || 'New Assignment'),
        maxPoints: typeof res.maxPoints === 'number' ? res.maxPoints : Number(args.maxPoints) || 100,
        state: String(res.state || 'PUBLISHED'),
        alternateLink: res.alternateLink ? String(res.alternateLink) : undefined,
      });
    }

    return items;
  };

  const handleSubmitEvaluation = async (
    item: ExtractedEvaluationItem,
    action: 'draft' | 'return',
    overrideFeedback?: string,
    overrideScore?: number | null
  ) => {
    setApprovingStudentIds((prev) => ({ ...prev, [item.studentId]: true }));
    setErrorText(null);
    try {
      const headers = await getAuthHeaders();
      const feedbackToSend = overrideFeedback !== undefined ? overrideFeedback : item.feedback;
      const scoreToSend = overrideScore !== undefined ? overrideScore : item.score;

      const res = await fetch(
        `${env.API_BASE_URL}/classroom/assignments/${assignmentId}/submissions/${item.studentId}/approve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: JSON.stringify({
            submissionId: item.submissionId,
            studentName: item.studentName,
            draftGrade: scoreToSend,
            overallFeedback: feedbackToSend,
            action,
          }),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(
          `${action === 'draft' ? 'Draft save' : 'Return'} failed for ${item.studentName}: ${errText}`
        );
      }

      if (previewTarget?.studentId === item.studentId) {
        setPreviewTarget(null);
      }
    } catch (err: any) {
      setErrorText(
        err.message ||
          `Failed to ${action === 'draft' ? 'save draft' : 'return evaluation'} for ${item.studentName}`
      );
    } finally {
      setApprovingStudentIds((prev) => ({ ...prev, [item.studentId]: false }));
    }
  };

  const handleReturnAllInMessage = async (items: ExtractedEvaluationItem[]) => {
    for (const item of items) {
      if (!item.isReturned) {
        await handleSubmitEvaluation(item, 'return');
      }
    }
  };

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
        'X-Classroom-Access-Token': headers['X-Classroom-Access-Token'],
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

  const sendPrompt = async (promptToSend: string) => {
    const prompt = promptToSend.trim();
    if (!prompt || isStreaming) return;
    if (isOutOfCredits) {
      setErrorText('You have 0 AI credits remaining. Please top up to continue using the Grading Agent.');
      openTopUpModal();
      return;
    }
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
        feedbackSettings,
        workspaceContext: {
          openTabs,
          checkedStudentIds,
          showRubricPane,
          showToolCalls,
          showExtractedTextToggle,
          showQuickActions,
        },
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
            if (res.name === 'create_classroom_assignment' && res.success) {
              const createdCourseId = (res.result as any)?.courseId;
              if (createdCourseId) {
                fetchCourseworkForCourse(String(createdCourseId), true).catch(() => null);
              }
            }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendPrompt(inputText);
  };

  return (
    <div
      data-testid="chat-window"
      className="w-full h-full flex flex-col bg-[#1A1D21] select-none border-l border-[#333842]"
    >
      {/* Pane Header */}
      <div className="h-10 border-b border-[#333842] px-4 flex items-center justify-between bg-[#1A1D21] shrink-0">
        <div className="flex items-center space-x-2 min-w-0">
          <img
            src="/favicon-64x64.png"
            alt="Classroom Agent"
            className="w-4 h-4 rounded-sm object-contain shrink-0"
          />
          <span className="text-xs font-semibold text-gray-300 tracking-wide uppercase truncate">
            {title}
          </span>
        </div>

        <button
          type="button"
          data-testid="top-up-credits-button"
          onClick={openTopUpModal}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors shrink-0 cursor-pointer ${
            isOutOfCredits
              ? 'bg-red-950/60 hover:bg-red-900/70 text-red-200 border-red-500/40'
              : 'bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 text-[#D4AF37] border-[#D4AF37]/30'
          }`}
          title="Top Up AI Credits"
        >
          <CreditCard className="w-3 h-3 text-[#D4AF37] shrink-0" />
          <span data-testid="chat-credits-count">{aiCredits !== null ? aiCredits : '—'}</span>
          <span>Credits · Top Up</span>
        </button>
      </div>

      {/* Message List */}
      <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-4 font-sans select-text">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-500 space-y-3">
            <img
              src="/logo-192x192.png"
              alt="Classroom Agent"
              className="w-10 h-10 rounded-lg object-contain mb-1"
            />
            <p className="text-sm font-medium text-gray-400">{title} Ready</p>
            <p className="text-xs text-gray-500 max-w-xs">
              Command the agent to grade submissions, configure rubrics, or create assignments:
            </p>
            <div className="space-y-1.5 text-xs text-gray-300 text-left w-full mt-2">
              {promptStarters.map((starter, idx) => (
                <button
                  key={idx}
                  disabled={isOutOfCredits}
                  onClick={() => setInputText(starter)}
                  className="w-full text-left p-2 rounded bg-[#121316] hover:bg-[#22262C] border border-[#333842] text-gray-300 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  &quot;{starter}&quot;
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const evaluationItems = extractEvaluationsFromMessage(msg);
            const createdAssignments = extractCreatedAssignmentsFromMessage(msg);
            const unreturnedCount = evaluationItems.filter((i) => !i.isReturned).length;
            const isMinimised = msg.sender === 'agent' && minimisedMessageIds.has(msg.id);

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`flex items-center ${
                    msg.sender === 'user' ? 'justify-end' : 'justify-between'
                  } w-full max-w-[90%] text-[11px] text-gray-400 mb-1 px-1`}
                >
                  <div className="flex items-center space-x-1.5">
                    {msg.sender === 'user' ? (
                      <>
                        <span className="font-semibold text-sky-300">Teacher</span>
                        <User className="w-3 h-3 text-sky-400" />
                      </>
                    ) : (
                      <>
                        <Bot className="w-3 h-3 text-[#D4AF37]" />
                        <span className="font-semibold text-[#F3E5AB]">Agent</span>
                      </>
                    )}
                  </div>
                  {msg.sender === 'agent' && !isMinimised && (
                    <button
                      type="button"
                      data-testid={`minimise-message-button-${msg.id}`}
                      onClick={() => toggleMinimiseMessage(msg.id)}
                      className="text-gray-400 hover:text-[#F3E5AB] text-[10px] flex items-center space-x-0.5 transition-colors"
                      title="Minimise chat bubble"
                    >
                      <ChevronUp className="w-3 h-3" />
                      <span>Minimise</span>
                    </button>
                  )}
                </div>

                {isMinimised ? (
                  <div
                    data-testid={`minimised-chat-bubble-${msg.id}`}
                    className="max-w-[90%] w-full rounded-lg px-3 py-2 bg-[#22262C] text-gray-200 border border-[#333842] shadow-sm flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center space-x-2 min-w-0 truncate">
                      <Bot className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                      <span className="font-semibold text-[#F3E5AB] shrink-0">
                        {evaluationItems.length > 0 ? 'Evaluated:' : 'Agent:'}
                      </span>
                      <span className="truncate text-gray-300 font-medium">
                        {evaluationItems.length > 0
                          ? evaluationItems
                              .map(
                                (item) =>
                                  `${item.studentName}${item.hasScore ? ` (${item.score}/${item.maxPoints})` : ''}`
                              )
                              .join(', ')
                          : (msg.content?.slice(0, 60) || 'Response')}
                      </span>
                      {evaluationItems.length > 0 && unreturnedCount > 0 && (
                        <span className="text-[10px] font-medium text-amber-300/90 bg-amber-950/50 border border-amber-700/40 px-1.5 py-0.5 rounded shrink-0">
                          {unreturnedCount} Pending
                        </span>
                      )}
                      {evaluationItems.length > 0 && unreturnedCount === 0 && (
                        <span className="text-[10px] font-medium text-emerald-400 bg-emerald-950/50 border border-emerald-700/40 px-1.5 py-0.5 rounded shrink-0">
                          Returned
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      data-testid={`expand-message-button-${msg.id}`}
                      onClick={() => toggleMinimiseMessage(msg.id)}
                      className="flex items-center space-x-1 px-2 py-0.5 rounded border border-[#333842] bg-[#1A1D21] hover:bg-[#2D323A] text-gray-300 hover:text-white text-[11px] font-medium transition-colors shrink-0"
                      title="Expand chat bubble"
                    >
                      <span>Expand</span>
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div
                    data-testid={`chat-bubble-${msg.id}`}
                    className={`max-w-[90%] rounded-lg px-3.5 py-2.5 text-xs leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-[#2D323A] text-white border border-[#333842] shadow-sm'
                        : 'bg-[#22262C] text-gray-100 border border-[#333842] shadow-sm w-full'
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
                  {showToolCalls && msg.toolCalls && msg.toolCalls.length > 0 && (
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

                  {/* Created Assignment Action Cards */}
                  {createdAssignments.length > 0 && (
                    <div
                      data-testid="created-assignments-container"
                      className="mt-3 pt-2.5 border-t border-[#333842] space-y-2"
                    >
                      {createdAssignments.map((created) => (
                        <div
                          key={created.assignmentId}
                          data-testid={`created-assignment-card-${created.courseWorkId}`}
                          className="p-2.5 rounded-lg bg-[#1A1D21] border border-[#333842] flex flex-col gap-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-semibold text-gray-100 truncate" title={created.title}>
                                {created.title}
                              </div>
                              <div className="text-[11px] text-gray-400 truncate">
                                {created.courseName} • {created.maxPoints} pts
                              </div>
                            </div>
                            <span className="flex items-center space-x-1 text-[10px] font-medium text-emerald-400 bg-emerald-950/50 border border-emerald-700/40 px-1.5 py-0.5 rounded shrink-0">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{created.state}</span>
                            </span>
                          </div>

                          <div className="flex items-center justify-end space-x-2 pt-0.5">
                            {created.alternateLink && (
                              <a
                                href={created.alternateLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                data-testid={`created-assignment-classroom-link-${created.courseWorkId}`}
                                className="inline-flex items-center space-x-1 px-2 py-1 rounded border border-[#333842] bg-[#22262C] hover:bg-[#2D323A] text-gray-300 text-[11px] transition-colors"
                              >
                                <span>Classroom</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                            {onOpenAssignment && (
                              <button
                                type="button"
                                data-testid={`open-created-assignment-button-${created.courseWorkId}`}
                                onClick={() =>
                                  onOpenAssignment(created.assignmentId, {
                                    courseName: created.courseName,
                                    assignmentTitle: created.title,
                                  })
                                }
                                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-[#D4AF37] hover:bg-[#E5B869] text-[#121316] text-[11px] font-semibold transition-colors shadow-xs cursor-pointer"
                              >
                                <span>Open in Workspace Tab</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Staged Evaluation Action Cards (Preview, Draft & Return) */}
                  {evaluationItems.length > 0 && (
                    <div
                      data-testid="evaluation-actions-container"
                      className="mt-3 pt-2.5 border-t border-[#333842] space-y-2"
                    >
                      {evaluationItems.length > 1 && (
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-medium text-[#F3E5AB]">
                            {evaluationItems.length} Student Evaluations
                          </span>
                          {unreturnedCount > 0 && (
                            <button
                              type="button"
                              data-testid="return-all-evaluations-button"
                              onClick={() => handleReturnAllInMessage(evaluationItems)}
                              className="flex items-center space-x-1 px-2.5 py-1 rounded bg-[#D4AF37] hover:bg-[#E5B869] text-[#121316] text-[11px] font-semibold transition-colors shadow-xs cursor-pointer"
                            >
                              <Send className="w-3 h-3" />
                              <span>Return All ({unreturnedCount})</span>
                            </button>
                          )}
                        </div>
                      )}

                      {evaluationItems.map((item) => {
                        const isApproving = Boolean(approvingStudentIds[item.studentId]);

                        return (
                          <div
                            key={item.studentId}
                            data-testid={`evaluation-action-card-${item.studentId}`}
                            className="p-2.5 rounded-lg bg-[#1A1D21] border border-[#333842] flex flex-col gap-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center space-x-2 min-w-0">
                                <span className="font-semibold text-gray-100 truncate">
                                  {item.studentName}
                                </span>
                                {item.hasScore && (
                                  <span
                                    data-testid={`evaluation-score-badge-${item.studentId}`}
                                    className="px-1.5 py-0.5 rounded bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#F3E5AB] font-mono text-[11px] shrink-0"
                                  >
                                    {item.score}/{item.maxPoints}
                                  </span>
                                )}
                              </div>

                              {item.isReturned ? (
                                <span
                                  data-testid={`evaluation-approved-badge-${item.studentId}`}
                                  className="flex items-center space-x-1 text-[11px] font-medium text-emerald-400 shrink-0"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Returned</span>
                                </span>
                              ) : item.isDrafted ? (
                                <span
                                  data-testid={`evaluation-draft-badge-${item.studentId}`}
                                  className="flex items-center space-x-1 text-[11px] font-medium text-[#F3E5AB] shrink-0"
                                >
                                  <Clock className="w-3.5 h-3.5 text-[#D4AF37]" />
                                  <span>Draft Saved</span>
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium text-amber-300/90 bg-amber-950/50 border border-amber-700/40 px-1.5 py-0.5 rounded shrink-0">
                                  Pending Action
                                </span>
                              )}
                            </div>

                            {item.feedbackDocUrl && (
                              <a
                                href={item.feedbackDocUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                data-testid={`feedback-doc-link-${item.studentId}`}
                                className="inline-flex items-center space-x-1 text-[11px] text-blue-400 hover:text-blue-300 underline"
                              >
                                <FileText className="w-3 h-3" />
                                <span>Open Attached Feedback Google Doc</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}

                            <div className="flex items-center justify-end space-x-2 pt-0.5">
                              <button
                                type="button"
                                data-testid={`dismiss-evaluation-button-${item.studentId}`}
                                onClick={() => toggleMinimiseMessage(msg.id)}
                                disabled={isApproving}
                                className="flex items-center space-x-1 px-2.5 py-1 rounded border border-[#333842] bg-[#22262C] hover:bg-[#2D323A] text-gray-400 hover:text-gray-200 text-[11px] font-medium transition-colors disabled:opacity-50"
                                title="Dismiss and minimise message"
                              >
                                <X className="w-3 h-3" />
                                <span>Dismiss</span>
                              </button>

                              {item.hasFeedbackDoc && (
                                <button
                                  type="button"
                                  data-testid={`preview-evaluation-button-${item.studentId}`}
                                  onClick={() => setPreviewTarget(item)}
                                  disabled={isApproving}
                                  className="flex items-center space-x-1 px-2.5 py-1 rounded border border-[#333842] bg-[#22262C] hover:bg-[#2D323A] text-gray-300 hover:text-white text-[11px] font-medium transition-colors disabled:opacity-50"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Preview</span>
                                </button>
                              )}

                              <button
                                type="button"
                                data-testid={`draft-evaluation-button-${item.studentId}`}
                                onClick={() => handleSubmitEvaluation(item, 'draft')}
                                disabled={isApproving}
                                className="flex items-center space-x-1 px-2.5 py-1 rounded border border-[#D4AF37]/40 bg-[#22262C] hover:bg-[#2D323A] text-[#F3E5AB] text-[11px] font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                              >
                                {isApproving ? (
                                  <Loader2 className="w-3 h-3 animate-spin text-[#D4AF37]" />
                                ) : (
                                  <Save className="w-3 h-3 text-[#D4AF37]" />
                                )}
                                <span>Draft</span>
                              </button>

                              <button
                                type="button"
                                data-testid={`return-evaluation-button-${item.studentId}`}
                                onClick={() => handleSubmitEvaluation(item, 'return')}
                                disabled={isApproving}
                                className={`flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors disabled:opacity-50 cursor-pointer ${
                                  item.isReturned
                                    ? 'bg-emerald-900/40 hover:bg-emerald-800/50 text-emerald-300 border border-emerald-600/40'
                                    : 'bg-[#D4AF37] hover:bg-[#E5B869] text-[#121316] shadow-sm'
                                }`}
                              >
                                {isApproving ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Send className="w-3 h-3" />
                                )}
                                <span>Return</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Floating Status Ticker */}
      {statusTicker && (
        <div className="px-4 py-1.5 bg-[#121316] border-t border-[#333842] flex items-center space-x-2 text-[11px] text-[#D4AF37] animate-pulse shrink-0">
          <Loader2 className="w-3 h-3 animate-spin text-[#D4AF37]" />
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
        <div className="px-3 py-1 bg-[#121316] border-t border-[#333842] flex items-center justify-between text-xs text-gray-300 shrink-0">
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

      {/* Out of Credits Banner */}
      {isOutOfCredits && (
        <div
          data-testid="out-of-credits-banner"
          className="px-4 py-2.5 bg-red-950/70 border-t border-red-700/50 flex items-center justify-between gap-2 text-xs text-red-200 shrink-0"
        >
          <div className="flex items-center space-x-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="truncate font-medium">
              0 AI credits remaining. Top up to use the agent.
            </span>
          </div>
          <button
            type="button"
            data-testid="out-of-credits-topup-button"
            onClick={openTopUpModal}
            className="px-2.5 py-1 rounded bg-[#D4AF37] hover:bg-[#E5B869] text-[#121316] text-[11px] font-semibold shrink-0 transition-colors cursor-pointer shadow-xs"
          >
            Top Up Credits
          </button>
        </div>
      )}

      {/* Quick Action Buttons Bar */}
      {showQuickActions && enabledQuickActions.length > 0 && (
        <div
          data-testid="chat-quick-actions-bar"
          className="px-3 py-2 border-t border-[#333842] bg-[#121316] flex flex-wrap items-center gap-1.5 shrink-0 max-h-28 overflow-y-auto"
        >
          <div className="flex items-center space-x-1 text-[#D4AF37] text-[10px] uppercase font-semibold tracking-wider shrink-0 pr-0.5">
            <Zap className="w-3 h-3" />
            <span className="hidden sm:inline">Actions:</span>
          </div>
          {enabledQuickActions.map((action) => (
            <button
              key={action.id}
              type="button"
              data-testid={`quick-action-pill-${action.id}`}
              disabled={isStreaming || isOutOfCredits}
              onClick={() => sendPrompt(action.prompt)}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#22262C] hover:bg-[#2c313a] text-gray-200 hover:text-white border border-[#333842] hover:border-[#D4AF37]/50 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-xs"
              title={action.prompt}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Input Bar */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-[#333842] bg-[#1A1D21] flex items-center space-x-2 shrink-0">
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
          disabled={isStreaming || isOutOfCredits}
          className="p-2 rounded text-gray-400 hover:text-gray-200 hover:bg-[#22262C] transition-colors disabled:opacity-50"
          title="Attach rubric or mark scheme document"
        >
          <Paperclip className="w-4 h-4" />
        </button>

        <input
          type="text"
          data-testid="chat-input"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={isOutOfCredits ? 'Out of AI credits — top up to continue...' : 'Command the agent...'}
          disabled={isStreaming || isOutOfCredits}
          className="flex-1 bg-[#121316] border border-[#333842] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-[#D4AF37] placeholder-gray-500 disabled:opacity-50"
        />

        <button
          type="submit"
          data-testid="chat-send-button"
          disabled={isStreaming || isOutOfCredits || !inputText.trim()}
          className="p-2 rounded bg-[#D4AF37] hover:bg-[#E5B869] text-[#121316] font-semibold transition-colors disabled:opacity-40 disabled:hover:bg-[#D4AF37] cursor-pointer shadow-xs"
        >
          {isStreaming ? <Loader2 className="w-4 h-4 animate-spin text-[#121316]" /> : <Send className="w-4 h-4" />}
        </button>
      </form>

      {/* Feedback Document Preview & Edit Modal */}
      {previewTarget && (
        <FeedbackPreviewModal
          isOpen={true}
          studentId={previewTarget.studentId}
          studentName={previewTarget.studentName}
          initialFeedback={previewTarget.feedback}
          initialScore={previewTarget.score}
          maxPoints={previewTarget.maxPoints}
          hasScore={previewTarget.hasScore}
          isApproving={Boolean(approvingStudentIds[previewTarget.studentId])}
          onClose={() => setPreviewTarget(null)}
          onDraft={(updatedFeedback, updatedScore) =>
            handleSubmitEvaluation(previewTarget, 'draft', updatedFeedback, updatedScore)
          }
          onReturn={(updatedFeedback, updatedScore) =>
            handleSubmitEvaluation(previewTarget, 'return', updatedFeedback, updatedScore)
          }
        />
      )}
    </div>
  );
};

