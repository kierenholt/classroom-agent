import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Calendar,
  Award,
  CheckCircle,
  AlertCircle,
  Loader2,
  X,
  GraduationCap,
  RefreshCw,
  PlusCircle,
  ArrowLeft,
  Lock,
  Copy,
  FolderOpen,
  Info,
} from 'lucide-react';
import { ClassroomCoursework } from '../../types/classroom';
import { useClassroomData } from '../../context/ClassroomDataContext';

interface AssignmentPickerViewProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAssignment: (assignmentId: string, meta?: { courseName?: string; assignmentTitle?: string }) => void;
}

export const AssignmentPickerView: React.FC<AssignmentPickerViewProps> = ({
  isOpen,
  onClose,
  onOpenAssignment,
}) => {
  const {
    courses,
    courseworkByCourseId,
    loadingCourses: globalLoadingCourses,
    loadingCoursework: globalLoadingCoursework,
    error: globalError,
    preloadAssignments,
    fetchCourseworkForCourse,
    createCourseworkForCourse,
    checkCourseworkHasSubmissions,
    prefetchWorkspace,
    refreshAll,
  } = useClassroomData();

  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // New assignment creation / cloning state
  const [isCreatingAssignment, setIsCreatingAssignment] = useState<boolean>(false);
  const [cloningSourceCw, setCloningSourceCw] = useState<ClassroomCoursework | null>(null);
  const [cloneSubmissions, setCloneSubmissions] = useState<boolean>(false);
  const [checkingCloneCwId, setCheckingCloneCwId] = useState<string | null>(null);
  const [clonePromptState, setClonePromptState] = useState<{
    cw: ClassroomCoursework;
    submissionCount: number;
    attachmentCount: number;
  } | null>(null);
  const [infoModalCw, setInfoModalCw] = useState<ClassroomCoursework | null>(null);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newDescription, setNewDescription] = useState<string>('');
  const [newMaxPoints, setNewMaxPoints] = useState<string>('100');
  const [newDueDate, setNewDueDate] = useState<string>('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState<boolean>(false);

  // When modal opens, reset selections so user starts fresh at Step 1
  useEffect(() => {
    if (isOpen) {
      setSelectedCourseId(null);
      setLocalError(null);
      setIsCreatingAssignment(false);
      setCloningSourceCw(null);
      setCloneSubmissions(false);
      setCheckingCloneCwId(null);
      setClonePromptState(null);
      setInfoModalCw(null);
      setNewTitle('');
      setNewDescription('');
      setNewMaxPoints('100');
      setNewDueDate('');
      setIsSubmittingCreate(false);
      // If not yet preloaded or courses empty, trigger background preload
      if (courses.length === 0) {
        preloadAssignments(false);
      }
    }
  }, [isOpen, courses.length, preloadAssignments]);

  // When selectedCourseId changes, fetch coursework if not already cached
  useEffect(() => {
    if (!isOpen || !selectedCourseId) {
      setIsCreatingAssignment(false);
      setCloningSourceCw(null);
      setCloneSubmissions(false);
      setCheckingCloneCwId(null);
      setClonePromptState(null);
      setInfoModalCw(null);
      return;
    }

    setLocalError(null);
    setCloningSourceCw(null);
    setCloneSubmissions(false);
    setCheckingCloneCwId(null);
    setClonePromptState(null);
    setInfoModalCw(null);

    if (!courseworkByCourseId[selectedCourseId]) {
      fetchCourseworkForCourse(selectedCourseId).catch((err: any) => {
        setLocalError(err.message || 'Failed to fetch coursework');
      });
    }
  }, [isOpen, selectedCourseId, courseworkByCourseId, fetchCourseworkForCourse]);

  if (!isOpen) {
    return null;
  }

  const rawCoursework: ClassroomCoursework[] = selectedCourseId ? courseworkByCourseId[selectedCourseId] || [] : [];
  // Keep all assignments visible, ordering eligible (Classroom Agent) assignments first followed by native assignments
  const currentCoursework: ClassroomCoursework[] = [...rawCoursework].sort((a, b) => {
    const aEligible = a.associatedWithDeveloper === true ? 1 : 0;
    const bEligible = b.associatedWithDeveloper === true ? 1 : 0;
    return bEligible - aEligible;
  });

  const isCourseworkLoading = selectedCourseId
    ? !!globalLoadingCoursework[selectedCourseId] && currentCoursework.length === 0
    : false;
  const isCoursesLoading = globalLoadingCourses && courses.length === 0;
  const error = localError || globalError;

  const handleOpenAssignmentDirect = (cw: ClassroomCoursework, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (!selectedCourseId || cw.associatedWithDeveloper !== true) {
      return;
    }
    const selectedCourse = courses.find((c) => c.id === selectedCourseId);
    const assignmentId = `${selectedCourseId}_${cw.id}`;
    onOpenAssignment(assignmentId, {
      courseName: selectedCourse?.name || 'Classroom Course',
      assignmentTitle: cw.title,
    });
    onClose();
  };

  const handleOpenCreateForm = () => {
    setLocalError(null);
    setCloningSourceCw(null);
    setCloneSubmissions(false);
    setNewTitle('');
    setNewDescription('');
    setNewMaxPoints('100');
    setNewDueDate('');
    setIsCreatingAssignment(true);
  };

  const proceedToCloneForm = (cw: ClassroomCoursework, shouldCloneSubmissions: boolean) => {
    setLocalError(null);
    setClonePromptState(null);
    setCloningSourceCw(cw);
    setCloneSubmissions(shouldCloneSubmissions);
    setNewTitle(`Clone of ${cw.title}`);
    setNewDescription(cw.description || '');
    setNewMaxPoints(String(cw.maxPoints ?? 100));

    if (cw.dueDate && cw.dueDate.year && cw.dueDate.month && cw.dueDate.day) {
      const yyyy = String(cw.dueDate.year).padStart(4, '0');
      const mm = String(cw.dueDate.month).padStart(2, '0');
      const dd = String(cw.dueDate.day).padStart(2, '0');
      setNewDueDate(`${yyyy}-${mm}-${dd}`);
    } else {
      setNewDueDate('');
    }

    setIsCreatingAssignment(true);
  };

  const handleCloneAssignment = async (cw: ClassroomCoursework, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (!selectedCourseId || checkingCloneCwId) return;

    setLocalError(null);
    setCheckingCloneCwId(cw.id);
    try {
      const summary = await checkCourseworkHasSubmissions(selectedCourseId, cw.id);
      if (summary.hasSubmissions) {
        setClonePromptState({
          cw,
          submissionCount: summary.submissionCount,
          attachmentCount: summary.attachmentCount,
        });
      } else {
        proceedToCloneForm(cw, false);
      }
    } catch {
      proceedToCloneForm(cw, false);
    } finally {
      setCheckingCloneCwId(null);
    }
  };

  const handleCancelCreateForm = () => {
    setIsCreatingAssignment(false);
    setCloningSourceCw(null);
    setCloneSubmissions(false);
    setLocalError(null);
  };

  const handleCreateAssignment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedCourseId || !newTitle.trim() || isSubmittingCreate) return;

    setIsSubmittingCreate(true);
    setLocalError(null);

    try {
      const parsedPoints = Number(newMaxPoints);
      const created = await createCourseworkForCourse(selectedCourseId, {
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        maxPoints: !Number.isNaN(parsedPoints) && parsedPoints >= 0 ? parsedPoints : 100,
        dueDate: newDueDate.trim() || undefined,
        sourceCourseWorkId: cloningSourceCw?.id || undefined,
        cloneSubmissions: cloningSourceCw ? cloneSubmissions : false,
      });

      const selectedCourse = courses.find((c) => c.id === selectedCourseId);
      const assignmentId = `${selectedCourseId}_${created.id}`;
      onOpenAssignment(assignmentId, {
        courseName: selectedCourse?.name || 'Classroom Course',
        assignmentTitle: created.title,
      });
      onClose();
    } catch (err: any) {
      setLocalError(err.message || 'Failed to create assignment');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    setLocalError(null);
    try {
      await refreshAll();
    } catch (err: any) {
      setLocalError(err.message || 'Failed to refresh assignments');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div
      data-testid="assignment-picker-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        data-testid="assignment-picker-view"
        className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-[#1A1D21] border border-[#333842] rounded-xl text-gray-200 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#333842] flex items-center justify-between bg-[#121316]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Open Assignment</h2>
              <p className="text-[11px] text-gray-400">
                Select a class, then open an eligible assignment, clone an assignment, or create a new one
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-1.5">
            <button
              type="button"
              data-testid="assignment-picker-refresh-button"
              onClick={handleManualRefresh}
              disabled={isRefreshing || isCoursesLoading || isSubmittingCreate}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#22262C] transition-colors disabled:opacity-50"
              title="Refresh classes and assignments"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#D4AF37]' : ''}`} />
            </button>
            <button
              data-testid="assignment-picker-close-button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#22262C] transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div
            data-testid="assignment-picker-error"
            className="p-3 mx-6 mt-4 bg-red-950/50 border border-red-800/60 rounded-md text-red-300 text-xs flex items-center space-x-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Modal Body: Class Picker + Conditional Assignment Picker / Creator */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Step 1: Class Picker */}
          <div data-testid="class-picker-section" className="space-y-2.5">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              1. Select a Class
            </label>
            {isCoursesLoading ? (
              <div className="flex items-center space-x-2 text-xs text-gray-400 p-4 bg-[#121316] border border-[#333842] rounded-lg">
                <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />
                <span>Loading classes...</span>
              </div>
            ) : courses.length === 0 ? (
              <div className="text-xs text-gray-500 p-4 bg-[#121316] border border-[#333842] rounded-lg">
                No active classes found.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1">
                {courses.map((course) => {
                  const isSelected = selectedCourseId === course.id;
                  return (
                    <button
                      key={course.id}
                      type="button"
                      data-testid={`course-select-${course.id}`}
                      onClick={() => setSelectedCourseId(course.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-all text-xs flex items-center justify-between ${
                        isSelected
                          ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-white shadow-sm'
                          : 'bg-[#121316] border-[#333842] text-gray-300 hover:bg-[#22262C]'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-semibold text-sm truncate">{course.name}</div>
                        {course.section && (
                          <div className="text-gray-400 text-[11px] mt-0.5 truncate">{course.section}</div>
                        )}
                      </div>
                      {isSelected && <CheckCircle className="w-4 h-4 text-[#D4AF37] shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 2: Assignment Picker or Create New Assignment Form (shown once user selects a class) */}
          {selectedCourseId && (
            <div data-testid="assignment-picker-section" className="space-y-3 pt-2 border-t border-[#333842]">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  {isCreatingAssignment
                    ? cloningSourceCw
                      ? '2. Clone Assignment for Classroom Agent'
                      : '2. Create New Assignment'
                    : '2. Choose an Assignment'}
                </label>
                {!isCreatingAssignment ? (
                  <button
                    type="button"
                    data-testid="create-new-assignment-button"
                    onClick={handleOpenCreateForm}
                    className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 border border-[#D4AF37]/40 text-[#F3E5AB] text-xs font-medium transition-colors"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>+ New Assignment</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid="cancel-create-assignment-button"
                    onClick={handleCancelCreateForm}
                    disabled={isSubmittingCreate}
                    className="inline-flex items-center space-x-1 text-xs text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-50"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to existing assignments</span>
                  </button>
                )}
              </div>

              {isCreatingAssignment ? (
                <form
                  data-testid="create-assignment-form"
                  onSubmit={handleCreateAssignment}
                  className="p-4 bg-[#121316] border border-[#333842] rounded-lg space-y-3.5"
                >
                  {cloningSourceCw && (
                    <div
                      data-testid="cloning-source-banner"
                      className="p-2.5 rounded-md bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[11px] text-[#F3E5AB] flex items-start space-x-2"
                    >
                      <Copy className="w-3.5 h-3.5 text-[#D4AF37] shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold">Cloning assignment:</span>{' '}
                        <span className="text-white">{cloningSourceCw.title}</span>. Review or edit the details below
                        before creating — any existing rubric
                        {cloneSubmissions
                          ? ' and existing student submissions & documents will also be cloned automatically.'
                          : ' will also be copied automatically.'}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">
                      Assignment Title <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      data-testid="new-assignment-title-input"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="e.g., Unit 3 Essay: Industrial Revolution"
                      disabled={isSubmittingCreate}
                      className="w-full px-3 py-2 text-xs bg-[#22262C] border border-[#333842] rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">
                      Instructions / Description <span className="text-gray-500">(optional)</span>
                    </label>
                    <textarea
                      rows={3}
                      data-testid="new-assignment-description-input"
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      placeholder="Provide assignment instructions, prompts, or grading expectations..."
                      disabled={isSubmittingCreate}
                      className="w-full px-3 py-2 text-xs bg-[#22262C] border border-[#333842] rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-[#D4AF37] resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-300 mb-1">Max Points</label>
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        data-testid="new-assignment-max-points-input"
                        value={newMaxPoints}
                        onChange={(e) => setNewMaxPoints(e.target.value)}
                        disabled={isSubmittingCreate}
                        className="w-full px-3 py-1.5 text-xs bg-[#22262C] border border-[#333842] rounded-md text-white focus:outline-none focus:border-[#D4AF37]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-300 mb-1">
                        Due Date <span className="text-gray-500">(optional)</span>
                      </label>
                      <input
                        type="date"
                        data-testid="new-assignment-due-date-input"
                        value={newDueDate}
                        onChange={(e) => setNewDueDate(e.target.value)}
                        disabled={isSubmittingCreate}
                        className="w-full px-3 py-1.5 text-xs bg-[#22262C] border border-[#333842] rounded-md text-white focus:outline-none focus:border-[#D4AF37]"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end pt-2 border-t border-[#333842]/60">
                    <button
                      type="submit"
                      data-testid="create-assignment-submit-button"
                      disabled={!selectedCourseId || !newTitle.trim() || isSubmittingCreate}
                      className="px-4 py-1.5 rounded-lg bg-[#D4AF37] hover:bg-[#E5B869] text-[#121316] text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center space-x-1.5 cursor-pointer shadow-xs"
                    >
                      {isSubmittingCreate ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>{cloneSubmissions ? 'Cloning & Copying Submissions...' : 'Creating...'}</span>
                        </>
                      ) : (
                        <span>Create &amp; Open</span>
                      )}
                    </button>
                  </div>
                </form>
              ) : isCourseworkLoading ? (
                <div className="flex items-center space-x-2 text-xs text-gray-400 p-6 bg-[#121316] border border-[#333842] rounded-lg justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />
                  <span>Loading assignments from Classroom...</span>
                </div>
              ) : currentCoursework.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-gray-400 text-xs p-6 bg-[#121316] border border-[#333842] rounded-lg space-y-3">
                  <BookOpen className="w-8 h-8 text-gray-600" />
                  <p className="text-gray-500">No existing assignments found for this class.</p>
                  <button
                    type="button"
                    data-testid="create-new-assignment-card"
                    onClick={handleOpenCreateForm}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 border border-[#D4AF37]/40 text-[#F3E5AB] text-xs font-medium transition-colors"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Create New Assignment</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                  {currentCoursework.map((cw) => {
                    const isEligible = cw.associatedWithDeveloper === true;

                    if (isEligible) {
                      return (
                        <div
                          key={cw.id}
                          data-testid={`assignment-card-${cw.id}`}
                          data-native-assignment="false"
                          onMouseEnter={() => selectedCourseId && prefetchWorkspace(selectedCourseId, cw.id)}
                          className="w-full text-left p-3.5 rounded-lg border bg-[#121316] border-[#333842] text-gray-200 hover:border-[#D4AF37]/50 transition-all space-y-2.5"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-sm text-gray-100 truncate" title={cw.title}>
                              {cw.title}
                            </div>
                            {cw.description && (
                              <p className="text-xs text-gray-400 line-clamp-1 mt-1">{cw.description}</p>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-3 pt-1">
                            <div className="flex items-center space-x-4 text-[11px] text-gray-400 font-mono">
                              <span className="flex items-center space-x-1">
                                <Award className="w-3.5 h-3.5 text-[#D4AF37]" />
                                <span>{cw.maxPoints ?? 100} points</span>
                              </span>
                              {cw.dueDate && (
                                <span className="flex items-center space-x-1">
                                  <Calendar className="w-3.5 h-3.5 text-blue-400" />
                                  <span>
                                    Due {cw.dueDate.year}-{cw.dueDate.month}-{cw.dueDate.day}
                                  </span>
                                </span>
                              )}
                            </div>

                            <div className="flex items-center space-x-2 shrink-0">
                              <button
                                type="button"
                                data-testid={`clone-assignment-button-${cw.id}`}
                                onClick={(e) => handleCloneAssignment(cw, e)}
                                disabled={checkingCloneCwId === cw.id}
                                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-[#22262C] hover:bg-[#2D323A] border border-[#333842] text-gray-200 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                                title="Clone this assignment"
                              >
                                {checkingCloneCwId === cw.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D4AF37]" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5 text-[#D4AF37]" />
                                )}
                                <span>Clone</span>
                              </button>
                              <button
                                type="button"
                                data-testid={`open-assignment-button-${cw.id}`}
                                onClick={(e) => handleOpenAssignmentDirect(cw, e)}
                                className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-md bg-[#D4AF37] hover:bg-[#E5B869] text-[#121316] text-xs font-semibold transition-colors cursor-pointer shadow-xs"
                                title="Open this assignment in the workspace"
                              >
                                <FolderOpen className="w-3.5 h-3.5" />
                                <span>Open</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // Native Classroom assignment (associatedWithDeveloper !== true): recoloured locked card, no inline badge or explanation, bottom-right Info + Clone + disabled Open button (which opens explanation modal)
                    return (
                      <div
                        key={cw.id}
                        data-testid={`assignment-card-${cw.id}`}
                        data-native-assignment="true"
                        className="w-full text-left p-3.5 rounded-lg border bg-[#16181E]/70 border-[#262932] text-gray-500 space-y-2.5"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-gray-400 truncate" title={cw.title}>
                            {cw.title}
                          </div>
                          {cw.description && (
                            <p className="text-xs text-gray-500 line-clamp-1 mt-1">{cw.description}</p>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-3 pt-1">
                          <div className="flex items-center space-x-4 text-[11px] text-gray-500 font-mono">
                            <span className="flex items-center space-x-1">
                              <Award className="w-3.5 h-3.5 text-gray-500" />
                              <span>{cw.maxPoints ?? 100} points</span>
                            </span>
                            {cw.dueDate && (
                              <span className="flex items-center space-x-1">
                                <Calendar className="w-3.5 h-3.5 text-gray-500" />
                                <span>
                                  Due {cw.dueDate.year}-{cw.dueDate.month}-{cw.dueDate.day}
                                </span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center space-x-2 shrink-0">
                            <button
                              type="button"
                              data-testid={`native-assignment-info-button-${cw.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setInfoModalCw(cw);
                              }}
                              className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-[#22262C] transition-colors cursor-pointer"
                              title="Why can't this assignment be opened directly?"
                            >
                              <Info className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              data-testid={`clone-assignment-button-${cw.id}`}
                              onClick={(e) => handleCloneAssignment(cw, e)}
                              disabled={checkingCloneCwId === cw.id}
                              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-[#22262C] hover:bg-[#2D323A] border border-[#333842] text-gray-200 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                              title="Clone this assignment into Classroom Agent so grades and feedback can be synced"
                            >
                              {checkingCloneCwId === cw.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D4AF37]" />
                              ) : (
                                <Copy className="w-3.5 h-3.5 text-[#D4AF37]" />
                              )}
                              <span>Clone</span>
                            </button>
                            <button
                              type="button"
                              data-testid={`locked-open-assignment-button-${cw.id}`}
                              data-disabled="true"
                              onClick={(e) => {
                                e.stopPropagation();
                                setInfoModalCw(cw);
                              }}
                              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-md bg-[#22262C]/50 border border-[#333842]/60 text-gray-500 text-xs font-semibold opacity-60 cursor-not-allowed transition-colors"
                              title="Click to see why this native Google Classroom assignment cannot be opened directly"
                            >
                              <Lock className="w-3.5 h-3.5" />
                              <span>Open</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Clone Student Submissions Confirmation Modal */}
      {clonePromptState && (
        <div
          data-testid="clone-submissions-prompt-modal"
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          onClick={() => setClonePromptState(null)}
        >
          <div
            className="w-full max-w-md bg-[#1A1D22] border border-[#333842] rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[#333842] flex items-center justify-between bg-[#22262C]/60">
              <div className="flex items-center space-x-2.5">
                <div className="p-1.5 rounded-lg bg-[#D4AF37]/10 border border-[#D4AF37]/20 text-[#D4AF37]">
                  <Copy className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-semibold text-white">Clone Student Submissions?</h4>
              </div>
              <button
                type="button"
                data-testid="close-clone-submissions-prompt-button"
                onClick={() => setClonePromptState(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-[#333842]/60 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs text-gray-300 leading-relaxed">
              <p className="text-sm font-medium text-white">
                This assignment already has student submissions, would you like to clone those as well?
              </p>
              <p className="text-gray-400">
                <span className="font-semibold text-gray-200">{clonePromptState.cw.title}</span> currently has{' '}
                <span className="font-semibold text-[#F3E5AB]">
                  {clonePromptState.submissionCount}{' '}
                  {clonePromptState.submissionCount === 1 ? 'student submission' : 'student submissions'}
                </span>
                {clonePromptState.attachmentCount > 0
                  ? ` (${clonePromptState.attachmentCount} submitted ${
                      clonePromptState.attachmentCount === 1 ? 'document' : 'documents'
                    })`
                  : ''}
                . Choosing <span className="text-white font-medium">Yes</span> will copy each student&apos;s submitted
                documents into the cloned assignment so you can grade and return them immediately.
              </p>
            </div>

            <div className="px-5 py-3.5 border-t border-[#333842] bg-[#121316]/60 flex items-center justify-end space-x-2.5">
              <button
                type="button"
                data-testid="clone-without-submissions-button"
                onClick={() => proceedToCloneForm(clonePromptState.cw, false)}
                className="px-3.5 py-1.5 rounded-lg bg-[#22262C] hover:bg-[#2D323A] border border-[#333842] text-gray-200 text-xs font-medium transition-colors cursor-pointer"
              >
                No, Assignment Only
              </button>
              <button
                type="button"
                data-testid="clone-with-submissions-button"
                onClick={() => proceedToCloneForm(clonePromptState.cw, true)}
                className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-[#D4AF37] hover:bg-[#E5B869] text-[#121316] text-xs font-semibold transition-colors cursor-pointer shadow-xs"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Yes, Clone Submissions</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Native Classroom Assignment Explanation Modal */}
      {infoModalCw && (
        <div
          data-testid="native-assignment-info-modal"
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          onClick={() => setInfoModalCw(null)}
        >
          <div
            className="w-full max-w-md bg-[#1A1D22] border border-[#333842] rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[#333842] flex items-center justify-between bg-[#22262C]/60">
              <div className="flex items-center space-x-2.5">
                <div className="p-1.5 rounded-lg bg-[#D4AF37]/10 border border-[#D4AF37]/20 text-[#D4AF37]">
                  <Lock className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-semibold text-white">Native Google Classroom Assignment</h4>
              </div>
              <button
                type="button"
                data-testid="close-native-info-modal-button"
                onClick={() => setInfoModalCw(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-[#333842]/60 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div
              data-testid={`native-assignment-explanation-${infoModalCw.id}`}
              className="p-5 space-y-3 text-xs text-gray-300 leading-relaxed"
            >
              <p>
                <span className="font-semibold text-white">{infoModalCw.title}</span> was created directly in the native
                Google Classroom UI rather than through Classroom Agent.
              </p>
              <p>
                Google Classroom blocks third-party apps from writing grades or attaching feedback files to assignments
                created directly in the native Classroom UI.
              </p>
              <p>
                Click <span className="font-semibold text-[#F3E5AB]">Clone</span> to recreate this assignment under
                Classroom Agent with full grading, feedback attachment, and return support.
              </p>
            </div>

            <div className="px-5 py-3.5 border-t border-[#333842] bg-[#121316]/60 flex items-center justify-end space-x-2.5">
              <button
                type="button"
                onClick={() => setInfoModalCw(null)}
                className="px-3.5 py-1.5 rounded-lg bg-[#22262C] hover:bg-[#2D323A] border border-[#333842] text-gray-200 text-xs font-medium transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                data-testid={`modal-clone-assignment-button-${infoModalCw.id}`}
                onClick={(e) => {
                  const targetCw = infoModalCw;
                  setInfoModalCw(null);
                  handleCloneAssignment(targetCw, e);
                }}
                className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-[#D4AF37] hover:bg-[#E5B869] text-[#121316] text-xs font-semibold transition-colors cursor-pointer shadow-xs"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Clone Assignment</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

