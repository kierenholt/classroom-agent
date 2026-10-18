import React, { useState } from 'react';
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
  FileCheck,
  Layout,
  Wrench,
  Zap,
  Plus,
  Trash2,
  Edit2,
  RotateCcw,
} from 'lucide-react';
import { useSettings, FeedbackTone, FeedbackDetailLevel, GradingMode } from '../../context/SettingsContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export type SettingsTab = 'feedback' | 'display' | 'advanced' | 'quick-actions';

const GRADING_MODE_OPTIONS: { value: GradingMode; label: string }[] = [
  { value: 'no-draft', label: 'No Draft Mode (Direct to Final)' },
  { value: 'draft', label: 'Draft Mode (Review Before Final)' },
];

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
    showToolCalls,
    setShowToolCalls,
    showQuickActions,
    setShowQuickActions,
    quickActions,
    toggleQuickAction,
    addQuickAction,
    updateQuickAction,
    deleteQuickAction,
    resetQuickActionsToDefault,
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
    gradingMode,
    setGradingMode,
  } = useSettings();

  const [activeTab, setActiveTab] = useState<SettingsTab>('feedback');
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [newActionLabel, setNewActionLabel] = useState('');
  const [newActionPrompt, setNewActionPrompt] = useState('');
  const [addError, setAddError] = useState('');

  const handleSaveCustomAction = () => {
    if (!newActionLabel.trim() || !newActionPrompt.trim()) {
      setAddError('Please provide both a button label and a prompt.');
      return;
    }
    addQuickAction({
      label: newActionLabel.trim(),
      prompt: newActionPrompt.trim(),
    });
    setNewActionLabel('');
    setNewActionPrompt('');
    setAddError('');
    setIsAddingCustom(false);
  };

  if (!isOpen) return null;

  return (
    <div
      data-testid="settings-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] bg-[#1A1D21] border border-[#333842] rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#333842] bg-[#121316] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <Settings className="w-4 h-4 text-[#D4AF37]" />
            <h2 className="text-sm font-semibold text-white">Workspace Settings</h2>
          </div>
          <button
            data-testid="close-settings-button"
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-[#22262C] transition-colors"
            title="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Section Tabs Header */}
        <div className="flex border-b border-[#333842] bg-[#121316] px-5 pt-1 space-x-1 shrink-0">
          <button
            type="button"
            data-testid="settings-tab-feedback"
            onClick={() => setActiveTab('feedback')}
            className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'feedback'
                ? 'border-[#D4AF37] text-[#D4AF37] font-semibold'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Feedback &amp; Grading</span>
          </button>

          <button
            type="button"
            data-testid="settings-tab-display"
            onClick={() => setActiveTab('display')}
            className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'display'
                ? 'border-[#D4AF37] text-[#D4AF37] font-semibold'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'
            }`}
          >
            <Layout className="w-3.5 h-3.5" />
            <span>Workspace Display</span>
          </button>

          <button
            type="button"
            data-testid="settings-tab-advanced"
            onClick={() => setActiveTab('advanced')}
            className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'advanced'
                ? 'border-[#D4AF37] text-[#D4AF37] font-semibold'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Advanced</span>
          </button>

          <button
            type="button"
            data-testid="settings-tab-quick-actions"
            onClick={() => setActiveTab('quick-actions')}
            className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'quick-actions'
                ? 'border-[#D4AF37] text-[#D4AF37] font-semibold'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Quick Actions</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {activeTab === 'feedback' && (
            <div data-testid="feedback-options-section" className="space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#D4AF37]">
                Feedback Options
              </div>

            {/* Grading Mode Setting */}
            <div className="flex items-center justify-between space-x-4 p-3 rounded-lg bg-[#121316] border border-[#333842]">
              <div className="flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37] mt-0.5">
                  <FileCheck className="w-4 h-4" />
                </div>
                <div>
                  <label htmlFor="grading-mode-select" className="text-xs font-medium text-gray-200 block">
                    Grading Mode
                  </label>
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                    Choose whether approving evaluations and saving scores publishes final grades immediately or saves as drafts for review.
                  </p>
                </div>
              </div>

              <select
                id="grading-mode-select"
                data-testid="grading-mode-select"
                value={gradingMode}
                onChange={(e) => setGradingMode(e.target.value as GradingMode)}
                className="bg-[#22262C] border border-[#333842] rounded-md px-2.5 py-1.5 text-xs text-gray-200 focus:outline-hidden focus:border-[#D4AF37] shrink-0"
              >
                {GRADING_MODE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Tone Setting */}
            <div className="flex items-center justify-between space-x-4 p-3 rounded-lg bg-[#121316] border border-[#333842]">
              <div className="flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37] mt-0.5">
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
                className="bg-[#22262C] border border-[#333842] rounded-md px-2.5 py-1.5 text-xs text-gray-200 focus:outline-hidden focus:border-[#D4AF37] shrink-0"
              >
                {TONE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Level of Detail Setting */}
            <div className="flex items-center justify-between space-x-4 p-3 rounded-lg bg-[#121316] border border-[#333842]">
              <div className="flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37] mt-0.5">
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
                className="bg-[#22262C] border border-[#333842] rounded-md px-2.5 py-1.5 text-xs text-gray-200 focus:outline-hidden focus:border-[#D4AF37] shrink-0"
              >
                {DETAIL_LEVEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Use Rubric During Feedback Setting */}
            <div className="flex items-start justify-between space-x-4 p-3 rounded-lg bg-[#121316] border border-[#333842]">
              <div className="flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37] mt-0.5">
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
                  useRubricDuringFeedback ? 'bg-[#D4AF37]' : 'bg-[#333842]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-[#121316] shadow-sm ring-0 transition duration-200 ease-in-out ${
                    useRubricDuringFeedback ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Provide Next Steps Setting */}
            <div className="flex items-start justify-between space-x-4 p-3 rounded-lg bg-[#121316] border border-[#333842]">
              <div className="flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37] mt-0.5">
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
                  provideNextSteps ? 'bg-[#D4AF37]' : 'bg-[#333842]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-[#121316] shadow-sm ring-0 transition duration-200 ease-in-out ${
                    provideNextSteps ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Show Scores Setting */}
            <div className="flex items-start justify-between space-x-4 p-3 rounded-lg bg-[#121316] border border-[#333842]">
              <div className="flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37] mt-0.5">
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
                  showScores ? 'bg-[#D4AF37]' : 'bg-[#333842]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-[#121316] shadow-sm ring-0 transition duration-200 ease-in-out ${
                    showScores ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Custom Agent Instructions Setting */}
            <div className="p-3 rounded-lg bg-[#121316] border border-[#333842] space-y-2.5">
              <div className="flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37] mt-0.5">
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
                className="w-full bg-[#22262C] border border-[#333842] rounded-md px-2.5 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-hidden focus:border-[#D4AF37] resize-y"
              />
            </div>
          </div>
        )}

        {activeTab === 'display' && (
          <div data-testid="workspace-display-section" className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#D4AF37]">
              Workspace Display
            </div>

            {/* Show Rubric Pane Setting (Default On) */}
            <div className="flex items-start justify-between space-x-4 p-3 rounded-lg bg-[#121316] border border-[#333842]">
              <div className="flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37] mt-0.5">
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
                  showRubricPane ? 'bg-[#D4AF37]' : 'bg-[#333842]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-[#121316] shadow-sm ring-0 transition duration-200 ease-in-out ${
                    showRubricPane ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        )}

        {activeTab === 'advanced' && (
          <div data-testid="advanced-options-section" className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#D4AF37]">
              Advanced
            </div>

            {/* Show Extracted Text Setting (Default Off) */}
            <div className="flex items-start justify-between space-x-4 p-3 rounded-lg bg-[#121316] border border-[#333842]">
              <div className="flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37] mt-0.5">
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
                  showExtractedTextToggle ? 'bg-[#D4AF37]' : 'bg-[#333842]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-[#121316] shadow-sm ring-0 transition duration-200 ease-in-out ${
                    showExtractedTextToggle ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Show Tool Calls Setting (Default Off) */}
            <div className="flex items-start justify-between space-x-4 p-3 rounded-lg bg-[#121316] border border-[#333842]">
              <div className="flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37] mt-0.5">
                  <Wrench className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-200">
                    Show Tool Calls
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                    Display collapsible agent tool execution badges and raw parameter/result telemetry inside chat messages.
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={showToolCalls}
                data-testid="toggle-show-tool-calls-setting"
                onClick={() => setShowToolCalls(!showToolCalls)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  showToolCalls ? 'bg-[#D4AF37]' : 'bg-[#333842]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-[#121316] shadow-sm ring-0 transition duration-200 ease-in-out ${
                    showToolCalls ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        )}

        {activeTab === 'quick-actions' && (
          <div data-testid="quick-actions-settings-section" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#D4AF37]">
                  Chat Quick Actions
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Configure shortcut buttons in the chat co-pilot that instantly send frequently used prompts.
                </p>
              </div>
              <button
                type="button"
                data-testid="reset-quick-actions-button"
                onClick={resetQuickActionsToDefault}
                className="flex items-center space-x-1.5 px-2.5 py-1 text-xs text-gray-400 hover:text-gray-200 bg-[#121316] hover:bg-[#22262C] border border-[#333842] rounded-md transition-colors cursor-pointer"
                title="Reset to default prompt buttons"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to Defaults</span>
              </button>
            </div>

            {/* Master Toggle */}
            <div className="flex items-start justify-between space-x-4 p-3 rounded-lg bg-[#121316] border border-[#333842]">
              <div className="flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37] mt-0.5">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-200">
                    Show Quick Action Buttons
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                    Display one-click shortcut prompt pills directly above the chat input bar for instant commanding.
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={showQuickActions}
                data-testid="toggle-show-quick-actions-setting"
                onClick={() => setShowQuickActions(!showQuickActions)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  showQuickActions ? 'bg-[#D4AF37]' : 'bg-[#333842]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-[#121316] shadow-sm ring-0 transition duration-200 ease-in-out ${
                    showQuickActions ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Prompts Manager */}
            <div className="space-y-2">
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs font-medium text-gray-300">
                  Configured Prompts ({quickActions.filter((a) => a.enabled).length} of {quickActions.length} enabled)
                </span>
                {!isAddingCustom && (
                  <button
                    type="button"
                    data-testid="add-quick-action-button"
                    onClick={() => {
                      setIsAddingCustom(true);
                      setEditingActionId(null);
                      setNewActionLabel('');
                      setNewActionPrompt('');
                      setAddError('');
                    }}
                    className="flex items-center space-x-1 px-2.5 py-1 text-xs text-[#D4AF37] hover:text-[#E5B869] bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border border-[#D4AF37]/30 rounded-md transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Custom Prompt</span>
                  </button>
                )}
              </div>

              {/* Add Custom Form */}
              {isAddingCustom && (
                <div
                  data-testid="add-custom-action-form"
                  className="p-3.5 rounded-lg bg-[#161a22] border border-[#D4AF37]/40 space-y-3"
                >
                  <div className="text-xs font-semibold text-[#D4AF37] flex items-center space-x-1.5">
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Custom Quick Action</span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-gray-300 font-medium block">Button Label</label>
                    <input
                      type="text"
                      data-testid="custom-action-label-input"
                      value={newActionLabel}
                      onChange={(e) => setNewActionLabel(e.target.value)}
                      placeholder="e.g. Check Grammar, Polish Feedback..."
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-gray-300 font-medium block">Prompt Text</label>
                    <textarea
                      data-testid="custom-action-prompt-input"
                      value={newActionPrompt}
                      onChange={(e) => setNewActionPrompt(e.target.value)}
                      placeholder="e.g. Review the student's submission for spelling and grammatical errors..."
                      rows={2}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>

                  {addError && (
                    <p className="text-[11px] text-red-400 font-medium">{addError}</p>
                  )}

                  <div className="flex items-center justify-end space-x-2 pt-1">
                    <button
                      type="button"
                      data-testid="cancel-custom-action-button"
                      onClick={() => {
                        setIsAddingCustom(false);
                        setNewActionLabel('');
                        setNewActionPrompt('');
                        setAddError('');
                      }}
                      className="px-3 py-1 rounded text-xs text-gray-400 hover:text-gray-200 hover:bg-[#21262d] transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      data-testid="save-custom-action-button"
                      onClick={handleSaveCustomAction}
                      className="px-3 py-1 rounded text-xs font-semibold bg-[#D4AF37] hover:bg-[#E5B869] text-[#121316] transition-colors cursor-pointer"
                    >
                      Save Prompt
                    </button>
                  </div>
                </div>
              )}

              {/* Items List */}
              <div className="space-y-2 pt-1">
                {quickActions.map((action) => {
                  const isEditingThis = editingActionId === action.id;

                  if (isEditingThis) {
                    return (
                      <div
                        key={action.id}
                        data-testid={`edit-action-form-${action.id}`}
                        className="p-3.5 rounded-lg bg-[#161a22] border border-[#D4AF37]/40 space-y-3"
                      >
                        <div className="text-xs font-semibold text-[#D4AF37]">
                          Edit Quick Action
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] text-gray-300 font-medium block">Button Label</label>
                          <input
                            type="text"
                            data-testid={`edit-action-label-input-${action.id}`}
                            value={newActionLabel}
                            onChange={(e) => setNewActionLabel(e.target.value)}
                            className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-[#D4AF37]"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] text-gray-300 font-medium block">Prompt Text</label>
                          <textarea
                            data-testid={`edit-action-prompt-input-${action.id}`}
                            value={newActionPrompt}
                            onChange={(e) => setNewActionPrompt(e.target.value)}
                            rows={2}
                            className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-[#D4AF37]"
                          />
                        </div>
                        {addError && (
                          <p className="text-[11px] text-red-400 font-medium">{addError}</p>
                        )}
                        <div className="flex items-center justify-end space-x-2 pt-1">
                          <button
                            type="button"
                            data-testid={`cancel-edit-action-button-${action.id}`}
                            onClick={() => {
                              setEditingActionId(null);
                              setNewActionLabel('');
                              setNewActionPrompt('');
                              setAddError('');
                            }}
                            className="px-3 py-1 rounded text-xs text-gray-400 hover:text-gray-200 hover:bg-[#21262d] transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            data-testid={`save-edit-action-button-${action.id}`}
                            onClick={() => {
                              if (!newActionLabel.trim() || !newActionPrompt.trim()) {
                                setAddError('Please provide both a button label and a prompt.');
                                return;
                              }
                              updateQuickAction(action.id, {
                                label: newActionLabel.trim(),
                                prompt: newActionPrompt.trim(),
                              });
                              setEditingActionId(null);
                              setNewActionLabel('');
                              setNewActionPrompt('');
                              setAddError('');
                            }}
                            className="px-3 py-1 rounded text-xs font-semibold bg-[#D4AF37] hover:bg-[#E5B869] text-[#121316] transition-colors cursor-pointer"
                          >
                            Save Changes
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={action.id}
                      data-testid={`quick-action-item-${action.id}`}
                      className="p-3 rounded-lg bg-[#121316] border border-[#333842] flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-medium text-gray-200">
                            {action.label}
                          </span>
                          {action.isCustom && (
                            <span className="text-[10px] uppercase font-semibold tracking-wider text-purple-400 bg-purple-950/60 border border-purple-800/40 px-1.5 py-0.2 rounded">
                              Custom
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1 line-clamp-2 leading-relaxed font-mono">
                          {action.prompt}
                        </p>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0 pt-0.5">
                        {action.isCustom && (
                          <>
                            <button
                              type="button"
                              data-testid={`edit-quick-action-${action.id}`}
                              onClick={() => {
                                setEditingActionId(action.id);
                                setNewActionLabel(action.label);
                                setNewActionPrompt(action.prompt);
                                setAddError('');
                              }}
                              className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-[#22262C] transition-colors cursor-pointer"
                              title="Edit custom prompt"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              data-testid={`delete-quick-action-${action.id}`}
                              onClick={() => deleteQuickAction(action.id)}
                              className="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-red-950/30 transition-colors cursor-pointer"
                              title="Delete custom action"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={action.enabled}
                          data-testid={`toggle-quick-action-${action.id}`}
                          onClick={() => toggleQuickAction(action.id)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                            action.enabled ? 'bg-[#D4AF37]' : 'bg-[#333842]'
                          }`}
                          title={action.enabled ? 'Disable button in chat' : 'Enable button in chat'}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-[#121316] shadow-sm ring-0 transition duration-200 ease-in-out ${
                              action.enabled ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#333842] bg-[#121316] flex justify-end shrink-0">
          <button
            data-testid="done-settings-button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-md text-xs font-semibold bg-[#D4AF37] hover:bg-[#E5B869] text-[#121316] transition-colors shadow-xs cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
