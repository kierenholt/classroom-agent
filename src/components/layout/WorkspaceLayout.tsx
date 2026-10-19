import React, { useEffect, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { TopTabBar, TabItem } from './TopTabBar';
import { SettingsModal } from './SettingsModal';
import { AssignmentWorkspace } from '../workspace/AssignmentWorkspace';
import { ChatPanel } from '../agent/ChatPanel';
import { TopUpCreditsModal } from '../agent/TopUpCreditsModal';
import { AssignmentPickerView } from '../workspace/AssignmentPickerView';

interface OpenAssignmentSession {
  assignmentId: string;
  courseName: string;
  assignmentTitle: string;
  selectedStudentId: string | null;
  checkedStudentIds?: string[];
}

const OPEN_SESSIONS_STORAGE_KEY = 'classroom_agent_open_sessions';
const ACTIVE_TAB_STORAGE_KEY = 'classroom_agent_active_tab_id';

function loadStoredSessions(): OpenAssignmentSession[] {
  try {
    const saved = window.localStorage.getItem(OPEN_SESSIONS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed
          .filter(
            (s): s is OpenAssignmentSession =>
              Boolean(
                s &&
                  typeof s === 'object' &&
                  typeof s.assignmentId === 'string' &&
                  typeof s.courseName === 'string' &&
                  typeof s.assignmentTitle === 'string'
              )
          )
          .map((s) => ({
            assignmentId: s.assignmentId,
            courseName: s.courseName,
            assignmentTitle: s.assignmentTitle,
            selectedStudentId: typeof s.selectedStudentId === 'string' ? s.selectedStudentId : null,
          }));
      }
    }
  } catch {
    // ignore corrupted localStorage data
  }
  return [];
}

