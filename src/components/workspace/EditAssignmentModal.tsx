import React, { useState, useEffect } from 'react';
import { X, Edit3, Eye, AlertCircle, Loader2 } from 'lucide-react';
import { GoogleClassroomIcon } from '../common/GoogleClassroomIcon';
import { AssignmentDoc, ClassroomCoursework } from '../../types/classroom';
import { useClassroomData } from '../../context/ClassroomDataContext';
import { MarkdownRenderer } from '../agent/MarkdownRenderer';

interface EditAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: AssignmentDoc;
  onAssignmentUpdated: (updated: ClassroomCoursework) => void;
}

export const EditAssignmentModal: React.FC<EditAssignmentModalProps> = ({
  isOpen,
  onClose,
  assignment,
  onAssignmentUpdated,
}) => {
  const { updateCourseworkForCourse } = useClassroomData();

  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [title, setTitle] = useState(assignment.title || '');
  const [description, setDescription] = useState(assignment.description || '');
  const [maxPoints, setMaxPoints] = useState<number | string>(assignment.maxPoints ?? 100);
  const [dueDate, setDueDate] = useState(assignment.dueDate || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPermissionError, setIsPermissionError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab('edit');
      setTitle(assignment.title || '');
      setDescription(assignment.description || '');
      setMaxPoints(assignment.maxPoints ?? 100);
      setDueDate(assignment.dueDate || '');
      setError(null);
      setIsPermissionError(false);
      setIsSubmitting(false);
    }
  }, [isOpen, assignment]);

  if (!isOpen) return null;

  const classroomEditUrl = assignment.courseId && assignment.courseWorkId
    ? `https://classroom.google.com/c/${assignment.courseId}/a/${assignment.courseWorkId}/edit`
    : assignment.alternateLink || 'https://classroom.google.com';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    const parsedPoints = Number(maxPoints);
    if (Number.isNaN(parsedPoints) || parsedPoints < 0) {
      setError('Points must be a valid non-negative number.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setIsPermissionError(false);

    try {
      const updated = await updateCourseworkForCourse(
        assignment.courseId,
        assignment.courseWorkId,
        {
          title: title.trim(),
          description: description.trim() || undefined,
          maxPoints: parsedPoints,
          dueDate: dueDate.trim() || undefined,
        }
      );
      onAssignmentUpdated(updated);
      onClose();
    } catch (err: any) {
      const status = err?.status;
      const msg = String(err?.message || 'Failed to update assignment in Google Classroom');
      if (status === 403 || /permission denied|@ProjectPermissionDenied/i.test(msg)) {
        setIsPermissionError(true);
        setError(
          'Google Classroom requires coursework created outside of Classroom Agent to be edited directly in Google Classroom.'
        );
      } else {
        setError(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      data-testid="edit-assignment-modal"
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
              <Edit3 className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Edit Assignment</h2>
              <p className="text-[11px] text-gray-400">
                Update assignment details live in Google Classroom
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="close-edit-assignment-modal"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#22262C] transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error notification */}
        {error && (
          <div
            data-testid="edit-assignment-error"
            className="p-3 mx-6 mt-4 bg-red-950/50 border border-red-800/60 rounded-lg text-red-300 text-xs flex flex-col space-y-2"
          >
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
            {isPermissionError && (
              <div className="pt-1 flex justify-end">
                <a
                  href={classroomEditUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="open-classroom-edit-fallback-button"
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-[#22262C] hover:bg-[#2D323A] border border-[#333842] text-xs font-medium text-[#D4AF37] hover:text-[#F3E5AB] transition-colors"
                >
                  <span>Open in Google Classroom to Edit</span>
                  <GoogleClassroomIcon className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        )}

        {/* Tab switch: Edit vs Preview */}
        <div className="px-6 pt-3 pb-3 border-b border-[#333842] flex items-center justify-between bg-[#1A1D21]">
          <div className="flex items-center space-x-1 bg-[#121316] p-1 rounded-lg border border-[#333842]">
            <button
              type="button"
              data-testid="edit-modal-edit-tab"
              onClick={() => setActiveTab('edit')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors ${
                activeTab === 'edit'
                  ? 'bg-[#D4AF37] text-[#121316]'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
            <button
              type="button"
              data-testid="edit-modal-preview-tab"
              onClick={() => setActiveTab('preview')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors ${
                activeTab === 'preview'
                  ? 'bg-[#D4AF37] text-[#121316]'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview Markdown</span>
            </button>
          </div>
          <div className="text-[11px] text-gray-400 font-mono">
            {Number(maxPoints) || 0} pts
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1 flex flex-col justify-between">
          {activeTab === 'edit' ? (
            <div className="space-y-5">
              {/* Title */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                  Assignment Title <span className="text-[#D4AF37]">*</span>
                </label>
                <input
                  type="text"
                  data-testid="edit-assignment-title-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Essay: Causes of the Roman Empire Fall"
                  required
                  className="w-full px-3.5 py-2.5 bg-[#121316] border border-[#333842] rounded-lg text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                  Instructions / Description
                </label>
                <textarea
                  rows={8}
                  data-testid="edit-assignment-description-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter assignment directions or prompt for students..."
                  className="w-full px-3.5 py-2.5 bg-[#121316] border border-[#333842] rounded-lg text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-[#D4AF37] resize-y font-sans leading-relaxed"
                />
              </div>

              {/* Max Points and Due Date */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                    Total Points
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    data-testid="edit-assignment-max-points-input"
                    value={maxPoints}
                    onChange={(e) => setMaxPoints(e.target.value)}
                    placeholder="100"
                    className="w-full px-3 py-2 bg-[#121316] border border-[#333842] rounded-lg text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    data-testid="edit-assignment-due-date-input"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-[#121316] border border-[#333842] rounded-lg text-xs text-gray-200 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div data-testid="edit-modal-rendered-preview" className="space-y-4">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Assignment Title</span>
                <h1 className="text-base font-bold text-gray-100">{title || 'Untitled Assignment'}</h1>
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1 block">Instructions</span>
                <div className="p-4 rounded-lg bg-[#121316] border border-[#333842] min-h-[140px] text-xs text-gray-200">
                  {description && description.trim() ? (
                    <MarkdownRenderer content={description} />
                  ) : (
                    <p className="text-gray-500 italic">No instructions provided.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-[#333842] flex items-center justify-end space-x-3">
            <button
              type="button"
              data-testid="cancel-edit-assignment-button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-[#22262C] hover:bg-[#2D323A] border border-[#333842] text-xs font-medium text-gray-300 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="save-edit-assignment-button"
              disabled={isSubmitting || !title.trim()}
              className="px-4 py-2 rounded-lg bg-[#D4AF37] hover:bg-[#C49F27] text-black font-semibold text-xs transition-colors flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
