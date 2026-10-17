import React, { useState, useEffect } from 'react';
import { Save, Send, AlertTriangle, CheckCircle, Clock, BookOpen, MessageSquare } from 'lucide-react';
import { AssignmentDoc, StudentSubmissionDoc, CriterionEvaluation } from '../../types/classroom';

interface RubricMarkingZoneProps {
  assignment: AssignmentDoc;
  submission: StudentSubmissionDoc | null;
  onSaveDraftGrade: (draftGrade: number, rubricBreakdown: CriterionEvaluation[], overallFeedback: string) => Promise<void>;
  onReturnSubmission: (assignedGrade: number, rubricBreakdown: CriterionEvaluation[], overallFeedback: string) => Promise<void>;
  isSaving: boolean;
  isReturning: boolean;
}

export const RubricMarkingZone: React.FC<RubricMarkingZoneProps> = ({
  assignment,
  submission,
  onSaveDraftGrade,
  onReturnSubmission,
  isSaving,
  isReturning,
}) => {
  const [totalGrade, setTotalGrade] = useState<number | ''>('');
  const [rubricBreakdown, setRubricBreakdown] = useState<CriterionEvaluation[]>([]);
  const [overallFeedback, setOverallFeedback] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Sync internal state when selected submission changes
  useEffect(() => {
    if (submission) {
      setTotalGrade(submission.draftGrade ?? submission.assignedGrade ?? '');
      setOverallFeedback(submission.overallFeedback || '');

      // Initialize rubric scores from assignment rubric or submission breakdown
      const initialBreakdown: CriterionEvaluation[] = (assignment.rubric?.criteria || []).map((crit) => {
        const existing = submission.rubricBreakdown?.find((b) => b.criterionId === crit.id);
        return existing || { criterionId: crit.id, score: 0, comment: '' };
      });
      setRubricBreakdown(initialBreakdown);
      setHasUnsavedChanges(false);
    } else {
      setTotalGrade('');
      setOverallFeedback('');
      setRubricBreakdown([]);
      setHasUnsavedChanges(false);
    }
  }, [submission, assignment]);

  if (!submission) {
    return (
      <div className="w-[30%] h-full flex flex-col items-center justify-center bg-[#161b22] text-gray-500 text-sm select-none p-6 text-center">
        <BookOpen className="w-10 h-10 mb-2 text-gray-600" />
        <p className="font-medium">No Student Selected</p>
        <p className="text-xs text-gray-600 mt-1">Select a student from Zone A to view rubric criteria and grade work.</p>
      </div>
    );
  }

  const handleCriterionScoreChange = (criterionId: string, score: number) => {
    const updated = rubricBreakdown.map((item) =>
      item.criterionId === criterionId ? { ...item, score } : item
    );
    setRubricBreakdown(updated);

    // Sum rubric scores to total grade
    const sum = updated.reduce((acc, curr) => acc + (Number(curr.score) || 0), 0);
    setTotalGrade(sum);
    setHasUnsavedChanges(true);
  };

  const handleCriterionCommentChange = (criterionId: string, comment: string) => {
    const updated = rubricBreakdown.map((item) =>
      item.criterionId === criterionId ? { ...item, comment } : item
    );
    setRubricBreakdown(updated);
    setHasUnsavedChanges(true);
  };

  const handleSaveDraft = async () => {
    const grade = typeof totalGrade === 'number' ? totalGrade : 0;
    await onSaveDraftGrade(grade, rubricBreakdown, overallFeedback);
    setHasUnsavedChanges(false);
  };

  const handleReturn = async () => {
    const grade = typeof totalGrade === 'number' ? totalGrade : 0;
    await onReturnSubmission(grade, rubricBreakdown, overallFeedback);
    setHasUnsavedChanges(false);
  };

  return (
    <div className="w-[30%] h-full flex flex-col bg-[#161b22] text-xs select-none">
      {/* Grade Header & Classroom Sync Bar */}
      <div data-testid="grading-header" className="p-3 border-b border-[#30363d] bg-[#1a202c]/50 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Grading & Feedback
          </span>
          {/* Sync Status Badge */}
          <div data-testid="classroom-sync-status">
            {hasUnsavedChanges ? (
              <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/40 text-[10px]">
                <Clock className="w-2.5 h-2.5" />
                <span>Unsaved Changes</span>
              </span>
            ) : submission.state === 'RETURNED' ? (
              <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 text-[10px]">
                <CheckCircle className="w-2.5 h-2.5" />
                <span>Returned to Student</span>
              </span>
            ) : submission.classroomSyncStatus === 'LOCAL_ONLY_PERMISSION_DENIED' ? (
              <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/40 text-[10px]" title="Saved locally in Classroom Agent. Coursework was created outside this app.">
                <AlertTriangle className="w-2.5 h-2.5" />
                <span>Local Only</span>
              </span>
            ) : submission.draftGrade !== undefined ? (
              <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/40 text-[10px]">
                <CheckCircle className="w-2.5 h-2.5" />
                <span>Draft Saved</span>
              </span>
            ) : (
              <span className="text-gray-500 text-[10px]">Not Graded</span>
            )}
          </div>
        </div>

        {/* Total Score Input */}
        <div className="flex items-center space-x-2">
          <label className="text-gray-300 font-medium">Total Score:</label>
          <div className="flex items-center space-x-1">
            <input
              type="number"
              data-testid="total-grade-input"
              value={totalGrade}
              onChange={(e) => {
                const val = e.target.value === '' ? '' : Number(e.target.value);
                setTotalGrade(val);
                setHasUnsavedChanges(true);
              }}
              min={0}
              max={assignment.maxPoints}
              className="w-16 bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-sm font-mono text-white text-right focus:outline-none focus:border-purple-500"
            />
            <span className="text-gray-400 font-mono text-sm">/ {assignment.maxPoints} pts</span>
          </div>
        </div>

        {/* Action Buttons: Save Draft & Return */}
        <div className="flex items-center space-x-2 pt-1">
          <button
            data-testid="save-draft-grade-button"
            onClick={handleSaveDraft}
            disabled={isSaving || totalGrade === ''}
            className="flex-1 flex items-center justify-center space-x-1 py-1 px-2 rounded bg-[#21262d] hover:bg-[#30363d] text-gray-200 border border-[#30363d] transition-colors disabled:opacity-40"
          >
            <Save className="w-3 h-3 text-purple-400" />
            <span>{isSaving ? 'Saving...' : 'Save Draft'}</span>
          </button>

          <button
            data-testid="return-submission-button"
            onClick={handleReturn}
            disabled={isReturning || totalGrade === ''}
            className="flex-1 flex items-center justify-center space-x-1 py-1 px-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors disabled:opacity-40"
          >
            <Send className="w-3 h-3" />
            <span>{isReturning ? 'Returning...' : 'Return'}</span>
          </button>
        </div>
      </div>

      {/* Scrollable Rubric & Comments Section */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Rubric Breakdown */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-gray-300 uppercase tracking-wider text-[10px]">
              Rubric Criteria
            </span>
            <button
              data-testid="edit-rubric-button"
              className="text-[10px] text-purple-400 hover:underline"
            >
              {assignment.rubric?.criteria?.length ? 'Active Rubric' : 'No Rubric Set'}
            </button>
          </div>

          <div data-testid="rubric-breakdown-list" className="space-y-2">
            {(!assignment.rubric?.criteria || assignment.rubric.criteria.length === 0) ? (
              <div className="p-3 bg-[#0d1117] rounded border border-dashed border-gray-700 text-center text-gray-500">
                <p>No rubric configured for this assignment.</p>
                <p className="mt-1 text-[11px] text-purple-400">
                  Ask the Co-Pilot in the right pane: &quot;Generate a grading rubric&quot;
                </p>
              </div>
            ) : (
              assignment.rubric.criteria.map((crit) => {
                const evaluation = rubricBreakdown.find((b) => b.criterionId === crit.id);
                const score = evaluation?.score ?? 0;
                const comment = evaluation?.comment ?? '';

                return (
                  <div
                    key={crit.id}
                    data-testid={`rubric-criterion-${crit.id}`}
                    className="p-2.5 bg-[#0d1117] border border-[#30363d] rounded space-y-2"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-semibold text-gray-200">{crit.title}</span>
                      <div className="flex items-center space-x-1">
                        <input
                          type="number"
                          data-testid={`criterion-score-input-${crit.id}`}
                          value={score}
                          onChange={(e) => handleCriterionScoreChange(crit.id, Number(e.target.value))}
                          min={0}
                          max={crit.maxPoints}
                          className="w-12 bg-[#161b22] border border-[#30363d] rounded px-1.5 py-0.5 text-xs font-mono text-purple-300 text-right focus:outline-none focus:border-purple-500"
                        />
                        <span className="text-gray-500 font-mono text-[10px]">/ {crit.maxPoints}</span>
                      </div>
                    </div>

                    {crit.description && (
                      <p className="text-[11px] text-gray-400">{crit.description}</p>
                    )}

                    <textarea
                      data-testid={`criterion-comment-input-${crit.id}`}
                      value={comment}
                      onChange={(e) => handleCriterionCommentChange(crit.id, e.target.value)}
                      placeholder={`Feedback for ${crit.title}...`}
                      rows={2}
                      className="w-full bg-[#161b22] border border-[#30363d] rounded p-1.5 text-xs text-gray-300 placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Overall Feedback Textarea */}
        <div data-testid="overall-feedback-section" className="space-y-1.5">
          <label className="font-semibold text-gray-300 uppercase tracking-wider text-[10px]">
            Overall Summary Feedback
          </label>
          <textarea
            data-testid="overall-feedback-input"
            value={overallFeedback}
            onChange={(e) => {
              setOverallFeedback(e.target.value);
              setHasUnsavedChanges(true);
            }}
            placeholder="Write overall student feedback or let the agent generate it..."
            rows={4}
            className="w-full bg-[#0d1117] border border-[#30363d] rounded p-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none select-text"
          />
        </div>

        {/* Comments Feed */}
        <div className="space-y-2">
          <div className="flex items-center space-x-1.5 text-gray-400 font-semibold uppercase tracking-wider text-[10px]">
            <MessageSquare className="w-3 h-3" />
            <span>Synced Submission Comments</span>
          </div>

          <div data-testid="submission-comments-list" className="space-y-1.5">
            {(!submission.comments || submission.comments.length === 0) ? (
              <div className="text-gray-500 text-[11px] italic">No comments yet.</div>
            ) : (
              submission.comments.map((c) => (
                <div key={c.id} className="p-2 bg-[#0d1117] rounded border border-gray-800 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-[10px] font-semibold px-1 rounded ${
                        c.author === 'Agent' ? 'bg-purple-900/50 text-purple-300' : 'bg-blue-900/50 text-blue-300'
                      }`}
                    >
                      {c.author}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-gray-300 whitespace-pre-wrap select-text">{c.content}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
