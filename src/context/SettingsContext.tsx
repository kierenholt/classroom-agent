import React, { createContext, useContext, useState } from 'react';

const STORAGE_KEY_EXTRACTED_TEXT = 'classroom_agent_show_extracted_text_toggle';
const STORAGE_KEY_RUBRIC_PANE = 'classroom_agent_show_rubric_pane';

interface SettingsContextValue {
  showExtractedTextToggle: boolean;
  setShowExtractedTextToggle: (enabled: boolean) => void;
  showRubricPane: boolean;
  setShowRubricPane: (enabled: boolean) => void;
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

  return (
    <SettingsContext.Provider
      value={{
        showExtractedTextToggle,
        setShowExtractedTextToggle,
        showRubricPane,
        setShowRubricPane,
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
