import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { doc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import {
  AssignmentDoc,
  AssignmentRubric,
  StudentSubmissionDoc,
  StudentEvaluationSidecarDoc,
  CriterionEvaluation,
} from '../../types/classroom';
import { StudentRosterZone } from './StudentRosterZone';
import { SubmissionPreviewZone } from './SubmissionPreviewZone';
import { RubricMarkingZone } from './RubricMarkingZone';
import { useAuth } from '../../context/AuthContext';
import { useClassroomData } from '../../context/ClassroomDataContext';
import { env } from '../../config/env';

interface AssignmentWorkspaceProps {
  assignmentId: string;
  selectedStudentId: string | null;
  onSelectStudent: (studentId: string | null) => void;
  onAssignmentLoaded?: (meta: { courseName: string; assignmentTitle: string }) => void;
}

function parseAssignmentId(assignmentId: string): { courseId: string; courseWorkId: string } {
  const idx = assignmentId.indexOf('_');
  if (idx === -1) {
    throw new Error(`Invalid assignmentId "${assignmentId}". Expected "{courseId}_{courseWorkId}".`);
  }
  return {
    courseId: assignmentId.slice(0, idx),
    courseWorkId: assignmentId.slice(idx + 1),
  };
}

export const AssignmentWorkspace: React.FC<AssignmentWorkspaceProps> = ({
  assignmentId,
  selectedStudentId,
  onSelectStudent,
  onAssignmentLoaded,
}) => {
  const { getAuthHeaders, clearGoogleAccessToken } = useAuth();
  const [liveAssignment, setLiveAssignment] = useState<AssignmentDoc | null>(null);
  const [liveSubmissions, setLiveSubmissions] = useState<StudentSubmissionDoc[]>([]);
  const [sidecarRubric, setSidecarRubric] = useState<AssignmentRubric | undefined>(undefined);
  const [evaluationsMap, setEvaluationsMap] = useState<Record<string, StudentEvaluationSidecarDoc>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isReturning, setIsReturning] = useState(false);

  const onAssignmentLoadedRef = useRef(onAssignmentLoaded);
  onAssignmentLoadedRef.current = onAssignmentLoaded;

  // 1. Fetch Live Assignment + Roster + Submissions directly from Google Classroom API
  const fetchLiveWorkspace = useCallback(
    async (isBackgroundRefresh = false) => {
      if (!assignmentId) return;
      if (!isBackgroundRefresh) setLoading(true);
      setError(null);

      try {
        const { courseId, courseWorkId } = parseAssignmentId(assignmentId);
        const headers = await getAuthHeaders();
        const res = await fetch(
          `${env.API_BASE_URL}/classroom/courses/${encodeURIComponent(courseId)}/coursework/${encodeURIComponent(courseWorkId)}/workspace`,
          { headers }
        );

        if (!res.ok) {
          const errText = await res.text();
          if (res.status === 401 || /invalid credentials/i.test(errText)) {
            clearGoogleAccessToken();
            return;
          }
          throw new Error(`Failed to load live Classroom workspace: ${errText}`);
        }

        const data = await res.json();
        setLiveAssignment(data.assignment);
        setLiveSubmissions(data.submissions || []);

        if (data.assignment && onAssignmentLoadedRef.current) {
          onAssignmentLoadedRef.current({
            courseName: data.assignment.courseName,
            assignmentTitle: data.assignment.title,
          });
        }
      } catch (err: any) {
        console.error('Error fetching live Classroom workspace:', err);
        setError(err.message || 'Failed to load live Classroom workspace');
      } finally {
        setLoading(false);
      }
    },
    [assignmentId, getAuthHeaders, clearGoogleAccessToken]
  );

  const { getCachedWorkspace } = useClassroomData();

  useEffect(() => {
    if (!assignmentId) return;
    const cached = getCachedWorkspace(assignmentId);
    if (cached && cached.assignment) {
      setLiveAssignment(cached.assignment);
      setLiveSubmissions(cached.submissions || []);
      setLoading(false);
      if (onAssignmentLoadedRef.current) {
        onAssignmentLoadedRef.current({
          courseName: cached.assignment.courseName,
          assignmentTitle: cached.assignment.title,
        });
      }
      fetchLiveWorkspace(true);
    } else {
      fetchLiveWorkspace(false);
    }
  }, [assignmentId, fetchLiveWorkspace, getCachedWorkspace]);

  // 2. Subscribe to Firestore Sidecar (Rubric + Per-Student AI/Teacher Evaluations)
  useEffect(() => {
    if (!assignmentId) return;

    // 2a. Assignment Sidecar Doc (stores rubric)
    const assignRef = doc(db, 'assignments', assignmentId);
    const unsubAssign = onSnapshot(
      assignRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setSidecarRubric(data.rubric || undefined);
        }
      },
      (err) => {
        console.error('Error listening to assignment sidecar doc:', err);
      }
    );

    // 2b. Evaluations Sidecar Subcollection (stores rubricBreakdown, overallFeedback, comments, draftGrade, syncStatus)
    const evalsRef = collection(db, 'assignments', assignmentId, 'evaluations');
    const unsubEvals = onSnapshot(
      evalsRef,
      (snap) => {
        const map: Record<string, StudentEvaluationSidecarDoc> = {};
        snap.docs.forEach((d) => {
          map[d.id] = d.data() as StudentEvaluationSidecarDoc;
        });
        setEvaluationsMap(map);
      },
      (err) => {
        console.error('Error listening to evaluations sidecar collection:', err);
      }
    );

    return () => {
      unsubAssign();
      unsubEvals();
    };
  }, [assignmentId]);

  // 3. Merge Live Classroom Submissions with Real-Time Firestore Sidecar Evaluations
  const mergedSubmissions: StudentSubmissionDoc[] = useMemo(() => {
    return liveSubmissions.map((liveSub) => {
      const sidecar = evaluationsMap[liveSub.studentId];
      if (!sidecar) return liveSub;

      const isReturned = sidecar.classroomSyncStatus === 'RETURNED' || liveSub.state === 'RETURNED';
      return {
        ...liveSub,
        state: isReturned ? 'RETURNED' : liveSub.state,
        draftGrade: sidecar.draftGrade !== undefined ? sidecar.draftGrade : liveSub.draftGrade,
        assignedGrade: sidecar.assignedGrade !== undefined ? sidecar.assignedGrade : liveSub.assignedGrade,
        rubricBreakdown: sidecar.rubricBreakdown || [],
        overallFeedback: sidecar.overallFeedback || '',
        comments: sidecar.comments || [],
        classroomSyncStatus: sidecar.classroomSyncStatus || liveSub.classroomSyncStatus,
        classroomSyncError: sidecar.classroomSyncError || liveSub.classroomSyncError,
        updatedAt: sidecar.updatedAt || liveSub.updatedAt,
      };
    });
  }, [liveSubmissions, evaluationsMap]);

  // 4. Merge Live Assignment with Sidecar Rubric & Dynamic Submission Stats
  const mergedAssignment: AssignmentDoc | null = useMemo(() => {
    if (!liveAssignment) return null;
    const turnedIn = mergedSubmissions.filter((s) => s.state === 'TURNED_IN').length;
    const returned = mergedSubmissions.filter((s) => s.state === 'RETURNED').length;
    const draftGraded = mergedSubmissions.filter((s) => s.draftGrade !== undefined && s.state !== 'RETURNED').length;

    return {
      ...liveAssignment,
      rubric: sidecarRubric || liveAssignment.rubric,
      submissionStats: {
        total: mergedSubmissions.length,
        turnedIn,
        draftGraded,
        returned,
        missing: Math.max(0, mergedSubmissions.length - turnedIn - returned),
      },
    };
  }, [liveAssignment, sidecarRubric, mergedSubmissions]);

  // Selected student submission
  const activeSubmission = mergedSubmissions.find((s) => s.studentId === selectedStudentId) || null;

  // Auto-select first student if none selected and submissions exist
  useEffect(() => {
    if (!selectedStudentId && mergedSubmissions.length > 0) {
      onSelectStudent(mergedSubmissions[0].studentId);
    }
  }, [mergedSubmissions, selectedStudentId, onSelectStudent]);

  // Local unsaved edits map keyed by studentId
  const [localEditsMap, setLocalEditsMap] = useState<
    Record<
      string,
      {
        totalGrade: number | '';
        rubricBreakdown: CriterionEvaluation[];
        overallFeedback: string;
        dirty: boolean;
      }
    >
  >({});

  // Checked student IDs in Zone A for batch actions
  const [checkedStudentIds, setCheckedStudentIds] = useState<string[]>([]);

  // Clear local dirty flag for a student when remote Firestore sidecar updates their evaluation
  useEffect(() => {
    setLocalEditsMap((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const studentId of Object.keys(evaluationsMap)) {
        if (next[studentId] && !next[studentId].dirty) {
          delete next[studentId];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [evaluationsMap]);

  // Helper to get effective grading state for any student
  const getStudentEffectiveEdit = useCallback(
    (sub: StudentSubmissionDoc) => {
      const local = localEditsMap[sub.studentId];
      if (local) return local;

      const criteria = mergedAssignment?.rubric?.criteria || [];
      const initialBreakdown: CriterionEvaluation[] = criteria.map((crit) => {
        const existing = sub.rubricBreakdown?.find((b) => b.criterionId === crit.id);
        return existing || { criterionId: crit.id, score: 0, comment: '' };
      });

      return {
        totalGrade: (sub.draftGrade ?? sub.assignedGrade ?? '') as number | '',
        rubricBreakdown: initialBreakdown,
        overallFeedback: sub.overallFeedback || '',
        dirty: false,
      };
    },
    [localEditsMap, mergedAssignment]
  );

  const handleUpdateStudentScore = useCallback(
    (studentId: string, newScore: number | '') => {
      const sub = mergedSubmissions.find((s) => s.studentId === studentId);
      if (!sub) return;
      const current = getStudentEffectiveEdit(sub);
      setLocalEditsMap((prev) => ({
        ...prev,
        [studentId]: {
          ...current,
          totalGrade: newScore,
          dirty: true,
        },
      }));
    },
    [mergedSubmissions, getStudentEffectiveEdit]
  );

  const handleUpdateStudentRubricAndFeedback = useCallback(
    (studentId: string, rubricBreakdown: CriterionEvaluation[], overallFeedback: string, newTotalScore?: number) => {
      const sub = mergedSubmissions.find((s) => s.studentId === studentId);
      if (!sub) return;
      const current = getStudentEffectiveEdit(sub);
      setLocalEditsMap((prev) => ({
        ...prev,
        [studentId]: {
          totalGrade: newTotalScore !== undefined ? newTotalScore : current.totalGrade,
          rubricBreakdown,
          overallFeedback,
          dirty: true,
        },
      }));
    },
    [mergedSubmissions, getStudentEffectiveEdit]
  );

  // Refresh live roster & submissions from Google Classroom
  const handleSyncClassroom = async () => {
    setIsSyncing(true);
    try {
      await fetchLiveWorkspace(true);
    } finally {
      setIsSyncing(false);
    }
  };

  // Save draft grades for target studentIds (checked students or active student)
  const handleSaveDraftStudents = async (studentIds: string[]) => {
    const targetIds = studentIds.length > 0 ? studentIds : selectedStudentId ? [selectedStudentId] : [];
    if (targetIds.length === 0) return;

    setIsSaving(true);
    try {
      const headers = await getAuthHeaders();
      for (const studentId of targetIds) {
        const sub = mergedSubmissions.find((s) => s.studentId === studentId);
        if (!sub) continue;
        const edit = getStudentEffectiveEdit(sub);
        const grade = typeof edit.totalGrade === 'number' ? edit.totalGrade : 0;

        const res = await fetch(
          `${env.API_BASE_URL}/classroom/assignments/${assignmentId}/submissions/${studentId}/grade`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...headers,
            },
            body: JSON.stringify({
              submissionId: sub.submissionId,
              draftGrade: grade,
              rubricBreakdown: edit.rubricBreakdown,
              overallFeedback: edit.overallFeedback,
            }),
          }
        );

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Failed to save draft grade for ${sub.studentName}: ${errText}`);
        }

        setLocalEditsMap((prev) => {
          const next = { ...prev };
          if (next[studentId]) {
            next[studentId] = { ...next[studentId], dirty: false };
          }
          return next;
        });
      }
    } catch (err: any) {
      console.error('Save grade error:', err);
      alert(err.message || 'Failed to save draft grade');
    } finally {
      setIsSaving(false);
    }
  };

  // Return submissions for target studentIds (saves draft first if dirty or graded, then returns)
  const handleReturnStudents = async (studentIds: string[]) => {
    const targetIds = studentIds.length > 0 ? studentIds : selectedStudentId ? [selectedStudentId] : [];
    if (targetIds.length === 0) return;

    setIsReturning(true);
    try {
      // Save draft grades first so any unsaved scores/feedback are persisted
      await handleSaveDraftStudents(targetIds);

      const headers = await getAuthHeaders();
      const res = await fetch(`${env.API_BASE_URL}/classroom/assignments/${assignmentId}/return`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          studentIds: targetIds,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to return submissions: ${errText}`);
      }
    } catch (err: any) {
      console.error('Return submission error:', err);
      alert(err.message || 'Failed to return submission');
    } finally {
      setIsReturning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 h-full flex items-center justify-center bg-[#0d1117] text-gray-400">
        Loading live assignment workspace from Google Classroom...
      </div>
    );
  }

  if (error || !mergedAssignment) {
    return (
      <div className="flex-1 h-full flex items-center justify-center bg-[#0d1117] text-red-400 p-6">
        <div>
          <p className="font-semibold text-base mb-1">Failed to load live assignment workspace</p>
          <p className="text-sm text-gray-400">{error || 'Assignment not found in Google Classroom.'}</p>
        </div>
      </div>
    );
  }

  const activeEffectiveEdit = activeSubmission ? getStudentEffectiveEdit(activeSubmission) : null;

  return (
    <div className="flex-1 h-full flex overflow-hidden">
      {/* Zone A: Student Roster (22%) */}
      <StudentRosterZone
        assignment={mergedAssignment}
        submissions={mergedSubmissions}
        selectedStudentId={selectedStudentId}
        checkedStudentIds={checkedStudentIds}
        onToggleCheckStudent={(studentId) => {
          setCheckedStudentIds((prev) =>
            prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
          );
        }}
        onSelectStudent={(id) => onSelectStudent(id)}
        onSyncClassroom={handleSyncClassroom}
        onSaveDraftStudents={handleSaveDraftStudents}
        onReturnStudents={handleReturnStudents}
        onUpdateStudentScore={handleUpdateStudentScore}
        getStudentEffectiveEdit={getStudentEffectiveEdit}
        isSyncing={isSyncing}
        isSaving={isSaving}
        isReturning={isReturning}
      />

      {/* Zone B: Submission Preview Canvas with Rubric Breakdown at the bottom */}
      <SubmissionPreviewZone submission={activeSubmission}>
        <RubricMarkingZone
          assignment={mergedAssignment}
          submission={activeSubmission}
          rubricBreakdown={activeEffectiveEdit?.rubricBreakdown || []}
          overallFeedback={activeEffectiveEdit?.overallFeedback || ''}
          onUpdateRubricAndFeedback={(breakdown, feedback, newTotalScore) => {
            if (activeSubmission) {
              handleUpdateStudentRubricAndFeedback(activeSubmission.studentId, breakdown, feedback, newTotalScore);
            }
          }}
        />
      </SubmissionPreviewZone>
    </div>
  );
};
