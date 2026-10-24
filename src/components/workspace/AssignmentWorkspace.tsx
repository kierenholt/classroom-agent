import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { doc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import {
  AssignmentDoc,
  AssignmentRubric,
  StudentSubmissionDoc,
  StudentEvaluationSidecarDoc,
  CriterionEvaluation,
  ClassroomCoursework,
} from '../../types/classroom';
import { StudentRosterZone } from './StudentRosterZone';
import { SubmissionPreviewZone } from './SubmissionPreviewZone';
import { RubricMarkingZone } from './RubricMarkingZone';
import { EditAssignmentModal } from './EditAssignmentModal';
import { ViewAssignmentModal } from './ViewAssignmentModal';
import { useAuth } from '../../context/AuthContext';
import { useClassroomData } from '../../context/ClassroomDataContext';
import { env } from '../../config/env';

interface AssignmentWorkspaceProps {
  assignmentId: string;
  selectedStudentId: string | null;
  onSelectStudent: (studentId: string | null) => void;
  onChangeCheckedStudents?: (studentIds: string[]) => void;
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
  onChangeCheckedStudents,
  onAssignmentLoaded,
}) => {
  const { getAuthHeaders, clearGoogleAccessToken } = useAuth();
  const [liveAssignment, setLiveAssignment] = useState<AssignmentDoc | null>(null);
  const [liveSubmissions, setLiveSubmissions] = useState<StudentSubmissionDoc[]>([]);
  const [sidecarRubric, setSidecarRubric] = useState<AssignmentRubric | undefined>(undefined);
  const [sidecarMaxPoints, setSidecarMaxPoints] = useState<number | undefined>(undefined);
  const [evaluationsMap, setEvaluationsMap] = useState<Record<string, StudentEvaluationSidecarDoc>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

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
          if (typeof data.maxPoints === 'number') {
            setSidecarMaxPoints(data.maxPoints);
          }
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

      const isReturned =
        sidecar.classroomSyncStatus === 'RETURNED' ||
        sidecar.classroomSyncStatus === 'APPROVED' ||
        Boolean(sidecar.approvedAt) ||
        liveSub.state === 'RETURNED';
      const feedbackDocId = sidecar.feedbackDocId || liveSub.feedbackDocId;
      const feedbackDocUrl = sidecar.feedbackDocUrl || liveSub.feedbackDocUrl;

      const baseAttachments = [...(liveSub.attachments || [])];
      const hasFeedbackAttachment = feedbackDocId
        ? baseAttachments.some((att) => att.driveFileId === feedbackDocId || att.id === feedbackDocId)
        : false;
      const mergedAttachments =
        feedbackDocId && !hasFeedbackAttachment
          ? [
              ...baseAttachments,
              {
                id: feedbackDocId,
                title: `Feedback - ${liveAssignment?.title || 'Classroom Assignment'} - ${liveSub.studentName}`,
                type: 'GOOGLE_DOC' as const,
                driveFileId: feedbackDocId,
                alternateLink: feedbackDocUrl || `https://docs.google.com/document/d/${feedbackDocId}/edit`,
              },
            ]
          : baseAttachments;

      return {
        ...liveSub,
        state: isReturned ? 'RETURNED' : liveSub.state,
        attachments: mergedAttachments,
        draftGrade:
          sidecar.draftGrade !== undefined && sidecar.draftGrade !== null
            ? sidecar.draftGrade
            : liveSub.draftGrade,
        assignedGrade:
          sidecar.assignedGrade !== undefined && sidecar.assignedGrade !== null
            ? sidecar.assignedGrade
            : liveSub.assignedGrade,
        rubricBreakdown: sidecar.rubricBreakdown || [],
        overallFeedback: sidecar.overallFeedback || '',
        comments: sidecar.comments || [],
        classroomSyncStatus: sidecar.classroomSyncStatus || liveSub.classroomSyncStatus,
        classroomSyncError: sidecar.classroomSyncError || liveSub.classroomSyncError,
        feedbackDocId,
        feedbackDocUrl,
        approvedAt: sidecar.approvedAt || liveSub.approvedAt,
        updatedAt: sidecar.updatedAt || liveSub.updatedAt,
      };
    });
  }, [liveSubmissions, evaluationsMap, liveAssignment?.title]);

  // 4. Merge Live Assignment with Sidecar Rubric & Dynamic Submission Stats
  const mergedAssignment: AssignmentDoc | null = useMemo(() => {
    if (!liveAssignment) return null;
    const turnedIn = mergedSubmissions.filter((s) => s.state === 'TURNED_IN').length;
    const returned = mergedSubmissions.filter((s) => s.state === 'RETURNED').length;
    const draftGraded = mergedSubmissions.filter((s) => s.draftGrade !== undefined && s.state !== 'RETURNED').length;

    const effectiveRubric = sidecarRubric || liveAssignment.rubric;
    const rubricMaxPoints =
      effectiveRubric?.criteria && effectiveRubric.criteria.length > 0
        ? effectiveRubric.criteria.reduce((sum, c) => sum + (Number(c.maxPoints) || 0), 0)
        : undefined;

    return {
      ...liveAssignment,
      maxPoints:
        rubricMaxPoints !== undefined && rubricMaxPoints > 0
          ? rubricMaxPoints
          : sidecarMaxPoints !== undefined
            ? sidecarMaxPoints
            : liveAssignment.maxPoints,
      rubric: effectiveRubric,
      submissionStats: {
        total: mergedSubmissions.length,
        turnedIn,
        draftGraded,
        returned,
        missing: Math.max(0, mergedSubmissions.length - turnedIn - returned),
      },
    };
  }, [liveAssignment, sidecarRubric, sidecarMaxPoints, mergedSubmissions]);

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
        const evalDoc = evaluationsMap[studentId];
        const isEvalReturned =
          evalDoc?.classroomSyncStatus === 'RETURNED' ||
          evalDoc?.classroomSyncStatus === 'APPROVED' ||
          Boolean(evalDoc?.approvedAt);
        if (next[studentId] && (!next[studentId].dirty || isEvalReturned)) {
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

  // Return submissions for target studentIds (saves any dirty edits and returns with effective grades)
  const handleReturnStudents = async (studentIds: string[]) => {
    const targetIds = studentIds.length > 0 ? studentIds : selectedStudentId ? [selectedStudentId] : [];
    if (targetIds.length === 0) return;

    setIsReturning(true);
    try {
      const dirtyIds = targetIds.filter((id) => localEditsMap[id]?.dirty);
      if (dirtyIds.length > 0) {
        await handleSaveDraftStudents(dirtyIds);
      }

      const grades: Record<string, number> = {};
      for (const studentId of targetIds) {
        const sub = mergedSubmissions.find((s) => s.studentId === studentId);
        if (!sub) continue;
        const edit = getStudentEffectiveEdit(sub);
        if (typeof edit.totalGrade === 'number' && !Number.isNaN(edit.totalGrade)) {
          grades[studentId] = edit.totalGrade;
        }
      }

      const headers = await getAuthHeaders();
      const res = await fetch(`${env.API_BASE_URL}/classroom/assignments/${assignmentId}/return`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          studentIds: targetIds,
          grades,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to return submissions: ${errText}`);
      }

      setLocalEditsMap((prev) => {
        const next = { ...prev };
        for (const id of targetIds) {
          delete next[id];
        }
        return next;
      });
    } catch (err: any) {
      console.error('Return submission error:', err);
      alert(err.message || 'Failed to return submission');
    } finally {
      setIsReturning(false);
    }
  };

  const handleAssignmentUpdated = useCallback(
    (updated: ClassroomCoursework) => {
      setLiveAssignment((prev) => {
        if (!prev) return null;
        const updatedDueDateStr = updated.dueDate
          ? `${updated.dueDate.year}-${String(updated.dueDate.month).padStart(2, '0')}-${String(updated.dueDate.day).padStart(2, '0')}`
          : undefined;
        return {
          ...prev,
          title: updated.title,
          description: updated.description,
          maxPoints: updated.maxPoints ?? prev.maxPoints,
          dueDate: updatedDueDateStr,
        };
      });

      if (onAssignmentLoadedRef.current && liveAssignment) {
        onAssignmentLoadedRef.current({
          courseName: liveAssignment.courseName,
          assignmentTitle: updated.title,
        });
      }
    },
    [liveAssignment]
  );

  if (loading) {
    return (
      <div className="flex-1 h-full flex items-center justify-center bg-[#121316] text-gray-400">
        Loading live assignment workspace from Google Classroom...
      </div>
    );
  }

  if (error || !mergedAssignment) {
    return (
      <div className="flex-1 h-full flex items-center justify-center bg-[#121316] text-red-400 p-6">
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
          setCheckedStudentIds((prev) => {
            const next = prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId];
            onChangeCheckedStudents?.(next);
            return next;
          });
        }}
        onSelectStudent={(id) => onSelectStudent(id)}
        onSyncClassroom={handleSyncClassroom}
        onOpenViewAssignment={() => setIsViewModalOpen(true)}
        onOpenEditAssignment={() => setIsEditModalOpen(true)}
        onSaveDraftStudents={handleSaveDraftStudents}
        onReturnStudents={handleReturnStudents}
        onUpdateStudentScore={handleUpdateStudentScore}
        getStudentEffectiveEdit={getStudentEffectiveEdit}
        isSyncing={isSyncing}
        isSaving={isSaving}
        isReturning={isReturning}
      />

      {/* Zone B: Submission Preview Canvas with Rubric Breakdown at the bottom */}
      <SubmissionPreviewZone submission={activeSubmission} allSubmissions={mergedSubmissions}>
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

      {/* View Assignment Modal (Rendered Markdown) */}
      {mergedAssignment && (
        <ViewAssignmentModal
          isOpen={isViewModalOpen}
          onClose={() => setIsViewModalOpen(false)}
          assignment={mergedAssignment}
          onOpenEdit={() => {
            setIsViewModalOpen(false);
            setIsEditModalOpen(true);
          }}
        />
      )}

      {/* Edit Assignment Modal */}
      {mergedAssignment && (
        <EditAssignmentModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          assignment={mergedAssignment}
          onAssignmentUpdated={handleAssignmentUpdated}
        />
      )}
    </div>
  );
};
