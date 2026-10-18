import React, { useState, useEffect } from 'react';
import { X, FileText, Eye, Edit3, Check, Loader2 } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';

export interface FeedbackPreviewModalProps {
  isOpen: boolean;
  studentId: string;
  studentName: string;
  initialFeedback: string;
  initialScore?: number | null;
  maxPoints?: number;
  hasScore: boolean;
  isApproving: boolean;
  onClose: () => void;
  onApprove: (feedback: string, score: number | null) => Promise<void>;
}

export const FeedbackPreviewModal: React.FC<FeedbackPreviewModalProps> = ({
  isOpen,
  studentName,
  initialFeedback,
  initialScore,
  maxPoints = 100,
  hasScore,
  isApproving,
  onClose,
  onApprove,
}) => {
  const [feedbackText, setFeedbackText] = useState(initialFeedback);
  const [scoreValue, setScoreValue] = useState<string>(
    typeof initialScore === 'number' && !Number.isNaN(initialScore) ? String(initialScore) : ''
  );
  const [activeTab, setActiveTab] = useState<'edit' | 'rendered'>('edit');

  useEffect(() => {
    if (isOpen) {
      setFeedbackText(initialFeedback);
      setScoreValue(typeof initialScore === 'number' && !Number.isNaN(initialScore) ? String(initialScore) : '');
      setActiveTab('edit');
    }
  }, [isOpen, initialFeedback, initialScore]);

  if (!isOpen) return null;

  const parseScore = (): number | null => {
    if (!hasScore && scoreValue.trim() === '') return null;
    const trimmed = scoreValue.trim();
    if (trimmed === '') return null;
    const num = Number(trimmed);
    return Number.isNaN(num) ? null : num;
  };

  const handleApprove = async () => {
    await onApprove(feedbackText, parseScore());
  };

  return (
    <div
      data-testid="feedback-preview-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="bg-[#1A1D21] border border-[#333842] rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden text-gray-100">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#333842] flex items-center justify-between bg-[#121316]">
          <div className="flex items-center space-x-2.5">
            <FileText className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-gray-100">
                Feedback Preview — {studentName}
              </h3>
              <p className="text-[11px] text-gray-400">
                Review and edit the feedback document before approving for Google Classroom
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="preview-modal-close-button"
            onClick={onClose}
            disabled={isApproving}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#22262C] transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar: Edit vs Rendered Preview + Optional Score */}
        <div className="px-5 py-2.5 border-b border-[#333842] bg-[#1A1D21] flex items-center justify-between gap-4">
          <div className="flex items-center space-x-1 bg-[#121316] p-1 rounded-lg border border-[#333842]">
            <button
              type="button"
              data-testid="preview-modal-edit-tab"
              onClick={() => setActiveTab('edit')}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                activeTab === 'edit'
                  ? 'bg-[#D4AF37] text-[#121316]'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Feedback</span>
            </button>
            <button
              type="button"
              data-testid="preview-modal-rendered-tab"
              onClick={() => setActiveTab('rendered')}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                activeTab === 'rendered'
                  ? 'bg-[#D4AF37] text-[#121316]'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Rendered Preview</span>
            </button>
          </div>

          {(hasScore || scoreValue !== '') && (
            <div className="flex items-center space-x-2">
              <label className="text-xs font-medium text-gray-400">Score:</label>
              <div className="flex items-center space-x-1">
                <input
                  type="number"
                  data-testid="preview-modal-score-input"
                  value={scoreValue}
                  onChange={(e) => setScoreValue(e.target.value)}
                  min={0}
                  max={maxPoints}
                  className="w-16 bg-[#121316] border border-[#333842] rounded px-2 py-1 text-xs text-right text-gray-100 focus:outline-none focus:border-[#D4AF37]"
                />
                <span className="text-xs text-gray-500">/ {maxPoints}</span>
              </div>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 p-5 overflow-y-auto bg-[#121316]">
          {activeTab === 'edit' ? (
            <textarea
              data-testid="preview-modal-feedback-textarea"
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              rows={14}
              placeholder="Enter student feedback..."
              className="w-full h-full min-h-[280px] bg-[#1A1D21] border border-[#333842] rounded-lg p-3.5 text-xs text-gray-100 font-mono leading-relaxed focus:outline-none focus:border-[#D4AF37] resize-y"
            />
          ) : (
            <div
              data-testid="preview-modal-rendered-content"
              className="min-h-[280px] bg-[#1A1D21] border border-[#333842] rounded-lg p-4 text-xs text-gray-100 leading-relaxed"
            >
              {feedbackText.trim() ? (
                <MarkdownRenderer content={feedbackText} />
              ) : (
                <p className="text-gray-500 italic">No feedback content provided.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#333842] bg-[#1A1D21] flex items-center justify-end space-x-2.5">
          <button
            type="button"
            data-testid="preview-modal-cancel-button"
            onClick={onClose}
            disabled={isApproving}
            className="px-3 py-1.5 rounded-lg border border-[#333842] bg-[#22262C] hover:bg-[#2D323A] text-xs font-medium text-gray-300 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            data-testid="preview-modal-approve-button"
            onClick={handleApprove}
            disabled={isApproving}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-[#D4AF37] hover:bg-[#E5B869] text-xs font-semibold text-[#121316] shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isApproving ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#121316]" /> : <Check className="w-3.5 h-3.5" />}
            <span>Approve &amp; Send to Classroom</span>
          </button>
        </div>
      </div>
    </div>
  );
};
