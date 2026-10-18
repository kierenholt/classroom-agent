import React from 'react';
import {
  Settings,
  X,
  Eye,
  BookOpen,
  MessageSquare,
  AlignLeft,
  ClipboardCheck,
  ArrowRightCircle,
  Hash,
  Sparkles,
} from 'lucide-react';
import { useSettings, FeedbackTone, FeedbackDetailLevel } from '../../context/SettingsContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TONE_OPTIONS: { value: FeedbackTone; label: string }[] = [
  { value: 'encouraging', label: 'Encouraging & Supportive' },
  { value: 'constructive', label: 'Constructive & Balanced' },
  { value: 'direct', label: 'Direct & Concise' },
  { value: 'formal', label: 'Formal & Academic' },
  { value: 'warm', label: 'Warm & Mentorship-focused' },
];

const DETAIL_LEVEL_OPTIONS: { value: FeedbackDetailLevel; label: string }[] = [
  { value: 'brief', label: 'Brief / Summary' },
  { value: 'standard', label: 'Standard / Balanced' },
  { value: 'comprehensive', label: 'Comprehensive / Deep-Dive' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const {
    showExtractedTextToggle,
    setShowExtractedTextToggle,
    showRubricPane,
    setShowRubricPane,
    feedbackTone,
    setFeedbackTone,
    feedbackDetailLevel,
    setFeedbackDetailLevel,
    useRubricDuringFeedback,
    setUseRubricDuringFeedback,
    provideNextSteps,
    setProvideNextSteps,
    showScores,
    setShowScores,
    customAgentInstructions,
    setCustomAgentInstructions,
  } = useSettings();

  if (!isOpen) return null;

  return (
    <div
      data-testid="settings-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#30363d] bg-[#0d1117] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <Settings className="w-4 h-4 text-purple-400" />
            <h2 className="text-sm font-semibold text-white">Workspace Settings</h2>
          </div>
          <button
            data-testid="close-settings-button"
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-[#21262d] transition-colors"
            title="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Feedback Options Section */}
          <div data-testid="feedback-options-section" className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-purple-400">
              Feedback Options
            </div>

            {/* Tone Setting */}
            <div className="flex items-center justify-between space-x-4 p-3 rounded-lg bg-[#0d1117] border border-[#30363d]">
              <div className="flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-purple-950/50 border border-purple-800/40 text-purple-400 mt-0.5">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <label htmlFor="feedback-tone-select" className="text-xs font-medium text-gray-200 block">
                    Tone
                  </label>
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                    The tone of the AI and how it writes student feedback.
                  </p>
                </div>
              </div>

              <select
                id="feedback-tone-select"
                data-testid="feedback-tone-select"
                value={feedbackTone}
                onChange={(e) => setFeedbackTone(e.target.value as FeedbackTone)}
                className="bg-[#161b22] border border-[#30363d] rounded-md px-2.5 py-1.5 text-xs text-gray-200 focus:outline-hidden focus:border-purple-500 shrink-0"
              >
                {TONE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Level of Detail Setting */}
            <div className="flex items-center justify-between space-x-4 p-3 rounded-lg bg-[#0d1117] border border-[#30363d]">
              <div className="flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-purple-950/50 border border-purple-800/40 text-purple-400 mt-0.5">
                  <AlignLeft className="w-4 h-4" />
                </div>
                <div>
                  <label htmlFor="feedback-detail-level-select" className="text-xs font-medium text-gray-200 block">
                    Level of Detail
                  </label>
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                    Controls how concise or comprehensive the AI feedback is.
                  </p>
                </div>
              </div>

              <select
                id="feedback-detail-level-select"
                data-testid="feedback-detail-level-select"
                value={feedbackDetailLevel}
                onChange={(e) => setFeedbackDetailLevel(e.target.value as FeedbackDetailLevel)}
                className="bg-[#161b22] border border-[#30363d] rounded-md px-2.5 py-1.5 text-xs text-gray-200 focus:outline-hidden focus:border-purple-500 shrink-0"
              >
                {DETAIL_LEVEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Use Rubric During Feedback Setting */}
            <div className="flex items-start justify-between space-x-4 p-3 rounded-lg bg-[#0d1117] border border-[#30363d]">
              <div className="flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-purple-950/50 border border-purple-800/40 text-purple-400 mt-0.5">
                  <ClipboardCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-200">
                    Use Rubric During Feedback
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                    Evaluate submissions against the assignment rubric criteria when generating feedback.
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={useRubricDuringFeedback}
                data-testid="toggle-use-rubric-feedback-setting"
                onClick={() => setUseRubricDuringFeedback(!useRubricDuringFeedback)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  useRubricDuringFeedback ? 'bg-purple-600' : 'bg-[#30363d]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    useRubricDuringFeedback ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Provide Next Steps Setting */}
            <div className="flex items-start justify-between space-x-4 p-3 rounded-lg bg-[#0d1117] border border-[#30363d]">
              <div className="flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-purple-950/50 border border-purple-800/40 text-purple-400 mt-0.5">
                  <ArrowRightCircle className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-200">
                    Provide Next Steps
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                    Include actionable recommendations and next steps for improvement in student feedback.
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={provideNextSteps}
                data-testid="toggle-provide-next-steps-setting"
                onClick={() => setProvideNextSteps(!provideNextSteps)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  provideNextSteps ? 'bg-purple-600' : 'bg-[#30363d]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    provideNextSteps ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Show Scores Setting */}
            <div className="flex items-start justify-between space-x-4 p-3 rounded-lg bg-[#0d1117] border border-[#30363d]">
              <div className="flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-purple-950/50 border border-purple-800/40 text-purple-400 mt-0.5">
                  <Hash className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-200">
                    Show Scores
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                    Include numerical scores and point breakdowns in the AI&apos;s written feedback and summary.
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={showScores}
                data-testid="toggle-show-scores-setting"
                onClick={() => setShowScores(!showScores)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  showScores ? 'bg-purple-600' : 'bg-[#30363d]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    showScores ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Custom Agent Instructions Setting */}
            <div className="p-3 rounded-lg bg-[#0d1117] border border-[#30363d] space-y-2.5">
              <div className="flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-purple-950/50 border border-purple-800/40 text-purple-400 mt-0.5">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <label
                    htmlFor="custom-agent-instructions-input"
                    className="text-xs font-medium text-gray-200 block"
                  >
                    Custom Agent Instructions
                  </label>
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                    Provide custom grading rules, formatting instructions, or persona guidelines for the AI agent.
                  </p>
                </div>
              </div>

              <textarea
                id="custom-agent-instructions-input"
                data-testid="custom-agent-instructions-input"
                rows={3}
                value={customAgentInstructions}
                onChange={(e) => setCustomAgentInstructions(e.target.value)}
                placeholder="e.g., Deduct 5 points for missing docstrings, or write all feedback in British English..."
                className="w-full bg-[#161b22] border border-[#30363d] rounded-md px-2.5 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-hidden focus:border-purple-500 resize-y"
              />
            </div>
          </div>

          {/* Workspace Interface Section */}
          <div className="space-y-3 pt-2 border-t border-[#30363d]">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-purple-400">
              Workspace Display
            </div>

            {/* Show Rubric Pane Setting (Default On) */}
            <div className="flex items-start justify-between space-x-4 p-3 rounded-lg bg-[#0d1117] border border-[#30363d]">
              <div className="flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-purple-950/50 border border-purple-800/40 text-purple-400 mt-0.5">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-200">
                    Show Rubric Pane
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                    Display the rubric criteria and scoring breakdown pane at the bottom of the submission preview canvas.
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={showRubricPane}
                data-testid="toggle-rubric-pane-setting"
                onClick={() => setShowRubricPane(!showRubricPane)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  showRubricPane ? 'bg-purple-600' : 'bg-[#30363d]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    showRubricPane ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Show Extracted Text Setting */}
            <div className="flex items-start justify-between space-x-4 p-3 rounded-lg bg-[#0d1117] border border-[#30363d]">
              <div className="flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-purple-950/50 border border-purple-800/40 text-purple-400 mt-0.5">
                  <Eye className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-200">
                    Show Extracted Text Toggle
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                    Display the <span className="text-gray-300 font-mono">Extracted Text</span> button in the submission preview header to inspect the raw text payload sent to Gemini.
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={showExtractedTextToggle}
                data-testid="toggle-extracted-text-setting"
                onClick={() => setShowExtractedTextToggle(!showExtractedTextToggle)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  showExtractedTextToggle ? 'bg-purple-600' : 'bg-[#30363d]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    showExtractedTextToggle ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#30363d] bg-[#0d1117] flex justify-end shrink-0">
          <button
            data-testid="done-settings-button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-md text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
