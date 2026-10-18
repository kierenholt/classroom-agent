import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, GraduationCap, LogOut, User, ChevronDown, Settings, CreditCard } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useClassroomData } from '../../context/ClassroomDataContext';
import { useCredits } from '../../context/CreditsContext';

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
  onOpenSettings?: () => void;
}

export const TopTabBar: React.FC<TopTabBarProps> = ({
  tabs,
  activeTabId,
  isPickerOpen = false,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onOpenSettings,
}) => {
  const { user, logOut } = useAuth();
  const { preloadAssignments } = useClassroomData();
  const { aiCredits, openTopUpModal } = useCredits();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  return (
    <div
      data-testid="assignment-tab-bar"
      className="h-10 bg-[#121316] border-b border-[#333842] flex items-center justify-between px-3 select-none shrink-0 relative z-30"
    >
      {/* Left: Brand Logo & Open Tabs */}
      <div className="flex items-center space-x-2 overflow-x-auto max-w-[85%]">
        {/* Brand */}
        <div className="flex items-center space-x-1.5 px-2 py-1 text-white font-bold text-xs tracking-tight shrink-0 mr-2 border-r border-[#333842]">
          <GraduationCap className="w-4 h-4 text-[#D4AF37]" />
          <span className="bg-gradient-to-r from-[#D4AF37] to-[#E5B869] bg-clip-text text-transparent font-bold">
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
                className={`flex items-center space-x-2 px-3 py-1 rounded-t-md text-xs cursor-pointer transition-all border-b-2 shrink-0 ${
                  isActive
                    ? 'bg-[#1A1D21] text-white border-b-[#D4AF37] font-medium'
                    : 'bg-[#121316] text-gray-400 border-b-transparent hover:bg-[#1A1D21]/60 hover:text-gray-200'
                }`}
              >
                {tab.courseName && (
                  <span className="text-[10px] text-[#D4AF37]/90 uppercase font-mono max-w-[90px] truncate">
                    {tab.courseName}:
                  </span>
                )}
                <span className={`truncate max-w-[140px] ${isActive ? 'text-[#F3E5AB]' : ''}`} title={tab.title}>
                  {tab.title}
                </span>

                {/* Close Button */}
                <button
                  data-testid={`close-tab-${tab.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  className="p-0.5 rounded hover:bg-[#2D323A] text-gray-400 hover:text-gray-200 transition-colors ml-1"
                  title="Close tab"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          {/* "+ Assignment" Button */}
          <button
            type="button"
            data-testid="new-assignment-tab-button"
            onClick={onNewTab}
            onMouseEnter={() => preloadAssignments()}
            onFocus={() => preloadAssignments()}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs cursor-pointer transition-all shrink-0 font-semibold shadow-xs ${
              isPickerOpen
                ? 'bg-[#E5B869] text-[#121316]'
                : 'bg-[#D4AF37] hover:bg-[#E5B869] text-[#121316]'
            }`}
            title="Open new assignment tab"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Assignment</span>
          </button>
        </div>
      </div>

      {/* Right: Authenticated User Info & Dropdown Menu */}
      <div className="flex items-center space-x-2 shrink-0 text-xs" ref={menuRef}>
        {user && (
          <div className="relative">
            <button
              type="button"
              data-testid="user-account-button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="flex items-center space-x-1.5 py-1 px-1.5 rounded hover:bg-[#22262C] transition-colors cursor-pointer text-left focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/50"
              aria-expanded={isMenuOpen}
              aria-haspopup="true"
              title={user.displayName || user.email || 'User Account'}
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Teacher'}
                  className="w-5 h-5 rounded-full border border-[#D4AF37]/50 object-cover"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-[#22262C] border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37]">
                  <User className="w-3 h-3" />
                </div>
              )}
              <span
                data-testid="user-account-name"
                className="text-gray-300 text-[11px] hidden sm:inline max-w-[120px] truncate"
              >
                {user.displayName || user.email}
              </span>
              <ChevronDown
                className={`w-3 h-3 text-gray-400 transition-transform duration-150 ${
                  isMenuOpen ? 'rotate-180 text-gray-200' : ''
                }`}
              />
            </button>

            {/* Popup Menu */}
            {isMenuOpen && (
              <div
                data-testid="user-account-menu"
                className="absolute right-0 top-full mt-1.5 w-52 bg-[#1A1D21] border border-[#333842] rounded-lg shadow-xl py-1 z-50 select-none animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="px-3 py-2 border-b border-[#333842]">
                  <p className="text-xs font-medium text-gray-200 truncate">
                    {user.displayName || 'Teacher'}
                  </p>
                  {user.email && (
                    <p className="text-[10px] text-gray-400 truncate mt-0.5" title={user.email}>
                      {user.email}
                    </p>
                  )}
                </div>

                <div className="p-1 space-y-0.5">
                  <button
                    type="button"
                    data-testid="user-menu-topup-credits-button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      openTopUpModal();
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs text-gray-300 hover:text-white hover:bg-[#22262C] transition-colors text-left group"
                    title="Top up credits"
                  >
                    <div className="flex items-center space-x-2">
                      <CreditCard className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#D4AF37] transition-colors" />
                      <span>Top up credits</span>
                    </div>
                    {aiCredits !== null && (
                      <span
                        data-testid="user-menu-credits-badge"
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                          aiCredits > 0
                            ? 'bg-[#D4AF37]/15 text-[#D4AF37] border-[#D4AF37]/30'
                            : 'bg-red-950/50 text-red-300 border-red-500/30'
                        }`}
                      >
                        {aiCredits}
                      </span>
                    )}
                  </button>
                  {onOpenSettings && (
                    <button
                      type="button"
                      data-testid="user-menu-settings-button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onOpenSettings();
                      }}
                      className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded text-xs text-gray-300 hover:text-white hover:bg-[#22262C] transition-colors text-left group"
                      title="Settings"
                    >
                      <Settings className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#D4AF37] transition-colors" />
                      <span>Settings</span>
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid="sign-out-button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      logOut();
                    }}
                    className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded text-xs text-gray-300 hover:text-red-400 hover:bg-[#22262C] transition-colors text-left group"
                    title="Sign Out"
                  >
                    <LogOut className="w-3.5 h-3.5 text-gray-400 group-hover:text-red-400 transition-colors" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
