import React, { useState } from 'react';
import { RefreshCw, Send, CheckCircle2, Clock, User, ExternalLink } from 'lucide-react';
import { AssignmentDoc, StudentSubmissionDoc, CriterionEvaluation } from '../../types/classroom';

interface StudentEffectiveEdit {
  totalGrade: number | '';
  rubricBreakdown: CriterionEvaluation[];
  overallFeedback: string;
  dirty: boolean;
}

interface StudentRosterZoneProps {
  assignment: AssignmentDoc;
  submissions: StudentSubmissionDoc[];
  selectedStudentId: string | null;
  checkedStudentIds: string[];
  onToggleCheckStudent: (studentId: string) => void;
  onSelectStudent: (studentId: string) => void;
  onSyncClassroom: () => Promise<void>;
  onSaveDraftStudents: (studentIds: string[]) => Promise<void>;
  onReturnStudents: (studentIds: string[]) => Promise<void>;
  onUpdateStudentScore: (studentId: string, newScore: number | '') => void;
  getStudentEffectiveEdit: (sub: StudentSubmissionDoc) => StudentEffectiveEdit;
  isSyncing: boolean;
  isSaving: boolean;
  isReturning: boolean;
}

type FilterStatus = 'ALL' | 'TURNED_IN' | 'UNMARKED' | 'DRAFT' | 'RETURNED' | 'MISSING';

const AVATAR_BG_COLORS = [
  'bg-emerald-700 text-emerald-100',
  'bg-blue-700 text-blue-100',
  'bg-purple-700 text-purple-100',
  'bg-amber-700 text-amber-100',
  'bg-rose-700 text-rose-100',
  'bg-indigo-700 text-indigo-100',
  'bg-teal-700 text-teal-100',
  'bg-cyan-700 text-cyan-100',
];

function getAvatarColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % AVATAR_BG_COLORS.length;
  return AVATAR_BG_COLORS[idx];
}

