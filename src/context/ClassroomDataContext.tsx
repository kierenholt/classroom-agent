import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ClassroomCourse, ClassroomCoursework } from '../types/classroom';
import { useAuth } from './AuthContext';
import { env } from '../config/env';
import { prefetchWorkspaceSubmissions } from '../services/driveFileCache';

interface CachedWorkspaceEntry {
  data: any;
  timestamp: number;
}

interface CreateCourseworkPayload {
  title: string;
  description?: string;
  maxPoints?: number;
  dueDate?: string;
}

interface ClassroomDataContextType {
  courses: ClassroomCourse[];
  courseworkByCourseId: Record<string, ClassroomCoursework[]>;
  loadingCourses: boolean;
  loadingCoursework: Record<string, boolean>;
  isPreloaded: boolean;
  error: string | null;
  preloadAssignments: (force?: boolean) => Promise<void>;
  fetchCourseworkForCourse: (courseId: string, force?: boolean) => Promise<ClassroomCoursework[]>;
  createCourseworkForCourse: (courseId: string, payload: CreateCourseworkPayload) => Promise<ClassroomCoursework>;
  prefetchWorkspace: (courseId: string, courseWorkId: string) => Promise<any>;
  getCachedWorkspace: (assignmentId: string) => any | null;
  refreshAll: () => Promise<void>;
}

const ClassroomDataContext = createContext<ClassroomDataContextType | undefined>(undefined);

// In-memory workspace cache for instant assignment tab loading (60-second TTL)
const workspaceMemoryCache = new Map<string, CachedWorkspaceEntry>();
const WORKSPACE_CACHE_TTL_MS = 60 * 1000;

