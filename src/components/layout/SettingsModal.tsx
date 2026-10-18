import React from 'react';
import { Settings, X, Eye, BookOpen } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const {
    showExtractedTextToggle,
    setShowExtractedTextToggle,
    showRubricPane,
    setShowRubricPane,
  } = useSettings();

  if (!isOpen) return null;

  return (
    <div
      data-testid="settings-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#30363d] bg-[#0d1117] flex items-center justify-between">
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
        <div className="p-5 space-y-4">
          {/* Show Rubric Pane Setting (Default On) */}
          <div className="flex items-start justify-between space-x-4 p-3.5 rounded-lg bg-[#0d1117] border border-[#30363d]">
            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-lg bg-purple-950/50 border border-purple-800/40 text-purple-400 mt-0.5">
                <BookOpen className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-medium text-gray-200">
                  Show Rubric Pane
                </div>
                <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
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
          <div className="flex items-start justify-between space-x-4 p-3.5 rounded-lg bg-[#0d1117] border border-[#30363d]">
            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-lg bg-purple-950/50 border border-purple-800/40 text-purple-400 mt-0.5">
                <Eye className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-medium text-gray-200">
                  Show Extracted Text Toggle
                </div>
                <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
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

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#30363d] bg-[#0d1117] flex justify-end">
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
