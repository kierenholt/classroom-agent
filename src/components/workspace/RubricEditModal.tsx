import React, { useState, useEffect, useMemo } from 'react';
import { X, Plus, Trash2, Loader2, Sparkles, AlertCircle, Copy, Award } from 'lucide-react';
import { AssignmentRubric, RubricCriterion, ClassroomCoursework } from '../../types/classroom';
import { useAuth } from '../../context/AuthContext';
import { useClassroomData } from '../../context/ClassroomDataContext';
import { env } from '../../config/env';

export interface RubricEditModalProps {
  isOpen: boolean;
  assignmentId: string;
  initialRubric?: AssignmentRubric;
  initialShowCopyPicker?: boolean;
  onClose: () => void;
  onSaved?: (rubric: AssignmentRubric, maxPoints: number) => void;
}

interface EditableCriterion {
  id: string;
  title: string;
  maxPoints: number | string;
  description: string;
}

export type RubricModalTab = 'create' | 'copy';

export const RubricEditModal: React.FC<RubricEditModalProps> = ({
  isOpen,
  assignmentId,
  initialRubric,
  initialShowCopyPicker = false,
  onClose,
  onSaved,
}) => {
  const { getAuthHeaders } = useAuth();
  const {
    courses,
    courseworkByCourseId,
    loadingCoursework,
    preloadAssignments,
    fetchCourseworkForCourse,
  } = useClassroomData();

  const currentCourseId = useMemo(() => assignmentId.split('_')[0] || '', [assignmentId]);
  const currentCourseWorkId = useMemo(() => assignmentId.split('_').slice(1).join('_') || '', [assignmentId]);

  const [activeTab, setActiveTab] = useState<RubricModalTab>('create');
  const [title, setTitle] = useState<string>('Grading Rubric');
  const [criteria, setCriteria] = useState<EditableCriterion[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [selectedCopyCourseId, setSelectedCopyCourseId] = useState<string>('');
  const [loadingCopyCwId, setLoadingCopyCwId] = useState<string | null>(null);
  const [rubricPresenceByCwId, setRubricPresenceByCwId] = useState<Record<string, boolean>>({});
  const [cachedRubricsByCwId, setCachedRubricsByCwId] = useState<Record<string, AssignmentRubric>>({});
  const [isCheckingRubrics, setIsCheckingRubrics] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setValidationError(null);
      setActiveTab(initialShowCopyPicker ? 'copy' : 'create');
      setSelectedCopyCourseId(currentCourseId);
      setLoadingCopyCwId(null);
      setTitle(initialRubric?.title || 'Grading Rubric');

      if (initialRubric && initialRubric.criteria && initialRubric.criteria.length > 0) {
        setCriteria(
          initialRubric.criteria.map((c: RubricCriterion) => ({
            id: c.id,
            title: c.title,
            maxPoints: c.maxPoints,
            description: c.description || '',
          }))
        );
      } else {
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
  }, [isOpen, initialRubric, initialShowCopyPicker, currentCourseId]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'copy') return;
    if (courses.length === 0) {
      preloadAssignments(false);
    }
    const targetCourseId = selectedCopyCourseId || currentCourseId;
    if (targetCourseId && !courseworkByCourseId[targetCourseId]) {
      fetchCourseworkForCourse(targetCourseId).catch(() => {
        // Handled in UI if empty
      });
    }
  }, [isOpen, activeTab, selectedCopyCourseId, currentCourseId, courses.length, courseworkByCourseId, preloadAssignments, fetchCourseworkForCourse]);

  const totalPoints = useMemo(() => {
    return criteria.reduce((sum, c) => sum + (Number(c.maxPoints) || 0), 0);
  }, [criteria]);

  const activeCopyCourseId = selectedCopyCourseId || currentCourseId;
  const copySourceAssignments: ClassroomCoursework[] = useMemo(() => {
    return (courseworkByCourseId[activeCopyCourseId] || []).filter(
      (cw) => !(activeCopyCourseId === currentCourseId && cw.id === currentCourseWorkId)
    );
  }, [courseworkByCourseId, activeCopyCourseId, currentCourseId, currentCourseWorkId]);

  const isCopyCourseworkLoading = !!loadingCoursework[activeCopyCourseId] && copySourceAssignments.length === 0;

  // Inspect coursework items in this class to find which ones actually have a rubric
  useEffect(() => {
    if (!isOpen || activeTab !== 'copy' || isCopyCourseworkLoading) return;

    const uninspected = copySourceAssignments.filter(
      (cw) => rubricPresenceByCwId[cw.id] === undefined
    );

    if (uninspected.length === 0) return;

    let isMounted = true;
    setIsCheckingRubrics(true);

    (async () => {
      try {
        const headers = await getAuthHeaders();
        const results = await Promise.all(
          uninspected.map(async (cw) => {
            const sourceAssignmentId = `${activeCopyCourseId}_${cw.id}`;
            try {
              const res = await fetch(
                `${env.API_BASE_URL}/classroom/assignments/${encodeURIComponent(sourceAssignmentId)}/rubric`,
                { headers }
              );
              if (res.ok) {
                const data = await res.json();
                const fetchedRubric: AssignmentRubric | null = data.rubric || null;
                const hasRubric = !!(
                  fetchedRubric &&
                  Array.isArray(fetchedRubric.criteria) &&
                  fetchedRubric.criteria.length > 0
                );
                return { id: cw.id, hasRubric, rubric: hasRubric ? fetchedRubric : null };
              }
              return { id: cw.id, hasRubric: false, rubric: null };
            } catch {
              return { id: cw.id, hasRubric: false, rubric: null };
            }
          })
        );

        if (!isMounted) return;

        setRubricPresenceByCwId((prev) => {
          const next = { ...prev };
          results.forEach((r) => {
            next[r.id] = r.hasRubric;
          });
          return next;
        });

        setCachedRubricsByCwId((prev) => {
          const next = { ...prev };
          results.forEach((r) => {
            if (r.rubric) {
              next[r.id] = r.rubric;
            }
          });
          return next;
        });
      } finally {
        if (isMounted) {
          setIsCheckingRubrics(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isOpen, activeTab, isCopyCourseworkLoading, activeCopyCourseId, copySourceAssignments, rubricPresenceByCwId, getAuthHeaders]);

  const eligibleAssignments = useMemo(() => {
    return copySourceAssignments.filter((cw) => rubricPresenceByCwId[cw.id] === true);
  }, [copySourceAssignments, rubricPresenceByCwId]);

  if (!isOpen) return null;

  const handleCopyRubricFromAssignment = async (sourceCw: ClassroomCoursework) => {
    if (!activeCopyCourseId || loadingCopyCwId) return;
    setLoadingCopyCwId(sourceCw.id);
    setValidationError(null);

    try {
      let fetchedRubric: AssignmentRubric | null = cachedRubricsByCwId[sourceCw.id] || null;

      if (!fetchedRubric) {
        const headers = await getAuthHeaders();
        const sourceAssignmentId = `${activeCopyCourseId}_${sourceCw.id}`;
        const res = await fetch(`${env.API_BASE_URL}/classroom/assignments/${encodeURIComponent(sourceAssignmentId)}/rubric`, {
          headers,
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || 'Failed to load rubric from assignment');
        }

        const data = await res.json();
        fetchedRubric = data.rubric || null;
      }

      if (!fetchedRubric || !Array.isArray(fetchedRubric.criteria) || fetchedRubric.criteria.length === 0) {
        setValidationError(`No rubric found on "${sourceCw.title}".`);
        return;
      }

      if (fetchedRubric.title) {
        setTitle(fetchedRubric.title);
      }

      setCriteria(
        fetchedRubric.criteria.map((c: RubricCriterion, idx: number) => ({
          id: c.id || `crit_${Date.now()}_${idx}`,
          title: c.title,
          maxPoints: c.maxPoints,
          description: c.description || '',
        }))
      );
      setActiveTab('create');
    } catch (err: any) {
      setValidationError(err.message || `Failed to copy rubric from "${sourceCw.title}".`);
    } finally {
      setLoadingCopyCwId(null);
    }
  };

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
    if (criteria.length === 0) {
      setValidationError('A rubric must contain at least one criterion.');
      return;
    }

    const trimmedTitle = title.trim() || 'Grading Rubric';

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
        title: trimmedTitle,
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

        {/* Tab Navigation */}
        <div className="flex border-b border-[#333842] px-5 bg-[#16181D]">
          <button
            type="button"
            data-testid="rubric-tab-create"
            onClick={() => {
              setValidationError(null);
              setActiveTab('create');
            }}
            className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'create'
                ? 'border-[#D4AF37] text-[#D4AF37] font-semibold'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create</span>
          </button>

          <button
            type="button"
            data-testid="rubric-tab-copy"
            onClick={() => {
              setValidationError(null);
              setActiveTab('copy');
            }}
            className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'copy'
                ? 'border-[#D4AF37] text-[#D4AF37] font-semibold'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'
            }`}
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy from Assignment</span>
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

          {/* Copy from Assignment Tab Content */}
          {activeTab === 'copy' && (
            <div
              data-testid="copy-rubric-picker-panel"
              className="space-y-4"
            >
              <div className="text-gray-400 text-xs">
                Select an assignment to copy its rubric criteria into this rubric.
              </div>

              {courses.length > 1 && (
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                    Class
                  </label>
                  <select
                    data-testid="copy-rubric-course-select"
                    value={activeCopyCourseId}
                    onChange={(e) => setSelectedCopyCourseId(e.target.value)}
                    className="w-full bg-[#121316] border border-[#333842] rounded-md px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-[#D4AF37]"
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {isCopyCourseworkLoading || (isCheckingRubrics && eligibleAssignments.length === 0) ? (
                  <div className="flex items-center justify-center space-x-2 py-8 text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />
                    <span>
                      {isCopyCourseworkLoading
                        ? 'Loading assignments...'
                        : 'Checking assignments for rubrics...'}
                    </span>
                  </div>
                ) : eligibleAssignments.length === 0 ? (
                  <div className="py-6 text-center text-gray-500 bg-[#121316] rounded-lg border border-dashed border-[#333842]">
                    No assignments with a rubric found in this class.
                  </div>
                ) : (
                  eligibleAssignments.map((cw) => {
                    const isLoadingThis = loadingCopyCwId === cw.id;
                    return (
                      <button
                        key={cw.id}
                        type="button"
                        data-testid={`copy-rubric-source-${cw.id}`}
                        disabled={!!loadingCopyCwId}
                        onClick={() => handleCopyRubricFromAssignment(cw)}
                        className="w-full text-left p-3 rounded-lg bg-[#121316] hover:bg-[#22262C] border border-[#333842] hover:border-[#D4AF37]/50 transition-all flex items-center justify-between gap-3 cursor-pointer disabled:opacity-50"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-gray-200 truncate">{cw.title}</div>
                          <div className="flex items-center space-x-2 text-[10px] text-gray-400 font-mono mt-1">
                            <span className="inline-flex items-center space-x-1">
                              <Award className="w-3 h-3 text-[#D4AF37]" />
                              <span>{cw.maxPoints ?? 100} pts</span>
                            </span>
                            {cw.associatedWithDeveloper !== true && (
                              <span className="text-gray-500">• Native Classroom</span>
                            )}
                          </div>
                        </div>
                        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#F3E5AB] text-[11px] font-medium shrink-0">
                          {isLoadingThis ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Copying...</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Use Rubric</span>
                            </>
                          )}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Create Tab Content */}
          {activeTab === 'create' && (
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
          )}
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
