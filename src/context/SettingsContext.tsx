import React, { createContext, useContext, useState } from 'react';

const STORAGE_KEY_EXTRACTED_TEXT = 'classroom_agent_show_extracted_text_toggle';
const STORAGE_KEY_RUBRIC_PANE = 'classroom_agent_show_rubric_pane';
const STORAGE_KEY_FEEDBACK_TONE = 'classroom_agent_feedback_tone';
const STORAGE_KEY_FEEDBACK_DETAIL_LEVEL = 'classroom_agent_feedback_detail_level';
const STORAGE_KEY_FEEDBACK_USE_RUBRIC = 'classroom_agent_feedback_use_rubric';
const STORAGE_KEY_FEEDBACK_PROVIDE_NEXT_STEPS = 'classroom_agent_feedback_provide_next_steps';
const STORAGE_KEY_FEEDBACK_SHOW_SCORES = 'classroom_agent_feedback_show_scores';
const STORAGE_KEY_CUSTOM_AGENT_INSTRUCTIONS = 'classroom_agent_custom_agent_instructions';

export type FeedbackTone = 'encouraging' | 'constructive' | 'direct' | 'formal' | 'warm';
export type FeedbackDetailLevel = 'brief' | 'standard' | 'comprehensive';

export interface FeedbackSettings {
  tone: FeedbackTone;
  detailLevel: FeedbackDetailLevel;
  useRubricDuringFeedback: boolean;
  provideNextSteps: boolean;
  showScores: boolean;
  customAgentInstructions: string;
}

const VALID_TONES: FeedbackTone[] = ['encouraging', 'constructive', 'direct', 'formal', 'warm'];
const VALID_DETAIL_LEVELS: FeedbackDetailLevel[] = ['brief', 'standard', 'comprehensive'];

interface SettingsContextValue {
  showExtractedTextToggle: boolean;
  setShowExtractedTextToggle: (enabled: boolean) => void;
  showRubricPane: boolean;
  setShowRubricPane: (enabled: boolean) => void;
  feedbackTone: FeedbackTone;
  setFeedbackTone: (tone: FeedbackTone) => void;
  feedbackDetailLevel: FeedbackDetailLevel;
  setFeedbackDetailLevel: (level: FeedbackDetailLevel) => void;
  useRubricDuringFeedback: boolean;
  setUseRubricDuringFeedback: (enabled: boolean) => void;
  provideNextSteps: boolean;
  setProvideNextSteps: (enabled: boolean) => void;
  showScores: boolean;
  setShowScores: (enabled: boolean) => void;
  customAgentInstructions: string;
  setCustomAgentInstructions: (instructions: string) => void;
  feedbackSettings: FeedbackSettings;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [showExtractedTextToggle, setShowExtractedTextToggleState] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY_EXTRACTED_TEXT) === 'true';
    } catch {
      return false;
    }
  });

  const [showRubricPane, setShowRubricPaneState] = useState<boolean>(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY_RUBRIC_PANE);
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });

  const [feedbackTone, setFeedbackToneState] = useState<FeedbackTone>(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY_FEEDBACK_TONE) as FeedbackTone | null;
      return stored && VALID_TONES.includes(stored) ? stored : 'encouraging';
    } catch {
      return 'encouraging';
    }
  });

  const [feedbackDetailLevel, setFeedbackDetailLevelState] = useState<FeedbackDetailLevel>(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY_FEEDBACK_DETAIL_LEVEL) as FeedbackDetailLevel | null;
      return stored && VALID_DETAIL_LEVELS.includes(stored) ? stored : 'standard';
    } catch {
      return 'standard';
    }
  });

  const [useRubricDuringFeedback, setUseRubricDuringFeedbackState] = useState<boolean>(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY_FEEDBACK_USE_RUBRIC);
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });

  const [provideNextSteps, setProvideNextStepsState] = useState<boolean>(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY_FEEDBACK_PROVIDE_NEXT_STEPS);
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });

  const [showScores, setShowScoresState] = useState<boolean>(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY_FEEDBACK_SHOW_SCORES);
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });

  const [customAgentInstructions, setCustomAgentInstructionsState] = useState<string>(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY_CUSTOM_AGENT_INSTRUCTIONS);
      return stored !== null ? stored : '';
    } catch {
      return '';
    }
  });

  const setShowExtractedTextToggle = (enabled: boolean) => {
    setShowExtractedTextToggleState(enabled);
    try {
      window.localStorage.setItem(STORAGE_KEY_EXTRACTED_TEXT, String(enabled));
    } catch (err) {
      console.error('Failed to persist settings to localStorage:', err);
    }
  };

  const setShowRubricPane = (enabled: boolean) => {
    setShowRubricPaneState(enabled);
    try {
      window.localStorage.setItem(STORAGE_KEY_RUBRIC_PANE, String(enabled));
    } catch (err) {
      console.error('Failed to persist rubric pane setting to localStorage:', err);
    }
  };

  const setFeedbackTone = (tone: FeedbackTone) => {
    setFeedbackToneState(tone);
    try {
      window.localStorage.setItem(STORAGE_KEY_FEEDBACK_TONE, tone);
    } catch (err) {
      console.error('Failed to persist feedback tone to localStorage:', err);
    }
  };

  const setFeedbackDetailLevel = (level: FeedbackDetailLevel) => {
    setFeedbackDetailLevelState(level);
    try {
      window.localStorage.setItem(STORAGE_KEY_FEEDBACK_DETAIL_LEVEL, level);
    } catch (err) {
      console.error('Failed to persist feedback detail level to localStorage:', err);
    }
  };

  const setUseRubricDuringFeedback = (enabled: boolean) => {
    setUseRubricDuringFeedbackState(enabled);
    try {
      window.localStorage.setItem(STORAGE_KEY_FEEDBACK_USE_RUBRIC, String(enabled));
    } catch (err) {
      console.error('Failed to persist use rubric setting to localStorage:', err);
    }
  };

  const setProvideNextSteps = (enabled: boolean) => {
    setProvideNextStepsState(enabled);
    try {
      window.localStorage.setItem(STORAGE_KEY_FEEDBACK_PROVIDE_NEXT_STEPS, String(enabled));
    } catch (err) {
      console.error('Failed to persist provide next steps setting to localStorage:', err);
    }
  };

  const setShowScores = (enabled: boolean) => {
    setShowScoresState(enabled);
    try {
      window.localStorage.setItem(STORAGE_KEY_FEEDBACK_SHOW_SCORES, String(enabled));
    } catch (err) {
      console.error('Failed to persist show scores setting to localStorage:', err);
    }
  };

  const setCustomAgentInstructions = (instructions: string) => {
    setCustomAgentInstructionsState(instructions);
    try {
      window.localStorage.setItem(STORAGE_KEY_CUSTOM_AGENT_INSTRUCTIONS, instructions);
    } catch (err) {
      console.error('Failed to persist custom agent instructions to localStorage:', err);
    }
  };

  const feedbackSettings: FeedbackSettings = {
    tone: feedbackTone,
    detailLevel: feedbackDetailLevel,
    useRubricDuringFeedback,
    provideNextSteps,
    showScores,
    customAgentInstructions,
  };

  return (
    <SettingsContext.Provider
      value={{
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
        feedbackSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = (): SettingsContextValue => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('[Configuration Failure] useSettings must be used within a SettingsProvider. Fail-fast enabled.');
  }
  return context;
};