function getInitials(name: string): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const StudentAvatar: React.FC<{
  avatarUrl?: string;
  name: string;
  studentId: string;
}> = ({ avatarUrl, name, studentId }) => {
  const [imageError, setImageError] = useState(false);
  const initials = getInitials(name);
  const colorClass = getAvatarColor(studentId || name);

  if (avatarUrl && !imageError) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        data-testid={`student-avatar-${studentId}`}
        onError={() => setImageError(true)}
        className="w-5 h-5 rounded-full shrink-0 border border-gray-700 object-cover"
        referrerPolicy="no-referrer"
      />
    );
  }

  if (initials) {
    return (
      <div
        data-testid={`student-avatar-${studentId}`}
        className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[9px] font-semibold select-none border border-gray-700/60 ${colorClass}`}
        title={name}
      >
        {initials}
      </div>
    );
  }

  return (
    <div
      data-testid={`student-avatar-${studentId}`}
      className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center shrink-0 text-gray-300"
    >
      <User className="w-3 h-3" />
    </div>
  );
};

export const StudentRosterZone: React.FC<StudentRosterZoneProps> = ({
  assignment,
  submissions,
  selectedStudentId,
  checkedStudentIds,
  onToggleCheckStudent,
  onSelectStudent,
  onSyncClassroom,
  onReturnStudents,
  onUpdateStudentScore,
  getStudentEffectiveEdit,
  isSyncing,
  isReturning,
}) => {
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('ALL');

  const filteredSubmissions = submissions.filter((sub) => {
    switch (statusFilter) {
      case 'TURNED_IN':
        return sub.state === 'TURNED_IN';
      case 'UNMARKED':
        return sub.state === 'TURNED_IN' && sub.draftGrade === undefined && sub.assignedGrade === undefined;
      case 'DRAFT':
        return sub.draftGrade !== undefined && sub.state !== 'RETURNED';
      case 'RETURNED':
        return sub.state === 'RETURNED';
      case 'MISSING':
        return sub.state === 'CREATED' && sub.attachments.length === 0;
      case 'ALL':
      default:
        return true;
    }
  });

  const classroomUrl =
    assignment.alternateLink ||
    (assignment.courseId && assignment.courseWorkId
      ? `https://classroom.google.com/c/${assignment.courseId}/a/${assignment.courseWorkId}`
      : assignment.courseId
        ? `https://classroom.google.com/c/${assignment.courseId}`
        : 'https://classroom.google.com');

  return (
    <div className="w-[22%] h-full flex flex-col border-r border-[#333842] bg-[#1A1D21] text-xs select-none">
      {/* Assignment Header Summary */}
      <div className="p-3 border-b border-[#333842] bg-[#1A1D21] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#D4AF37] truncate max-w-[70%]">
            {assignment.courseName}
          </span>
          <div className="flex items-center space-x-1">
            <a
              href={classroomUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="open-classroom-link"
              title="Open in Google Classroom"
              className="p-1 rounded text-gray-400 hover:text-white hover:bg-[#22262C] transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              data-testid="sync-classroom-button"
              onClick={onSyncClassroom}
              disabled={isSyncing}
              title="Refresh from Classroom"
              className="p-1 rounded text-gray-400 hover:text-white hover:bg-[#22262C] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-[#D4AF37]' : ''}`} />
            </button>
          </div>
        </div>

        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold text-gray-100 truncate mr-2" title={assignment.title}>
            <a
              href={classroomUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline hover:text-[#F3E5AB] transition-colors"
              title={`Open "${assignment.title}" in Google Classroom`}
            >
              {assignment.title}
            </a>
          </h2>
          <span data-testid="assignment-max-points" className="text-gray-400 font-mono text-[11px] shrink-0">
            {assignment.maxPoints} pts
          </span>
        </div>
      </div>

      {/* Contextual Action Buttons: Return Selected & Return All */}
      <div data-testid="grading-header" className="p-2.5 border-b border-[#333842] bg-[#121316]/50 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            {`${checkedStudentIds.length} Selected`}
          </span>
        </div>

        <div className="flex items-center space-x-2 pt-0.5">
          <button
            data-testid="return-submission-button"
            onClick={() => onReturnStudents(checkedStudentIds)}
            disabled={isReturning || checkedStudentIds.length === 0}
            className="flex-1 flex items-center justify-center space-x-1 py-1 px-2 rounded bg-[#22262C] hover:bg-[#2D323A] text-gray-200 border border-[#333842] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Send className="w-3 h-3 text-[#D4AF37]" />
            <span>
              {isReturning
                ? 'Returning...'
                : checkedStudentIds.length > 0
                  ? `Return Selected (${checkedStudentIds.length})`
                  : 'Return Selected'}
            </span>
          </button>

          <button
            data-testid="return-all-submissions-button"
            onClick={() => {
              const unreturnedIds = submissions
                .filter((s) => s.state !== 'RETURNED')
                .map((s) => s.studentId);
              const targetIds = unreturnedIds.length > 0 ? unreturnedIds : submissions.map((s) => s.studentId);
              onReturnStudents(targetIds);
            }}
            disabled={isReturning || submissions.length === 0}
            className="flex-1 flex items-center justify-center space-x-1 py-1 px-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Send className="w-3 h-3" />
            <span>{isReturning ? 'Returning...' : 'Return All'}</span>
          </button>
        </div>
      </div>

      {/* Filter Pills */}
      <div className="p-2 border-b border-[#333842] bg-[#121316]">
        <div data-testid="student-filter-pills" className="flex flex-wrap gap-1">
          {(['ALL', 'TURNED_IN', 'UNMARKED', 'DRAFT', 'RETURNED', 'MISSING'] as FilterStatus[]).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold transition-colors ${
                statusFilter === filter
                  ? 'bg-[#D4AF37] text-[#121316] font-bold'
                  : 'bg-[#22262C] text-gray-400 hover:text-gray-200 hover:bg-[#2D323A]'
              }`}
            >
              {filter.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Student List */}
      <div data-testid="student-roster-list" className="flex-1 overflow-y-auto divide-y divide-[#333842]/50">
        {filteredSubmissions.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No students found matching current filter.
          </div>
        ) : (
          filteredSubmissions.map((sub) => {
            const isSelected = selectedStudentId === sub.studentId;
            const isChecked = checkedStudentIds.includes(sub.studentId);
            const edit = getStudentEffectiveEdit(sub);
            const hasDraft = sub.draftGrade !== undefined;
            const isReturned = sub.state === 'RETURNED';

            return (
              <div
                key={sub.studentId}
                data-testid={`student-row-${sub.studentId}`}
                onClick={() => {
                  onSelectStudent(sub.studentId);
                  onToggleCheckStudent(sub.studentId);
                }}
                className={`p-2.5 flex flex-col space-y-1.5 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-[#22262C] border-l-2 border-[#D4AF37]'
                    : 'hover:bg-[#22262C]/60'
                }`}
              >
                {/* Line 1: Checkbox + Avatar + Full Student Name */}
                <div className="flex items-center space-x-2 min-w-0">
                  <input
                    type="checkbox"
                    data-testid={`student-checkbox-${sub.studentId}`}
                    checked={isChecked}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectStudent(sub.studentId);
                    }}
                    onChange={() => onToggleCheckStudent(sub.studentId)}
                    className="w-3.5 h-3.5 rounded border-[#333842] bg-[#121316] text-[#D4AF37] focus:ring-0 cursor-pointer shrink-0"
                  />

                  <StudentAvatar
                    avatarUrl={sub.studentAvatarUrl}
                    name={sub.studentName}
                    studentId={sub.studentId}
                  />

                  <div className="font-medium text-gray-200 truncate flex items-center space-x-1 min-w-0">
                    <span className="truncate">{sub.studentName}</span>
                    {sub.late && (
                      <span className="px-1 text-[9px] bg-red-900/50 text-red-300 rounded shrink-0">
                        LATE
                      </span>
                    )}
                  </div>
                </div>

                {/* Line 2: Submission Status + Inline Editable Score Input */}
                <div className="flex items-center justify-between pl-5">
                  <div className="flex items-center space-x-1 text-[10px] text-gray-400">
                    {edit.dirty ? (
                      <span className="text-amber-400 flex items-center space-x-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        <span>Unsaved</span>
                      </span>
                    ) : isReturned ? (
                      <span className="text-emerald-400 flex items-center space-x-0.5">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        <span>Returned</span>
                      </span>
                    ) : hasDraft ? (
                      <span className="text-amber-300 flex items-center space-x-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        <span>Draft Graded</span>
                      </span>
                    ) : sub.state === 'TURNED_IN' ? (
                      <span className="text-sky-400">Turned In</span>
                    ) : (
                      <span className="text-gray-500">Missing</span>
                    )}
                  </div>

                  {/* Inline Editable Score Input & Badge */}
                  <div
                    data-testid={`student-grade-badge-${sub.studentId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 flex items-center space-x-1 font-mono text-[11px]"
                  >
                    <input
                      type="number"
                      data-testid={isSelected ? 'total-grade-input' : `student-score-input-${sub.studentId}`}
                      value={edit.totalGrade}
                      placeholder="--"
                      onChange={(e) => {
                        const val = e.target.value === '' ? '' : Number(e.target.value);
                        onUpdateStudentScore(sub.studentId, val);
                      }}
                      min={0}
                      max={assignment.maxPoints}
                      className={`w-12 bg-[#121316] border border-[#333842] rounded px-1.5 py-0.5 text-xs font-mono text-right focus:outline-none focus:border-[#D4AF37] ${
                        isReturned
                          ? 'text-emerald-400 font-bold'
                          : hasDraft || edit.dirty
                          ? 'text-[#F3E5AB] font-bold'
                          : 'text-gray-300'
                      }`}
                    />
                    <span className="hidden">
                      {isReturned && sub.assignedGrade !== undefined
                        ? `${sub.assignedGrade}`
                        : hasDraft
                        ? `${sub.draftGrade}*`
                        : '--'}
                    </span>
                    <span className="text-gray-500">/{assignment.maxPoints}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

