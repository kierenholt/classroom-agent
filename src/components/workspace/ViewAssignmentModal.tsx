import React from 'react';
import { X, Eye, Edit3, Calendar, Award } from 'lucide-react';
import { GoogleClassroomIcon } from '../common/GoogleClassroomIcon';
import { AssignmentDoc } from '../../types/classroom';
import { MarkdownRenderer } from '../agent/MarkdownRenderer';

interface ViewAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: AssignmentDoc;
  onOpenEdit?: () => void;
}

export const ViewAssignmentModal: React.FC<ViewAssignmentModalProps> = ({
  isOpen,
  onClose,
  assignment,
  onOpenEdit,
}) => {
  if (!isOpen) return null;

  const classroomUrl = assignment.alternateLink ||
    (assignment.courseId && assignment.courseWorkId
      ? `https://classroom.google.com/c/${assignment.courseId}/a/${assignment.courseWorkId}`
      : assignment.courseId
        ? `https://classroom.google.com/c/${assignment.courseId}`
        : 'https://classroom.google.com');

  return (
    <div
      data-testid="view-assignment-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-[#1A1D21] border border-[#333842] rounded-xl text-gray-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#333842] flex items-center justify-between bg-[#121316]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center">
              <Eye className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#D4AF37]">
                {assignment.courseName}
              </span>
              <h2 data-testid="view-assignment-modal-title" className="text-sm font-semibold text-white">
                View Assignment
              </h2>
            </div>
          </div>
          <div className="flex items-center space-x-1.5">
            <a
              href={classroomUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="open-classroom-view-link"
              title="Open in Google Classroom"
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#22262C] transition-colors flex items-center justify-center"
            >
              <GoogleClassroomIcon className="w-4 h-4" />
            </a>
            <button
              type="button"
              data-testid="close-view-assignment-modal"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#22262C] transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Title & Metadata chips */}
          <div className="space-y-3">
            <h1 data-testid="view-assignment-title" className="text-lg font-bold text-gray-100">
              {assignment.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div
                data-testid="view-assignment-max-points"
                className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-[#22262C] border border-[#333842] text-gray-300 font-mono"
              >
                <Award className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>{assignment.maxPoints} pts</span>
              </div>
              {assignment.dueDate && (
                <div
                  data-testid="view-assignment-due-date"
                  className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-[#22262C] border border-[#333842] text-gray-300"
                >
                  <Calendar className="w-3.5 h-3.5 text-blue-400" />
                  <span>Due {assignment.dueDate}</span>
                </div>
              )}
              <span
                data-testid="view-assignment-state"
                className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-emerald-950/40 text-emerald-400 border border-emerald-800/40"
              >
                {assignment.state || 'PUBLISHED'}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-[#333842]" />

          {/* Instructions / Description Rendered as Markdown */}
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Instructions
            </h3>
            <div
              data-testid="view-assignment-description"
              className="p-4 rounded-lg bg-[#121316] border border-[#333842] min-h-[120px] text-xs text-gray-200"
            >
              {assignment.description && assignment.description.trim() ? (
                <MarkdownRenderer content={assignment.description} />
              ) : (
                <p className="text-gray-500 italic">No instructions or description provided for this assignment.</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#333842] flex items-center justify-between bg-[#121316]">
          {onOpenEdit ? (
            <button
              type="button"
              data-testid="view-modal-edit-button"
              onClick={() => {
                onClose();
                onOpenEdit();
              }}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-[#22262C] hover:bg-[#2D323A] border border-[#333842] text-xs font-medium text-gray-200 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Edit Assignment</span>
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            data-testid="close-view-assignment-button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#D4AF37] hover:bg-[#C49F27] text-black font-semibold text-xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
