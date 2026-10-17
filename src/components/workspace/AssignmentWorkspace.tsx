import React, { useState, useEffect } from 'react';
import { doc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { AssignmentDoc, StudentSubmissionDoc, CriterionEvaluation } from '../../types/classroom';
import { StudentRosterZone } from './StudentRosterZone';
import { SubmissionPreviewZone } from './SubmissionPreviewZone';
import { RubricMarkingZone } from './RubricMarkingZone';
import { useAuth } from '../../context/AuthContext';
import { env } from '../../config/env';

interface AssignmentWorkspaceProps {
  assignmentId: string;
  selectedStudentId: string | null;
  onSelectStudent: (studentId: string | null) => void;
}

export const AssignmentWorkspace: React.FC<AssignmentWorkspaceProps> = ({
  assignmentId,
  selectedStudentId,
  onSelectStudent,
}) => {
  const { getAuthHeaders } = useAuth();
  const [assignment, setAssignment] = useState<AssignmentDoc | null>(null);
  const [submissions, setSubmissions] = useState<StudentSubmissionDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isReturning, setIsReturning] = useState(false);

  // 1. Subscribe to Assignment Doc
  useEffect(() => {
    if (!assignmentId) return;
    const assignRef = doc(db, 'assignments', assignmentId);
    const unsubAssign = onSnapshot(
      assignRef,
      (snap) => {
        if (snap.exists()) {
          setAssignment({ id: snap.id, ...snap.data() } as AssignmentDoc);
        } else {
          setError(`Assignment document ${assignmentId} does not exist in Firestore.`);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to assignment doc:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    // 2. Subscribe to Submissions Collection
    const subsRef = collection(db, 'assignments', assignmentId, 'submissions');
    const unsubSubs = onSnapshot(
      subsRef,
      (snap) => {
        const list = snap.docs.map((d) => ({ ...d.data() } as StudentSubmissionDoc));
        setSubmissions(list);
      },
      (err) => {
        console.error('Error listening to submissions collection:', err);
      }
    );

    return () => {
      unsubAssign();
      unsubSubs();
    };
  }, [assignmentId]);

  // Selected student submission
  const activeSubmission = submissions.find((s) => s.studentId === selectedStudentId) || null;

  // Auto-select first student if none selected and submissions exist
  useEffect(() => {
    if (!selectedStudentId && submissions.length > 0) {
      onSelectStudent(submissions[0].studentId);
    }
  }, [submissions, selectedStudentId, onSelectStudent]);

  const handleSyncClassroom = async () => {
    if (!assignment) return;
    setIsSyncing(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${env.API_BASE_URL}/classroom/sync-assignment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          courseId: assignment.courseId,
          courseWorkId: assignment.courseWorkId,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Sync failed: ${errText}`);
      }
    } catch (err: any) {
      console.error('Failed to sync from Classroom:', err);
      alert(err.message || 'Sync from Classroom failed');
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
        `${env.API_BASE_URL}/assignments/${assignmentId}/submissions/${activeSubmission.studentId}/grade`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: JSON.stringify({
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
      const res = await fetch(`${env.API_BASE_URL}/assignments/${assignmentId}/return`, {
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
    const draftStudents = submissions.filter((s) => s.draftGrade !== undefined && s.state !== 'RETURNED');
    if (draftStudents.length === 0) return;

    setIsReturning(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${env.API_BASE_URL}/assignments/${assignmentId}/return`, {
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
        Loading assignment workspace...
      </div>
    );
  }

  if (error || !assignment) {
    return (
      <div className="flex-1 h-full flex items-center justify-center bg-[#0d1117] text-red-400 p-6">
        <div>
          <p className="font-semibold text-base mb-1">Failed to load assignment workspace</p>
          <p className="text-sm text-gray-400">{error || 'Assignment not found.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full flex overflow-hidden">
      {/* Zone A: Student Roster (22%) */}
      <StudentRosterZone
        assignment={assignment}
        submissions={submissions}
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
        assignment={assignment}
        submission={activeSubmission}
        onSaveDraftGrade={handleSaveDraftGrade}
        onReturnSubmission={handleReturnSubmission}
        isSaving={isSaving}
        isReturning={isReturning}
      />
    </div>
  );
};
