import React, { useState } from 'react';
import { Search, RefreshCw, Send, CheckCircle2, Clock, User } from 'lucide-react';
import { AssignmentDoc, StudentSubmissionDoc } from '../../types/classroom';

interface StudentRosterZoneProps {
  assignment: AssignmentDoc;
  submissions: StudentSubmissionDoc[];
  selectedStudentId: string | null;
  onSelectStudent: (studentId: string) => void;
  onSyncClassroom: () => Promise<void>;
  onReturnAllDrafts: () => Promise<void>;
  isSyncing: boolean;
  isReturning: boolean;
}

type FilterStatus = 'ALL' | 'TURNED_IN' | 'UNMARKED' | 'DRAFT' | 'RETURNED' | 'MISSING';

export const StudentRosterZone: React.FC<StudentRosterZoneProps> = ({
  assignment,
  submissions,
  selectedStudentId,
  onSelectStudent,
  onSyncClassroom,
  onReturnAllDrafts,
  isSyncing,
  isReturning,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('ALL');

  const draftCount = submissions.filter((s) => s.draftGrade !== undefined && s.state !== 'RETURNED').length;

  const filteredSubmissions = submissions.filter((sub) => {
    const matchesSearch =
      sub.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (sub.studentEmail && sub.studentEmail.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

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

        {/* Bulk Action: Return All Drafts */}
        <button
          data-testid="return-all-drafts-button"
          onClick={onReturnAllDrafts}
          disabled={draftCount === 0 || isReturning}
          className="w-full flex items-center justify-center space-x-1.5 py-1.5 px-2 rounded bg-emerald-700/80 hover:bg-emerald-600 text-white font-medium transition-colors disabled:opacity-40 disabled:hover:bg-emerald-700/80"
        >
          <Send className="w-3 h-3" />
          <span>Return All Drafts ({draftCount})</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="p-2 border-b border-[#30363d] bg-[#0d1117] space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-gray-500" />
          <input
            type="text"
            data-testid="student-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search students..."
            className="w-full bg-[#161b22] border border-[#30363d] rounded pl-7 pr-2 py-1 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Filter Pills */}
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
            const hasDraft = sub.draftGrade !== undefined;
            const isReturned = sub.state === 'RETURNED';

            return (
              <div
                key={sub.studentId}
                data-testid={`student-row-${sub.studentId}`}
                onClick={() => onSelectStudent(sub.studentId)}
                className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-[#1f242c] border-l-2 border-purple-500'
                    : 'hover:bg-[#1f242c]/60'
                }`}
              >
                <div className="flex items-center space-x-2 truncate mr-2">
                  {sub.studentAvatarUrl ? (
                    <img
                      src={sub.studentAvatarUrl}
                      alt={sub.studentName}
                      className="w-6 h-6 rounded-full shrink-0 border border-gray-700"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center shrink-0 text-gray-300">
                      <User className="w-3.5 h-3.5" />
                    </div>
                  )}

                  <div className="truncate">
                    <div className="font-medium text-gray-200 truncate flex items-center space-x-1">
                      <span className="truncate">{sub.studentName}</span>
                      {sub.late && (
                        <span className="px-1 text-[9px] bg-red-900/50 text-red-300 rounded shrink-0">
                          LATE
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-1 text-[10px] text-gray-400">
                      {isReturned ? (
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
                  </div>
                </div>

                {/* Score Pill */}
                <div
                  data-testid={`student-grade-badge-${sub.studentId}`}
                  className="shrink-0 text-right font-mono text-[11px]"
                >
                  {isReturned && sub.assignedGrade !== undefined ? (
                    <span className="text-emerald-400 font-bold">{sub.assignedGrade}</span>
                  ) : hasDraft ? (
                    <span className="text-purple-300 font-bold">{sub.draftGrade}*</span>
                  ) : (
                    <span className="text-gray-500">--</span>
                  )}
                  <span className="text-gray-500">/{assignment.maxPoints}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
