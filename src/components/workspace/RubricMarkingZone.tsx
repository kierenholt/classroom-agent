import React, { useState } from 'react';
import { Edit3, Plus } from 'lucide-react';
import { AssignmentDoc, StudentSubmissionDoc, CriterionEvaluation } from '../../types/classroom';
import { RubricEditModal } from './RubricEditModal';

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
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleCriterionScoreChange = (criterionId: string, score: number) => {
    const exists = rubricBreakdown.some((item) => item.criterionId === criterionId);
    const updated = exists
      ? rubricBreakdown.map((item) =>
          item.criterionId === criterionId ? { ...item, score } : item
        )
      : [...rubricBreakdown, { criterionId, score, comment: '' }];

    // Sum rubric scores to total grade
    const sum = updated.reduce((acc, curr) => acc + (Number(curr.score) || 0), 0);
    onUpdateRubricAndFeedback(updated, overallFeedback, sum);
  };

  return (
    <div className="w-full border-t border-[#333842] bg-[#1A1D21] text-xs select-none max-h-[45%] flex flex-col shrink-0 overflow-hidden">

      {/* Scrollable Rubric Section */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Rubric Breakdown */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-gray-300 uppercase tracking-wider text-[10px]">
              Rubric Criteria
            </span>
            {assignment.rubric?.criteria && assignment.rubric.criteria.length > 0 && (
              <button
                type="button"
                data-testid="edit-rubric-button"
                onClick={() => setIsModalOpen(true)}
                className="flex items-center space-x-1 text-[11px] font-medium text-[#D4AF37] hover:text-[#f3e5ab] hover:bg-[#D4AF37]/10 px-2 py-0.5 rounded transition-colors"
              >
                <Edit3 className="w-3 h-3" />
                <span>Edit Rubric</span>
              </button>
            )}
          </div>

          <div data-testid="rubric-breakdown-list" className="space-y-2">
            {(!assignment.rubric?.criteria || assignment.rubric.criteria.length === 0) ? (
              <div className="p-3 bg-[#121316] rounded border border-dashed border-[#333842] text-center text-gray-500 space-y-2">
                <p>No rubric configured for this assignment.</p>
                <div className="flex items-center justify-center space-x-2">
                  <button
                    type="button"
                    data-testid="create-rubric-button"
                    onClick={() => setIsModalOpen(true)}
                    className="inline-flex items-center space-x-1 px-3 py-1 bg-[#D4AF37] text-black font-semibold text-xs rounded hover:bg-[#c29d2b] transition-colors shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Rubric</span>
                  </button>
                </div>
                <p className="text-[11px] text-[#D4AF37]">
                  Or ask the Co-Pilot in the right pane: &quot;Generate a grading rubric&quot;
                </p>
              </div>
            ) : (
              assignment.rubric.criteria.map((crit) => {
                const evaluation = rubricBreakdown.find((b) => b.criterionId === crit.id);
                const score = evaluation?.score ?? 0;

                return (
                  <div
                    key={crit.id}
                    data-testid={`rubric-criterion-${crit.id}`}
                    className="p-2.5 bg-[#121316] border border-[#333842] rounded space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-200">{crit.title}</span>
                      <div className="flex items-center space-x-1">
                        <input
                          type="number"
                          data-testid={`criterion-score-input-${crit.id}`}
                          value={score}
                          disabled={!submission}
                          onChange={(e) => handleCriterionScoreChange(crit.id, Number(e.target.value))}
                          min={0}
                          max={crit.maxPoints}
                          className="w-12 bg-[#22262C] border border-[#333842] rounded px-1.5 py-0.5 text-xs font-mono text-[#F3E5AB] text-right focus:outline-none focus:border-[#D4AF37] disabled:opacity-50"
                        />
                        <span className="text-gray-500 font-mono text-[10px]">/ {crit.maxPoints}</span>
                      </div>
                    </div>

                    {crit.description && (
                      <p className="text-[11px] text-gray-400">{crit.description}</p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Rubric Edit / Create Modal */}
      <RubricEditModal
        isOpen={isModalOpen}
        assignmentId={assignment.id}
        initialRubric={assignment.rubric}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};

