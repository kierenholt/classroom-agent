import React, { useState } from 'react';
import { TopTabBar, TabItem } from './TopTabBar';
import { AssignmentWorkspace } from '../workspace/AssignmentWorkspace';
import { ChatPanel } from '../agent/ChatPanel';
import { AssignmentPickerView } from '../workspace/AssignmentPickerView';

interface OpenAssignmentSession {
  assignmentId: string;
  courseName: string;
  assignmentTitle: string;
  selectedStudentId: string | null;
}

export const WorkspaceLayout: React.FC = () => {
  const [sessions, setSessions] = useState<OpenAssignmentSession[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('__new__');

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
          setActiveTabId('__new__');
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

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0d1117] text-gray-200">
      {/* Top Tab Bar */}
      <TopTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={(id) => setActiveTabId(id)}
        onCloseTab={handleCloseTab}
        onNewTab={() => setActiveTabId('__new__')}
      />

      {/* Main Workspace Body */}
      <div className="flex-1 overflow-hidden relative">
        {/* Assignment Picker View (renders when activeTabId is '__new__' or when no assignments are open) */}
        <div className={`w-full h-full ${activeTabId === '__new__' ? 'flex' : 'hidden'}`}>
          <AssignmentPickerView onOpenAssignment={handleOpenAssignment} />
        </div>

        {/* Persistent In-Memory Session Containers: 70% Left Workspace + 30% Right Agent Pane */}
        {sessions.map((session) => {
          const isActive = activeTabId === session.assignmentId;
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
                  onAssignmentLoaded={(meta) => handleUpdateSessionMetadata(session.assignmentId, meta)}
                />
              </div>

              {/* 30% Persistent Agent Co-Pilot Pane */}
              <div className="w-[30%] h-full flex flex-col overflow-hidden">
                <ChatPanel
                  assignmentId={session.assignmentId}
                  selectedStudentId={session.selectedStudentId}
                  title="Grading Agent Co-Pilot"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
