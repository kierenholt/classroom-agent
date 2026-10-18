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
  const { getAuthHeaders } = useAuth();
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
    [assignmentId, getAuthHeaders]
  );

  useEffect(() => {
    fetchLiveWorkspace(false);
  }, [fetchLiveWorkspace]);

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

  // Refresh live roster & submissions from Google Classroom
  const handleSyncClassroom = async () => {
    setIsSyncing(true);
    try {
      await fetchLiveWorkspace(true);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveDraftGrade = async (
    draftGrade: number,
    rubricBreakdown: CriterionEvaluation[],
    overallFeedback: string
  ) => {
    if (!activeSubmission) return;
    setIsSaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `${env.API_BASE_URL}/classroom/assignments/${assignmentId}/submissions/${activeSubmission.studentId}/grade`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: JSON.stringify({
            submissionId: activeSubmission.submissionId,
            draftGrade,
            rubricBreakdown,
            overallFeedback,
          }),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to save draft grade: ${errText}`);
      }
    } catch (err: any) {
      console.error('Save grade error:', err);
      alert(err.message || 'Failed to save draft grade');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReturnSubmission = async (
    assignedGrade: number,
    rubricBreakdown: CriterionEvaluation[],
    overallFeedback: string
  ) => {
    if (!activeSubmission) return;
    setIsReturning(true);
    try {
      const headers = await getAuthHeaders();
      // First save the grade/feedback
      await handleSaveDraftGrade(assignedGrade, rubricBreakdown, overallFeedback);

      // Then return the submission
      const res = await fetch(`${env.API_BASE_URL}/classroom/assignments/${assignmentId}/return`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          studentIds: [activeSubmission.studentId],
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to return submission: ${errText}`);
      }
    } catch (err: any) {
      console.error('Return submission error:', err);
      alert(err.message || 'Failed to return submission');
    } finally {
      setIsReturning(false);
    }
  };

  const handleReturnAllDrafts = async () => {
    const draftStudents = mergedSubmissions.filter((s) => s.draftGrade !== undefined && s.state !== 'RETURNED');
    if (draftStudents.length === 0) return;

    setIsReturning(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${env.API_BASE_URL}/classroom/assignments/${assignmentId}/return`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          studentIds: draftStudents.map((s) => s.studentId),
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Bulk return failed: ${errText}`);
      }
    } catch (err: any) {
      console.error('Bulk return error:', err);
      alert(err.message || 'Bulk return failed');
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

  return (
    <div className="flex-1 h-full flex overflow-hidden">
      {/* Zone A: Student Roster (22%) */}
      <StudentRosterZone
        assignment={mergedAssignment}
        submissions={mergedSubmissions}
        selectedStudentId={selectedStudentId}
        onSelectStudent={(id) => onSelectStudent(id)}
        onSyncClassroom={handleSyncClassroom}
        onReturnAllDrafts={handleReturnAllDrafts}
        isSyncing={isSyncing}
        isReturning={isReturning}
      />

      {/* Zone B: Submission Preview Canvas (48%) */}
      <SubmissionPreviewZone submission={activeSubmission} />

      {/* Zone C: Rubric Breakdown & Comments (30%) */}
      <RubricMarkingZone
        assignment={mergedAssignment}
        submission={activeSubmission}
        onSaveDraftGrade={handleSaveDraftGrade}
        onReturnSubmission={handleReturnSubmission}
        isSaving={isSaving}
        isReturning={isReturning}
      />
    </div>
  );
};
