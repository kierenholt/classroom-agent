import React, { useState, useEffect } from 'react';
import { BookOpen, Calendar, Award, CheckCircle, RefreshCw, Copy, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { ClassroomCourse, ClassroomCoursework } from '../../types/classroom';
import { useAuth } from '../../context/AuthContext';
import { env } from '../../config/env';

interface AssignmentPickerViewProps {
  onOpenAssignment: (assignmentId: string) => void;
}

export const AssignmentPickerView: React.FC<AssignmentPickerViewProps> = ({ onOpenAssignment }) => {
  const { getAuthHeaders } = useAuth();
  const [courses, setCourses] = useState<ClassroomCourse[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [coursework, setCoursework] = useState<ClassroomCoursework[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [loadingCoursework, setLoadingCoursework] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 1. Fetch Teacher's Active Courses
  const fetchCourses = async () => {
    setLoadingCourses(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${env.API_BASE_URL}/classroom/courses`, {
        headers,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to fetch courses: ${errText}`);
      }

      const data = await res.json();
      setCourses(data.courses || []);
      if (data.courses && data.courses.length > 0 && !selectedCourseId) {
        setSelectedCourseId(data.courses[0].id);
      }
    } catch (err: any) {
      console.error('Fetch courses error:', err);
      setError(err.message || 'Failed to fetch courses');
    } finally {
      setLoadingCourses(false);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  // 2. Fetch Coursework when Selected Course changes
  useEffect(() => {
    if (!selectedCourseId) return;

    const fetchCoursework = async () => {
      setLoadingCoursework(true);
      setError(null);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`${env.API_BASE_URL}/classroom/courses/${selectedCourseId}/coursework`, {
          headers,
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Failed to fetch coursework: ${errText}`);
        }

        const data = await res.json();
        setCoursework(data.coursework || []);
      } catch (err: any) {
        console.error('Fetch coursework error:', err);
        setError(err.message || 'Failed to fetch coursework');
      } finally {
        setLoadingCoursework(false);
      }
    };

    fetchCoursework();
  }, [selectedCourseId]);

  // Sync and Open in Workspace
  const handleSyncAndOpen = async (courseWorkId: string) => {
    if (!selectedCourseId) return;
    setActionInProgress(courseWorkId);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${env.API_BASE_URL}/classroom/sync-assignment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          courseId: selectedCourseId,
          courseWorkId,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to sync assignment: ${errText}`);
      }

      const data = await res.json();
      onOpenAssignment(data.assignmentId);
    } catch (err: any) {
      console.error('Sync assignment error:', err);
      setError(err.message || 'Failed to sync assignment');
    } finally {
      setActionInProgress(null);
    }
  };

  // Clone Coursework for Full Write-Back Permissions
  const handleCloneCoursework = async (courseWorkId: string) => {
    if (!selectedCourseId) return;
    setActionInProgress(`clone-${courseWorkId}`);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${env.API_BASE_URL}/classroom/courses/${selectedCourseId}/coursework/clone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({ courseWorkId }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to clone coursework: ${errText}`);
      }

      const data = await res.json();
      // Automatically sync and open the newly cloned coursework
      await handleSyncAndOpen(data.clonedCourseWork.id);
    } catch (err: any) {
      console.error('Clone coursework error:', err);
      setError(err.message || 'Failed to clone coursework');
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div
      data-testid="assignment-picker-view"
      className="flex-1 h-full flex flex-col bg-[#0d1117] text-gray-200 overflow-hidden"
    >
      {/* Header */}
      <div className="p-6 border-b border-[#30363d] bg-[#161b22] flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center space-x-2">
            <BookOpen className="w-5 h-5 text-purple-400" />
            <span>Select Google Classroom Assignment</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Choose a course and select an assignment to open in the multi-tabbed grading workspace.
          </p>
        </div>
        <button
          onClick={fetchCourses}
          disabled={loadingCourses}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#21262d] hover:bg-[#30363d] text-gray-200 text-xs transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingCourses ? 'animate-spin' : ''}`} />
          <span>Refresh Courses</span>
        </button>
      </div>

      {error && (
        <div className="p-4 mx-6 mt-4 bg-red-950/50 border border-red-800/60 rounded-md text-red-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Content: Split into Courses column and Coursework grid */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Courses List */}
        <div className="w-72 border-r border-[#30363d] bg-[#161b22] p-4 overflow-y-auto space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Active Courses
          </span>
          {loadingCourses ? (
            <div className="flex items-center space-x-2 text-xs text-gray-400 p-4">
              <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
              <span>Loading courses...</span>
            </div>
          ) : courses.length === 0 ? (
            <div className="text-xs text-gray-500 p-4">No active courses found.</div>
          ) : (
            courses.map((course) => (
              <button
                key={course.id}
                data-testid={`course-select-${course.id}`}
                onClick={() => setSelectedCourseId(course.id)}
                className={`w-full text-left p-3 rounded-lg border transition-all text-xs ${
                  selectedCourseId === course.id
                    ? 'bg-purple-900/30 border-purple-500 text-white shadow-sm'
                    : 'bg-[#0d1117] border-[#30363d] text-gray-300 hover:bg-[#21262d]'
                }`}
              >
                <div className="font-semibold text-sm truncate">{course.name}</div>
                {course.section && <div className="text-gray-400 text-[11px] mt-0.5">{course.section}</div>}
              </button>
            ))
          )}
        </div>

        {/* Right: Coursework Cards Grid */}
        <div className="flex-1 p-6 overflow-y-auto">
          {loadingCoursework ? (
            <div className="h-full flex items-center justify-center space-x-2 text-gray-400 text-sm">
              <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
              <span>Fetching coursework from Classroom...</span>
            </div>
          ) : coursework.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 text-sm">
              <BookOpen className="w-12 h-12 mb-3 text-gray-600" />
              <p>No assignments found for this course.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {coursework.map((cw) => {
                const isCloned = cw.associatedWithDeveloper;
                const isWorking = actionInProgress === cw.id || actionInProgress === `clone-${cw.id}`;

                return (
                  <div
                    key={cw.id}
                    data-testid={`assignment-card-${cw.id}`}
                    className="p-5 bg-[#161b22] border border-[#30363d] rounded-xl flex flex-col justify-between hover:border-gray-500/50 transition-all space-y-4 shadow-sm"
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <h3 className="font-semibold text-base text-gray-100 line-clamp-1 mr-2" title={cw.title}>
                          {cw.title}
                        </h3>
                        {/* API Write-Back Status */}
                        {isCloned ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 text-[10px] font-medium shrink-0">
                            <CheckCircle className="w-3 h-3" />
                            <span>Full Write-Back</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-blue-950/60 text-blue-300 border border-blue-800/40 text-[10px] font-medium shrink-0">
                            <span>Direct Ready</span>
                          </span>
                        )}
                      </div>

                      {cw.description && (
                        <p className="text-xs text-gray-400 line-clamp-2 mt-2 leading-relaxed">
                          {cw.description}
                        </p>
                      )}

                      <div className="flex items-center space-x-4 mt-3 text-[11px] text-gray-400 font-mono">
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

                    <div className="pt-2 border-t border-[#30363d]/60 flex items-center justify-between space-x-2">
                      {!isCloned && (
                        <button
                          onClick={() => handleCloneCoursework(cw.id)}
                          disabled={isWorking}
                          title="Clone assignment under Classroom Agent for native draftGrade write-back"
                          className="flex items-center space-x-1 px-2.5 py-1.5 rounded bg-[#21262d] hover:bg-[#30363d] text-gray-300 text-xs transition-colors"
                        >
                          <Copy className="w-3 h-3 text-purple-400" />
                          <span>Clone in App</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleSyncAndOpen(cw.id)}
                        disabled={isWorking}
                        className="ml-auto flex items-center space-x-1.5 px-4 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs transition-colors disabled:opacity-50"
                      >
                        {isWorking ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Syncing...</span>
                          </>
                        ) : (
                          <>
                            <span>Open in Workspace</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
