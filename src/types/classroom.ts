export interface RubricCriterion {
  id: string;
  title: string;
  description: string;
  maxPoints: number;
}

export interface AssignmentRubric {
  id: string;
  title: string;
  criteria: RubricCriterion[];
  updatedAt: string;
}

export interface SubmissionStats {
  total: number;
  turnedIn: number;
  draftGraded: number;
  returned: number;
  missing: number;
}

export interface AssignmentDoc {
  id: string;
  courseId: string;
  courseName: string;
  courseWorkId: string;
  title: string;
  description?: string;
  maxPoints: number;
  dueDate?: string;
  state: 'PUBLISHED' | 'DRAFT';
  apiWriteBackEligible: boolean;
  alternateLink?: string;
  rubric?: AssignmentRubric;
  submissionStats: SubmissionStats;
  createdAt: string;
  updatedAt: string;
}

export type AttachmentType = 
  | 'GOOGLE_DOC' 
  | 'GOOGLE_SLIDES' 
  | 'GOOGLE_SHEETS' 
  | 'PDF' 
  | 'IMAGE' 
  | 'CODE' 
  | 'TEXT' 
  | 'SHORT_ANSWER' 
  | 'LINK';

export interface SubmissionAttachment {
  id: string;
  title: string;
  type: AttachmentType;
  driveFileId?: string;
  thumbnailUrl?: string;
  alternateLink?: string;
  contentPreview?: string;
  shortAnswer?: string;
  mimeType?: string;
}

export interface CriterionEvaluation {
  criterionId: string;
  score: number;
  comment: string;
}

export interface SubmissionComment {
  id: string;
  author: 'Teacher' | 'Agent' | 'Student';
  content: string;
  createdAt: string;
  syncedToDriveOrClassroom: boolean;
}

export type SubmissionState = 'CREATED' | 'TURNED_IN' | 'RETURNED' | 'RECLAIMED_BY_STUDENT';
export type ClassroomSyncStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'DRAFT'
  | 'RETURNED'
  | 'LOCAL_ONLY_PERMISSION_DENIED'
  | 'ERROR'
  | 'UNSAVED';

export interface StudentEvaluationSidecarDoc {
  studentId: string;
  submissionId?: string;
  draftGrade?: number | null;
  assignedGrade?: number | null;
  rubricBreakdown: CriterionEvaluation[];
  overallFeedback: string;
  comments: SubmissionComment[];
  classroomSyncStatus: ClassroomSyncStatus;
  classroomSyncError?: string;
  feedbackDocId?: string;
  feedbackDocUrl?: string;
  clonedSubmissionState?: 'TURNED_IN';
  clonedShortAnswer?: string;
  approvedAt?: string;
  updatedAt: string;
}

export interface StudentSubmissionDoc {
  studentId: string;
  submissionId: string;
  studentName: string;
  studentEmail?: string;
  state: SubmissionState;
  late: boolean;
  attachments: SubmissionAttachment[];
  draftGrade?: number;
  assignedGrade?: number;
  rubricBreakdown: CriterionEvaluation[];
  overallFeedback: string;
  comments: SubmissionComment[];
  classroomSyncStatus: ClassroomSyncStatus;
  classroomSyncError?: string;
  feedbackDocId?: string;
  feedbackDocUrl?: string;
  approvedAt?: string;
  updatedAt: string;
}

export interface ToolCallItem {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'executing' | 'success' | 'error';
  result?: unknown;
  error?: string;
  durationMs?: number;
}

export interface PersistedChatMessage {
  id: string;
  sender: 'user' | 'agent';
  content: string;
  toolCalls?: ToolCallItem[];
  fileAttachment?: { uri: string; filename: string; mimeType: string };
  timestamp: string;
}

export interface ClassroomCourse {
  id: string;
  name: string;
  section?: string;
  room?: string;
  courseState: string;
}

export interface ClassroomCoursework {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  state: string;
  maxPoints?: number;
  dueDate?: { year: number; month: number; day: number };
  dueTime?: { hours: number; minutes: number };
  associatedWithDeveloper?: boolean;
}
