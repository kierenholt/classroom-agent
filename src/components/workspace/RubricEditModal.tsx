import React, { useState, useEffect, useMemo } from 'react';
import { X, Plus, Trash2, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { AssignmentRubric, RubricCriterion } from '../../types/classroom';
import { useAuth } from '../../context/AuthContext';
import { env } from '../../config/env';

export interface RubricEditModalProps {
  isOpen: boolean;
  assignmentId: string;
  initialRubric?: AssignmentRubric;
  onClose: () => void;
  onSaved?: (rubric: AssignmentRubric, maxPoints: number) => void;
}

interface EditableCriterion {
  id: string;
  title: string;
  maxPoints: number | string;
  description: string;
}

export const RubricEditModal: React.FC<RubricEditModalProps> = ({
  isOpen,
  assignmentId,
  initialRubric,
  onClose,
  onSaved,
}) => {
  const { getAuthHeaders } = useAuth();
  const [title, setTitle] = useState('Grading Rubric');
  const [criteria, setCriteria] = useState<EditableCriterion[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setValidationError(null);
      if (initialRubric && initialRubric.criteria && initialRubric.criteria.length > 0) {
        setTitle(initialRubric.title || 'Grading Rubric');
        setCriteria(
          initialRubric.criteria.map((c: RubricCriterion) => ({
            id: c.id,
            title: c.title,
            maxPoints: c.maxPoints,
            description: c.description || '',
          }))
        );
      } else {
        setTitle('Grading Rubric');
        // Start with one blank criterion card ready to fill in
        setCriteria([
          {
            id: `crit_${Date.now()}`,
            title: '',
            maxPoints: 10,
            description: '',
          },
        ]);
      }
    }
  }, [isOpen, initialRubric]);

  const totalPoints = useMemo(() => {
    return criteria.reduce((sum, c) => sum + (Number(c.maxPoints) || 0), 0);
  }, [criteria]);

  if (!isOpen) return null;

  const handleAddCriterion = () => {
    setCriteria((prev) => [
      ...prev,
      {
        id: `crit_${Date.now()}_${prev.length + 1}`,
        title: '',
        maxPoints: 10,
        description: '',
      },
    ]);
  };

  const handleDeleteCriterion = (index: number) => {
    if (criteria.length <= 1) {
      setValidationError('A rubric must contain at least one criterion.');
      return;
    }
    setValidationError(null);
    setCriteria((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleCriterionChange = (
    index: number,
    field: keyof EditableCriterion,
    value: any
  ) => {
    setValidationError(null);
    setCriteria((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setValidationError('Rubric title cannot be empty.');
      return;
    }

    if (criteria.length === 0) {
      setValidationError('A rubric must contain at least one criterion.');
      return;
    }

    for (let i = 0; i < criteria.length; i++) {
      const c = criteria[i];
      if (!c.title.trim()) {
        setValidationError(`Criterion #${i + 1} must have a title.`);
        return;
      }
      const pts = Number(c.maxPoints);
      if (Number.isNaN(pts) || pts <= 0) {
        setValidationError(`Criterion "${c.title}" must have points greater than 0.`);
        return;
      }
    }

    setIsSaving(true);
    setValidationError(null);

    try {
      const headers = await getAuthHeaders();
      const payload = {
        title: title.trim(),
        criteria: criteria.map((c) => ({
          id: c.id,
          title: c.title.trim(),
          maxPoints: Number(c.maxPoints),
          description: c.description.trim(),
        })),
      };

      const res = await fetch(`${env.API_BASE_URL}/classroom/assignments/${assignmentId}/rubric`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || 'Failed to save rubric');
      }

      const data = await res.json();
      if (onSaved) {
        onSaved(data.rubric, data.maxPoints);
      }
      onClose();
    } catch (err: any) {
      console.error('Error saving rubric:', err);
      setValidationError(err.message || 'Failed to save rubric. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      data-testid="rubric-edit-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="bg-[#1A1D21] border border-[#333842] rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#333842] bg-[#121316]">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-[#D4AF37]" />
            <h2 className="text-sm font-semibold text-gray-200">
              {initialRubric && initialRubric.criteria && initialRubric.criteria.length > 0
                ? 'Edit Grading Rubric'
                : 'Create Grading Rubric'}
            </h2>
          </div>
          <button
            data-testid="close-rubric-modal-button"
            onClick={onClose}
            disabled={isSaving}
            className="text-gray-400 hover:text-white p-1 rounded-md hover:bg-[#22262C] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {validationError && (
            <div
              data-testid="rubric-validation-error"
              className="p-3 bg-red-950/40 border border-red-500/50 rounded-lg flex items-center space-x-2 text-red-300"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Rubric Title */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
              Rubric Title
            </label>
            <input
              type="text"
              data-testid="rubric-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Essay Evaluation Rubric"
              className="w-full bg-[#121316] border border-[#333842] rounded-md px-3 py-2 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          {/* Criteria List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">
                Criteria ({criteria.length})
              </label>
              <div
                data-testid="rubric-total-points"
                className="text-xs font-mono font-medium text-[#F3E5AB] bg-[#22262C] px-2.5 py-1 rounded border border-[#333842]"
              >
                Total: <span className="font-bold text-[#D4AF37]">{totalPoints}</span> pts
              </div>
            </div>

            <div className="space-y-3">
              {criteria.map((criterion, index) => (
                <div
                  key={criterion.id || index}
                  data-testid={`rubric-criterion-card-${index}`}
                  className="p-3.5 bg-[#121316] border border-[#333842] rounded-lg space-y-2.5 relative group"
                >
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-500 font-mono text-[10px] w-4">
                      #{index + 1}
                    </span>
                    <input
                      type="text"
                      data-testid={`criterion-title-input-${index}`}
                      value={criterion.title}
                      onChange={(e) => handleCriterionChange(index, 'title', e.target.value)}
                      placeholder="Criterion title (e.g. Structure & Thesis)"
                      className="flex-1 bg-[#1A1D21] border border-[#333842] rounded px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-[#D4AF37]"
                    />
                    <div className="flex items-center space-x-1 shrink-0">
                      <input
                        type="number"
                        data-testid={`criterion-points-input-${index}`}
                        value={criterion.maxPoints}
                        onChange={(e) =>
                          handleCriterionChange(index, 'maxPoints', Number(e.target.value))
                        }
                        min={1}
                        className="w-14 bg-[#1A1D21] border border-[#333842] rounded px-2 py-1.5 text-xs font-mono text-[#F3E5AB] text-right focus:outline-none focus:border-[#D4AF37]"
                      />
                      <span className="text-gray-400 font-mono text-[11px]">pts</span>
                    </div>
                    {criteria.length > 1 && (
                      <button
                        type="button"
                        data-testid={`delete-criterion-button-${index}`}
                        onClick={() => handleDeleteCriterion(index)}
                        title="Delete criterion"
                        className="text-gray-500 hover:text-red-400 p-1.5 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div>
                    <textarea
                      data-testid={`criterion-desc-input-${index}`}
                      value={criterion.description}
                      onChange={(e) => handleCriterionChange(index, 'description', e.target.value)}
                      placeholder="Description of expectations or performance standard (optional)..."
                      rows={2}
                      className="w-full bg-[#1A1D21] border border-[#333842] rounded p-2 text-xs text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#D4AF37] resize-none"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Add Criterion Button */}
            <button
              type="button"
              data-testid="add-criterion-button"
              onClick={handleAddCriterion}
              className="w-full py-2 border border-dashed border-[#333842] hover:border-[#D4AF37]/50 rounded-lg text-xs font-medium text-gray-300 hover:text-[#D4AF37] hover:bg-[#D4AF37]/5 transition-all flex items-center justify-center space-x-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Criterion</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-[#333842] bg-[#121316]">
          <span className="text-[11px] text-gray-400">
            Assignment max points will be updated to{' '}
            <span className="font-semibold text-[#F3E5AB]">{totalPoints} pts</span>
          </span>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              data-testid="cancel-rubric-modal-button"
              onClick={onClose}
              disabled={isSaving}
              className="px-3.5 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-[#22262C] border border-[#333842] rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="save-rubric-modal-button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-1.5 text-xs font-semibold text-black bg-[#D4AF37] hover:bg-[#c29d2b] disabled:opacity-50 rounded-md transition-colors flex items-center space-x-1.5 shadow-sm"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Rubric</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
