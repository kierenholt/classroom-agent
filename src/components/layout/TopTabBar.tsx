import React from 'react';
import { Plus, X, GraduationCap, LogOut, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export interface TabItem {
  id: string; // assignmentId
  title: string;
  courseName?: string;
}

interface TopTabBarProps {
  tabs: TabItem[];
  activeTabId: string | null;
  isPickerOpen?: boolean;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
}

export const TopTabBar: React.FC<TopTabBarProps> = ({
  tabs,
  activeTabId,
  isPickerOpen = false,
  onSelectTab,
  onCloseTab,
  onNewTab,
}) => {
  const { user, logOut } = useAuth();

  return (
    <div
      data-testid="assignment-tab-bar"
      className="h-10 bg-[#0d1117] border-b border-[#30363d] flex items-center justify-between px-3 select-none shrink-0"
    >
      {/* Left: Brand Logo & Open Tabs */}
      <div className="flex items-center space-x-2 overflow-x-auto max-w-[85%]">
        {/* Brand */}
        <div className="flex items-center space-x-1.5 px-2 py-1 text-white font-bold text-xs tracking-tight shrink-0 mr-2 border-r border-[#30363d]">
          <GraduationCap className="w-4 h-4 text-purple-400" />
          <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            Classroom Agent
          </span>
        </div>

        {/* Tab Items */}
        <div className="flex items-center space-x-1 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = activeTabId === tab.id;
            return (
              <div
                key={tab.id}
                data-testid={`assignment-tab-${tab.id}`}
                onClick={() => onSelectTab(tab.id)}
                className={`flex items-center space-x-2 px-3 py-1 rounded-t-md text-xs cursor-pointer transition-all border-t-2 shrink-0 ${
                  isActive
                    ? 'bg-[#161b22] text-white border-purple-500 font-medium'
                    : 'bg-[#0d1117] text-gray-400 border-transparent hover:bg-[#161b22]/50 hover:text-gray-200'
                }`}
              >
                {tab.courseName && (
                  <span className="text-[10px] text-purple-400/80 uppercase font-mono max-w-[90px] truncate">
                    {tab.courseName}:
                  </span>
                )}
                <span className="truncate max-w-[140px]" title={tab.title}>
                  {tab.title}
                </span>

                {/* Close Button */}
                <button
                  data-testid={`close-tab-${tab.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  className="p-0.5 rounded hover:bg-gray-700/60 text-gray-400 hover:text-gray-200 transition-colors ml-1"
                  title="Close tab"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          {/* "+ Assignment" Button */}
          <button
            data-testid="new-assignment-tab-button"
            onClick={onNewTab}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs transition-colors shrink-0 ${
              isPickerOpen
                ? 'bg-purple-600/30 text-purple-200 border border-purple-500/50'
                : 'text-gray-400 hover:text-white hover:bg-[#21262d]'
            }`}
            title="Open new assignment tab"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="text-[11px]">Assignment</span>
          </button>
        </div>
      </div>

      {/* Right: Authenticated User Info & Logout */}
      <div className="flex items-center space-x-3 shrink-0 text-xs">
        {user && (
          <div className="flex items-center space-x-2">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'Teacher'}
                className="w-5 h-5 rounded-full border border-purple-500/50"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-purple-900/60 flex items-center justify-center text-purple-300">
                <User className="w-3 h-3" />
              </div>
            )}
            <span className="text-gray-300 text-[11px] hidden sm:inline max-w-[120px] truncate">
              {user.displayName || user.email}
            </span>
            <button
              onClick={logOut}
              className="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-[#21262d] transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
