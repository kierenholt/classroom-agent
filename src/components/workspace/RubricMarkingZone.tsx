import React from 'react';
import { BookOpen } from 'lucide-react';
import { AssignmentDoc, StudentSubmissionDoc, CriterionEvaluation } from '../../types/classroom';

interface RubricMarkingZoneProps {
  assignment: AssignmentDoc;
  submission: StudentSubmissionDoc | null;
  rubricBreakdown: CriterionEvaluation[];
  overallFeedback?: string;
  onUpdateRubricAndFeedback: (
    rubricBreakdown: CriterionEvaluation[],
    overallFeedback: string,
    newTotalScore?: number
  ) => void;
}

export const RubricMarkingZone: React.FC<RubricMarkingZoneProps> = ({
  assignment,
  submission,
  rubricBreakdown,
  overallFeedback = '',
  onUpdateRubricAndFeedback,
}) => {
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

    // Sum rubric scores to total grade
    const sum = updated.reduce((acc, curr) => acc + (Number(curr.score) || 0), 0);
    onUpdateRubricAndFeedback(updated, overallFeedback, sum);
  };

  const handleCriterionCommentChange = (criterionId: string, comment: string) => {
    const updated = rubricBreakdown.map((item) =>
      item.criterionId === criterionId ? { ...item, comment } : item
    );
    onUpdateRubricAndFeedback(updated, overallFeedback);
  };

  return (
    <div className="w-[30%] h-full flex flex-col bg-[#161b22] text-xs select-none">

      {/* Scrollable Rubric Section */}
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
      </div>
    </div>
  );
};

