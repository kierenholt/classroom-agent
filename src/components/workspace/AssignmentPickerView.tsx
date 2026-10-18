import React, { useState, useEffect } from 'react';
import { BookOpen, Calendar, Award, CheckCircle, AlertCircle, Loader2, X, GraduationCap, RefreshCw } from 'lucide-react';
import { ClassroomCoursework } from '../../types/classroom';
import { useClassroomData } from '../../context/ClassroomDataContext';

interface AssignmentPickerViewProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAssignment: (assignmentId: string, meta?: { courseName?: string; assignmentTitle?: string }) => void;
}

export const AssignmentPickerView: React.FC<AssignmentPickerViewProps> = ({
  isOpen,
  onClose,
  onOpenAssignment,
}) => {
  const {
    courses,
    courseworkByCourseId,
    loadingCourses: globalLoadingCourses,
    loadingCoursework: globalLoadingCoursework,
    error: globalError,
    preloadAssignments,
    fetchCourseworkForCourse,
    prefetchWorkspace,
    refreshAll,
  } = useClassroomData();

  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedCourseworkId, setSelectedCourseworkId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // When modal opens, reset selections so user starts fresh at Step 1
  useEffect(() => {
    if (isOpen) {
      setSelectedCourseId(null);
      setSelectedCourseworkId(null);
      setLocalError(null);
      // If not yet preloaded or courses empty, trigger background preload
      if (courses.length === 0) {
        preloadAssignments(false);
      }
    }
  }, [isOpen, courses.length, preloadAssignments]);

  // When selectedCourseId changes, fetch coursework if not already cached
  useEffect(() => {
    if (!isOpen || !selectedCourseId) {
      setSelectedCourseworkId(null);
      return;
    }

    if (!courseworkByCourseId[selectedCourseId]) {
      fetchCourseworkForCourse(selectedCourseId).catch((err: any) => {
        setLocalError(err.message || 'Failed to fetch coursework');
      });
    }
  }, [isOpen, selectedCourseId, courseworkByCourseId, fetchCourseworkForCourse]);

  if (!isOpen) {
    return null;
  }

  const currentCoursework: ClassroomCoursework[] = selectedCourseId ? courseworkByCourseId[selectedCourseId] || [] : [];
  const isCourseworkLoading = selectedCourseId
    ? !!globalLoadingCoursework[selectedCourseId] && currentCoursework.length === 0
    : false;
  const isCoursesLoading = globalLoadingCourses && courses.length === 0;
  const error = localError || globalError;

  const handleSelectAssignment = (cw: ClassroomCoursework) => {
    setSelectedCourseworkId(cw.id);
    if (selectedCourseId) {
      prefetchWorkspace(selectedCourseId, cw.id);
    }
  };

  const handleConfirmSelection = () => {
    if (!selectedCourseId || !selectedCourseworkId) return;
    const selectedCourse = courses.find((c) => c.id === selectedCourseId);
    const selectedCw = currentCoursework.find((cw) => cw.id === selectedCourseworkId);
    if (!selectedCw) return;

    const assignmentId = `${selectedCourseId}_${selectedCw.id}`;
    onOpenAssignment(assignmentId, {
      courseName: selectedCourse?.name || 'Classroom Course',
      assignmentTitle: selectedCw.title,
    });
    onClose();
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    setLocalError(null);
    try {
      await refreshAll();
    } catch (err: any) {
      setLocalError(err.message || 'Failed to refresh assignments');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div
      data-testid="assignment-picker-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        data-testid="assignment-picker-view"
        className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-[#161b22] border border-[#30363d] rounded-xl text-gray-200 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#30363d] flex items-center justify-between bg-[#0d1117]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/40 flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Open Assignment</h2>
              <p className="text-[11px] text-gray-400">
                Select a class and then choose an assignment to open in a tab
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-1.5">
            <button
              type="button"
              data-testid="assignment-picker-refresh-button"
              onClick={handleManualRefresh}
              disabled={isRefreshing || isCoursesLoading}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#21262d] transition-colors disabled:opacity-50"
              title="Refresh classes and assignments"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-purple-400' : ''}`} />
            </button>
            <button
              data-testid="assignment-picker-close-button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#21262d] transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 mx-6 mt-4 bg-red-950/50 border border-red-800/60 rounded-md text-red-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Modal Body: Class Picker + Conditional Assignment Picker */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Step 1: Class Picker */}
          <div data-testid="class-picker-section" className="space-y-2.5">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              1. Select a Class
            </label>
            {isCoursesLoading ? (
              <div className="flex items-center space-x-2 text-xs text-gray-400 p-4 bg-[#0d1117] border border-[#30363d] rounded-lg">
                <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                <span>Loading classes...</span>
              </div>
            ) : courses.length === 0 ? (
              <div className="text-xs text-gray-500 p-4 bg-[#0d1117] border border-[#30363d] rounded-lg">
                No active classes found.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1">
                {courses.map((course) => {
                  const isSelected = selectedCourseId === course.id;
                  return (
                    <button
                      key={course.id}
                      type="button"
                      data-testid={`course-select-${course.id}`}
                      onClick={() => setSelectedCourseId(course.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-all text-xs flex items-center justify-between ${
                        isSelected
                          ? 'bg-purple-900/30 border-purple-500 text-white shadow-sm'
                          : 'bg-[#0d1117] border-[#30363d] text-gray-300 hover:bg-[#21262d]'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-semibold text-sm truncate">{course.name}</div>
                        {course.section && (
                          <div className="text-gray-400 text-[11px] mt-0.5 truncate">{course.section}</div>
                        )}
                      </div>
                      {isSelected && <CheckCircle className="w-4 h-4 text-purple-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 2: Assignment Picker (shown once user selects a class) */}
          {selectedCourseId && (
            <div data-testid="assignment-picker-section" className="space-y-2.5 pt-2 border-t border-[#30363d]">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                2. Select an Assignment
              </label>
              {isCourseworkLoading ? (
                <div className="flex items-center space-x-2 text-xs text-gray-400 p-6 bg-[#0d1117] border border-[#30363d] rounded-lg justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                  <span>Loading assignments from Classroom...</span>
                </div>
              ) : currentCoursework.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-gray-500 text-xs p-6 bg-[#0d1117] border border-[#30363d] rounded-lg">
                  <BookOpen className="w-8 h-8 mb-2 text-gray-600" />
                  <p>No assignments found for this class.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {currentCoursework.map((cw) => {
                    const isSelected = selectedCourseworkId === cw.id;
                    return (
                      <button
                        key={cw.id}
                        type="button"
                        data-testid={`assignment-card-${cw.id}`}
                        onClick={() => handleSelectAssignment(cw)}
                        onMouseEnter={() => selectedCourseId && prefetchWorkspace(selectedCourseId, cw.id)}
                        className={`w-full text-left p-3.5 rounded-lg border transition-all flex items-start justify-between ${
                          isSelected
                            ? 'bg-purple-900/30 border-purple-500 text-white shadow-sm'
                            : 'bg-[#0d1117] border-[#30363d] text-gray-200 hover:bg-[#21262d]'
                        }`}
                      >
                        <div className="min-w-0 pr-3 flex-1">
                          <div className="font-semibold text-sm text-gray-100 truncate" title={cw.title}>
                            {cw.title}
                          </div>
                          {cw.description && (
                            <p className="text-xs text-gray-400 line-clamp-1 mt-1">{cw.description}</p>
                          )}
                          <div className="flex items-center space-x-4 mt-2 text-[11px] text-gray-400 font-mono">
                            <span className="flex items-center space-x-1">
                              <Award className="w-3.5 h-3.5 text-purple-400" />
                              <span>{cw.maxPoints ?? 100} points</span>
                            </span>
                            {cw.dueDate && (
                              <span className="flex items-center space-x-1">
                                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                                <span>
                                  Due {cw.dueDate.year}-{cw.dueDate.month}-{cw.dueDate.day}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                        {isSelected && <CheckCircle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-[#30363d] bg-[#0d1117] flex items-center justify-end space-x-2.5">
          <button
            type="button"
            data-testid="assignment-picker-cancel-button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-gray-300 text-xs font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="assignment-picker-ok-button"
            onClick={handleConfirmSelection}
            disabled={!selectedCourseId || !selectedCourseworkId}
            className="px-5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
