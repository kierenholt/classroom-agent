import React, { useState } from 'react';
import { RefreshCw, Send, Save, CheckCircle2, Clock, User } from 'lucide-react';
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

export const StudentRosterZone: React.FC<StudentRosterZoneProps> = ({
  assignment,
  submissions,
  selectedStudentId,
  checkedStudentIds,
  onToggleCheckStudent,
  onSelectStudent,
  onSyncClassroom,
  onSaveDraftStudents,
  onReturnStudents,
  onUpdateStudentScore,
  getStudentEffectiveEdit,
  isSyncing,
  isSaving,
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

  return (
    <div className="w-[22%] h-full flex flex-col border-r border-[#30363d] bg-[#161b22] text-xs select-none">
      {/* Assignment Header Summary */}
      <div className="p-3 border-b border-[#30363d] bg-[#161b22] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-400 truncate max-w-[70%]">
            {assignment.courseName}
          </span>
          <button
            data-testid="sync-classroom-button"
            onClick={onSyncClassroom}
            disabled={isSyncing}
            title="Refresh from Classroom"
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-[#21262d] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>

        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold text-gray-100 truncate mr-2" title={assignment.title}>
            {assignment.title}
          </h2>
          <span className="text-gray-400 font-mono text-[11px] shrink-0">
            {assignment.maxPoints} pts
          </span>
        </div>
      </div>

      {/* Contextual Action Buttons appear when 1+ students are checked */}
      {checkedStudentIds.length > 0 && (
        <div data-testid="grading-header" className="p-2.5 border-b border-[#30363d] bg-[#1a202c]/50 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              {`${checkedStudentIds.length} Selected`}
            </span>
          </div>

          <div className="flex items-center space-x-2 pt-0.5">
            <button
              data-testid="save-draft-grade-button"
              onClick={() => onSaveDraftStudents(checkedStudentIds)}
              disabled={isSaving}
              className="flex-1 flex items-center justify-center space-x-1 py-1 px-2 rounded bg-[#21262d] hover:bg-[#30363d] text-gray-200 border border-[#30363d] transition-colors disabled:opacity-40"
            >
              <Save className="w-3 h-3 text-purple-400" />
              <span>{isSaving ? 'Saving...' : `Save Draft (${checkedStudentIds.length})`}</span>
            </button>

            <button
              data-testid="return-submission-button"
              onClick={() => onReturnStudents(checkedStudentIds)}
              disabled={isReturning}
              className="flex-1 flex items-center justify-center space-x-1 py-1 px-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors disabled:opacity-40"
            >
              <Send className="w-3 h-3" />
              <span>{isReturning ? 'Returning...' : `Return (${checkedStudentIds.length})`}</span>
            </button>
          </div>
        </div>
      )}

      {/* Filter Pills */}
      <div className="p-2 border-b border-[#30363d] bg-[#0d1117]">
        <div data-testid="student-filter-pills" className="flex flex-wrap gap-1">
          {(['ALL', 'TURNED_IN', 'UNMARKED', 'DRAFT', 'RETURNED', 'MISSING'] as FilterStatus[]).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold transition-colors ${
                statusFilter === filter
                  ? 'bg-purple-600 text-white'
                  : 'bg-[#21262d] text-gray-400 hover:text-gray-200 hover:bg-[#30363d]'
              }`}
            >
              {filter.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Student List */}
      <div data-testid="student-roster-list" className="flex-1 overflow-y-auto divide-y divide-[#30363d]/50">
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
                onClick={() => onSelectStudent(sub.studentId)}
                className={`p-2.5 flex flex-col space-y-1.5 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-[#1f242c] border-l-2 border-purple-500'
                    : 'hover:bg-[#1f242c]/60'
                }`}
              >
                {/* Line 1: Checkbox + Avatar + Full Student Name */}
                <div className="flex items-center space-x-2 min-w-0">
                  <input
                    type="checkbox"
                    data-testid={`student-checkbox-${sub.studentId}`}
                    checked={isChecked}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => onToggleCheckStudent(sub.studentId)}
                    className="w-3.5 h-3.5 rounded border-[#30363d] bg-[#0d1117] text-purple-600 focus:ring-0 cursor-pointer shrink-0"
                  />

                  {sub.studentAvatarUrl ? (
                    <img
                      src={sub.studentAvatarUrl}
                      alt={sub.studentName}
                      className="w-5 h-5 rounded-full shrink-0 border border-gray-700"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center shrink-0 text-gray-300">
                      <User className="w-3 h-3" />
                    </div>
                  )}

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
                      <span className="text-purple-400 flex items-center space-x-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        <span>Draft Graded</span>
                      </span>
                    ) : sub.state === 'TURNED_IN' ? (
                      <span className="text-blue-400">Turned In</span>
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
                      className={`w-12 bg-[#0d1117] border border-[#30363d] rounded px-1.5 py-0.5 text-xs font-mono text-right focus:outline-none focus:border-purple-500 ${
                        isReturned
                          ? 'text-emerald-400 font-bold'
                          : hasDraft || edit.dirty
                          ? 'text-purple-300 font-bold'
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