export const ClassroomDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, googleAccessToken, getAuthHeaders, clearGoogleAccessToken } = useAuth();

  const [courses, setCourses] = useState<ClassroomCourse[]>([]);
  const [courseworkByCourseId, setCourseworkByCourseId] = useState<Record<string, ClassroomCoursework[]>>({});
  const [loadingCourses, setLoadingCourses] = useState<boolean>(false);
  const [loadingCoursework, setLoadingCoursework] = useState<Record<string, boolean>>({});
  const [isPreloaded, setIsPreloaded] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // In-flight promise tracking to prevent duplicate network calls
  const preloadingPromiseRef = useRef<Promise<void> | null>(null);
  const courseworkPromisesRef = useRef<Record<string, Promise<ClassroomCoursework[]> | undefined>>({});
  const workspacePromisesRef = useRef<Record<string, Promise<any> | undefined>>({});

  // 1. Fetch coursework for a specific course (using cache if available)
  const fetchCourseworkForCourse = useCallback(
    async (courseId: string, force = false): Promise<ClassroomCoursework[]> => {
      if (!courseId) {
        throw new Error('[Classroom Data] Missing courseId parameter. Fail-fast enabled.');
      }

      // Check existing cached data unless forced
      if (!force && courseworkByCourseId[courseId]) {
        return courseworkByCourseId[courseId];
      }

      // Check existing in-flight request
      const inFlightCoursework = courseworkPromisesRef.current[courseId];
      if (inFlightCoursework) {
        return inFlightCoursework;
      }

      setLoadingCoursework((prev) => ({ ...prev, [courseId]: true }));

      const fetchPromise = (async () => {
        try {
          const headers = await getAuthHeaders();
          const res = await fetch(`${env.API_BASE_URL}/classroom/courses/${encodeURIComponent(courseId)}/coursework`, {
            headers,
          });

          if (!res.ok) {
            const errText = await res.text();
            if (res.status === 401 || /invalid credentials/i.test(errText)) {
              clearGoogleAccessToken();
              return [];
            }
            throw new Error(`Failed to fetch coursework for course ${courseId}: ${errText}`);
          }

          const data = await res.json();
          const items: ClassroomCoursework[] = data.coursework || [];
          setCourseworkByCourseId((prev) => ({ ...prev, [courseId]: items }));
          return items;
        } catch (err: any) {
          console.error(`[Classroom Data] Error fetching coursework for ${courseId}:`, err);
          throw err;
        } finally {
          delete courseworkPromisesRef.current[courseId];
          setLoadingCoursework((prev) => ({ ...prev, [courseId]: false }));
        }
      })();

      courseworkPromisesRef.current[courseId] = fetchPromise;
      return fetchPromise;
    },
    [courseworkByCourseId, getAuthHeaders, clearGoogleAccessToken]
  );

  // 2. Preload courses and coursework in background
  const preloadAssignments = useCallback(
    async (force = false): Promise<void> => {
      if (!user || !googleAccessToken) {
        return;
      }

      if (isPreloaded && !force) {
        return;
      }

      if (preloadingPromiseRef.current) {
        return preloadingPromiseRef.current;
      }

      setLoadingCourses(true);
      setError(null);

      const promise = (async () => {
        try {
          const headers = await getAuthHeaders();

          // Attempt fast unified preload endpoint first
          let unifiedSuccess = false;
          try {
            const preloadRes = await fetch(`${env.API_BASE_URL}/classroom/preload`, { headers });
            if (preloadRes.ok) {
              const preloadData = await preloadRes.json();
              if (Array.isArray(preloadData.courses)) {
                setCourses(preloadData.courses);
                if (preloadData.courseworkByCourseId) {
                  setCourseworkByCourseId(preloadData.courseworkByCourseId);
                }
                unifiedSuccess = true;
              }
            } else if (preloadRes.status === 401) {
              clearGoogleAccessToken();
              return;
            }
          } catch {
            // Fall back to sequential/parallel endpoints below
          }

          if (!unifiedSuccess) {
            // Fallback: Fetch courses list directly
            const coursesRes = await fetch(`${env.API_BASE_URL}/classroom/courses`, { headers });
            if (!coursesRes.ok) {
              const errText = await coursesRes.text();
              if (coursesRes.status === 401 || /invalid credentials/i.test(errText)) {
                clearGoogleAccessToken();
                return;
              }
              throw new Error(`Failed to preload courses: ${errText}`);
            }

            const coursesData = await coursesRes.json();
            const loadedCourses: ClassroomCourse[] = coursesData.courses || [];
            setCourses(loadedCourses);

            // Preload coursework for each course in parallel in background
            await Promise.allSettled(
              loadedCourses.map(async (c) => {
                if (!c.id) return;
                try {
                  const cwRes = await fetch(
                    `${env.API_BASE_URL}/classroom/courses/${encodeURIComponent(c.id)}/coursework`,
                    { headers }
                  );
                  if (cwRes.ok) {
                    const cwData = await cwRes.json();
                    setCourseworkByCourseId((prev) => ({ ...prev, [c.id]: cwData.coursework || [] }));
                  }
                } catch {
                  // Non-fatal per-course error
                }
              })
            );
          }

          setIsPreloaded(true);
        } catch (err: any) {
          console.error('[Classroom Data] Preload error:', err);
          setError(err.message || 'Failed to preload assignments');
        } finally {
          setLoadingCourses(false);
          preloadingPromiseRef.current = null;
        }
      })();

      preloadingPromiseRef.current = promise;
      return promise;
    },
    [user, googleAccessToken, isPreloaded, getAuthHeaders, clearGoogleAccessToken]
  );

  // 3. Prefetch Live Workspace for selected assignment (so opening assignment tab is instantaneous)
  const prefetchWorkspace = useCallback(
    async (courseId: string, courseWorkId: string): Promise<any> => {
      if (!courseId || !courseWorkId) return null;
      const assignmentId = `${courseId}_${courseWorkId}`;

      const existing = workspaceMemoryCache.get(assignmentId);
      if (existing && Date.now() - existing.timestamp < WORKSPACE_CACHE_TTL_MS) {
        return existing.data;
      }

      const inFlightWorkspace = workspacePromisesRef.current[assignmentId];
      if (inFlightWorkspace) {
        return inFlightWorkspace;
      }

      const promise = (async () => {
        try {
          const headers = await getAuthHeaders();
          const res = await fetch(
            `${env.API_BASE_URL}/classroom/courses/${encodeURIComponent(courseId)}/coursework/${encodeURIComponent(courseWorkId)}/workspace`,
            { headers }
          );
          if (res.ok) {
            const data = await res.json();
            workspaceMemoryCache.set(assignmentId, {
              data,
              timestamp: Date.now(),
            });
            if (Array.isArray(data.submissions) && data.submissions.length > 0) {
              prefetchWorkspaceSubmissions(
                data.submissions,
                data.submissions[0]?.studentId || null,
                getAuthHeaders
              );
            }
            return data;
          }
        } catch {
          // Non-blocking prefetch failure
        } finally {
          delete workspacePromisesRef.current[assignmentId];
        }
        return null;
      })();

      workspacePromisesRef.current[assignmentId] = promise;
      return promise;
    },
    [getAuthHeaders]
  );

  // 3b. Create a new coursework assignment for a course and update cache
  const createCourseworkForCourse = useCallback(
    async (courseId: string, payload: CreateCourseworkPayload): Promise<ClassroomCoursework> => {
      if (!courseId) {
        throw new Error('[Classroom Data] Missing courseId parameter. Fail-fast enabled.');
      }
      if (!payload?.title || !payload.title.trim()) {
        throw new Error('[Classroom Data] Assignment title is required. Fail-fast enabled.');
      }

      const headers = await getAuthHeaders();
      const res = await fetch(`${env.API_BASE_URL}/classroom/courses/${encodeURIComponent(courseId)}/coursework`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: payload.title.trim(),
          description: payload.description?.trim() || undefined,
          maxPoints: payload.maxPoints ?? 100,
          dueDate: payload.dueDate?.trim() || undefined,
          state: 'PUBLISHED',
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        const errText = errData?.error || (await res.text().catch(() => 'Failed to create assignment'));
        if (res.status === 401 || /invalid credentials/i.test(String(errText))) {
          clearGoogleAccessToken();
        }
        throw new Error(String(errText));
      }

      const data = await res.json();
      const created: ClassroomCoursework = data.courseWork;
      if (!created || !created.id) {
        throw new Error('[Classroom Data] Created coursework response missing id.');
      }

      setCourseworkByCourseId((prev) => {
        const existingList = prev[courseId] || [];
        const filtered = existingList.filter((cw) => cw.id !== created.id);
        return {
          ...prev,
          [courseId]: [created, ...filtered],
        };
      });

      // Prefetch live workspace for the newly created coursework in the background
      prefetchWorkspace(courseId, created.id);

      return created;
    },
    [getAuthHeaders, clearGoogleAccessToken, prefetchWorkspace]
  );

  // 4. Retrieve cached workspace
  const getCachedWorkspace = useCallback((assignmentId: string): any | null => {
    const cached = workspaceMemoryCache.get(assignmentId);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > WORKSPACE_CACHE_TTL_MS) {
      workspaceMemoryCache.delete(assignmentId);
      return null;
    }
    return cached.data;
  }, []);

  const refreshAll = useCallback(async () => {
    setIsPreloaded(false);
    workspaceMemoryCache.clear();
    await preloadAssignments(true);
  }, [preloadAssignments]);

  // Eagerly initiate background preloading as soon as user & valid token are ready
  useEffect(() => {
    if (user && googleAccessToken && !isPreloaded && !preloadingPromiseRef.current) {
      preloadAssignments(false);
    }
  }, [user, googleAccessToken, isPreloaded, preloadAssignments]);

  return (
    <ClassroomDataContext.Provider
      value={{
        courses,
        courseworkByCourseId,
        loadingCourses,
        loadingCoursework,
        isPreloaded,
        error,
        preloadAssignments,
        fetchCourseworkForCourse,
        createCourseworkForCourse,
        prefetchWorkspace,
        getCachedWorkspace,
        refreshAll,
      }}
    >
      {children}
    </ClassroomDataContext.Provider>
  );
};

export const useClassroomData = (): ClassroomDataContextType => {
  const context = useContext(ClassroomDataContext);
  if (!context) {
    throw new Error('useClassroomData must be used within a ClassroomDataProvider');
  }
  return context;
};