export const WorkspaceLayout: React.FC = () => {
  const [sessions, setSessions] = useState<OpenAssignmentSession[]>(() => loadStoredSessions());
  const [activeTabId, setActiveTabId] = useState<string | null>(() => {
    const initialSessions = loadStoredSessions();
    if (initialSessions.length === 0) return null;
    try {
      const savedTabId = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
      if (savedTabId && initialSessions.some((s) => s.assignmentId === savedTabId)) {
        return savedTabId;
      }
    } catch {
      // ignore localStorage read errors
    }
    return initialSessions[initialSessions.length - 1].assignmentId;
  });
  const [isPickerOpen, setIsPickerOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(OPEN_SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
    } catch {
      // ignore storage quota errors
    }
  }, [sessions]);

  useEffect(() => {
    try {
      if (activeTabId) {
        window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTabId);
      } else {
        window.localStorage.removeItem(ACTIVE_TAB_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }, [activeTabId]);

  // Derive top tabs list
  const tabs: TabItem[] = sessions.map((s) => ({
    id: s.assignmentId,
    title: s.assignmentTitle,
    courseName: s.courseName,
  }));

  const handleOpenAssignment = (
    assignmentId: string,
    meta?: { courseName?: string; assignmentTitle?: string }
  ) => {
    const existingIndex = sessions.findIndex((s) => s.assignmentId === assignmentId);
    if (existingIndex !== -1) {
      setActiveTabId(assignmentId);
      setIsPickerOpen(false);
      return;
    }

    const newSession: OpenAssignmentSession = {
      assignmentId,
      courseName: meta?.courseName || 'Classroom',
      assignmentTitle: meta?.assignmentTitle || `Assignment ${assignmentId.slice(0, 8)}`,
      selectedStudentId: null,
    };

    setSessions((prev) => [...prev, newSession]);
    setActiveTabId(assignmentId);
    setIsPickerOpen(false);
  };

  const handleUpdateSessionMetadata = (
    assignmentId: string,
    meta: { courseName: string; assignmentTitle: string }
  ) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.assignmentId === assignmentId &&
        (s.courseName !== meta.courseName || s.assignmentTitle !== meta.assignmentTitle)
          ? { ...s, courseName: meta.courseName, assignmentTitle: meta.assignmentTitle }
          : s
      )
    );
  };

  const handleCloseTab = (tabId: string) => {
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.assignmentId !== tabId);
      if (activeTabId === tabId) {
        if (filtered.length > 0) {
          setActiveTabId(filtered[filtered.length - 1].assignmentId);
        } else {
          setActiveTabId(null);
        }
      }
      return filtered;
    });
  };

  const handleSelectStudentForAssignment = (assignmentId: string, studentId: string | null) => {
    setSessions((prev) =>
      prev.map((s) => (s.assignmentId === assignmentId ? { ...s, selectedStudentId: studentId } : s))
    );
  };

  const handleChangeCheckedStudentsForAssignment = (assignmentId: string, checkedIds: string[]) => {
    setSessions((prev) =>
      prev.map((s) => (s.assignmentId === assignmentId ? { ...s, checkedStudentIds: checkedIds } : s))
    );
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#121316] text-[#EDEDED]">
      {/* Top Tab Bar */}
      <TopTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        isPickerOpen={isPickerOpen}
        onSelectTab={(id) => {
          setActiveTabId(id);
          setIsPickerOpen(false);
        }}
        onCloseTab={handleCloseTab}
        onNewTab={() => setIsPickerOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Workspace Body */}
      <div className="flex-1 overflow-hidden relative">
        {/* Empty Workspace State (renders when no assignment tab is active) */}
        {sessions.length === 0 && (
          <div
            data-testid="empty-workspace-state"
            className="w-full h-full flex flex-col items-center justify-center text-gray-500 p-6 select-none"
          >
            <div className="w-14 h-14 rounded-2xl bg-[#1A1D21] border border-[#333842] flex items-center justify-center mb-4">
              <GraduationCap className="w-7 h-7 text-[#D4AF37]" />
            </div>
            <h2 className="text-sm font-semibold text-gray-200">No Assignment Open</h2>
            <p className="text-xs text-gray-500 mt-1 text-center max-w-xs">
              Click <span className="text-[#F3E5AB] font-medium">+ Assignment</span> in the top bar to select a class and assignment.
            </p>
          </div>
        )}

        {/* Persistent In-Memory Session Containers: 70% Left Workspace + 30% Right Agent Pane */}
        {sessions.map((session) => {
          const isActive = activeTabId === session.assignmentId;
          const openTabsDigest = sessions.map((s) => ({
            assignmentId: s.assignmentId,
            courseName: s.courseName,
            assignmentTitle: s.assignmentTitle,
            isActive: s.assignmentId === session.assignmentId,
          }));
          return (
            <div
              key={session.assignmentId}
              className={`w-full h-full flex ${isActive ? 'flex' : 'hidden'}`}
            >
              {/* 70% Assignment Workspace (Zones A, B, C) */}
              <div className="w-[70%] h-full flex overflow-hidden">
                <AssignmentWorkspace
                  assignmentId={session.assignmentId}
                  selectedStudentId={session.selectedStudentId}
                  onSelectStudent={(sId) => handleSelectStudentForAssignment(session.assignmentId, sId)}
                  onChangeCheckedStudents={(ids) => handleChangeCheckedStudentsForAssignment(session.assignmentId, ids)}
                  onAssignmentLoaded={(meta) => handleUpdateSessionMetadata(session.assignmentId, meta)}
                />
              </div>

              {/* 30% Persistent Agent Co-Pilot Pane */}
              <div className="w-[30%] h-full flex flex-col overflow-hidden">
                <ChatPanel
                  assignmentId={session.assignmentId}
                  selectedStudentId={session.selectedStudentId}
                  checkedStudentIds={session.checkedStudentIds || []}
                  openTabs={openTabsDigest}
                  title="Agent"
                  onOpenAssignment={handleOpenAssignment}
                />
              </div>
            </div>
          );
        })}

        {/* Assignment Picker Modal */}
        <AssignmentPickerView
          isOpen={isPickerOpen}
          onClose={() => setIsPickerOpen(false)}
          onOpenAssignment={handleOpenAssignment}
        />

        {/* Settings Modal */}
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />

        {/* Top Up AI Credits Modal */}
        <TopUpCreditsModal />
      </div>
    </div>
  );
};

