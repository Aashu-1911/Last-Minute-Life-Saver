import { useState } from 'react';
import { useTaskContext } from '../context/TaskContext';
import * as taskService from '../services/taskService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INITIAL_DRAFT = {
  title: '',
  description: '',
  category: 'Work',
  taskType: 'Deep Work',
  difficulty: 'Medium',
  deadline: '',
  importance: 3,
  dailyAvailability: '',
  preferredWorkingTime: '',
  attachments: [],
  experienceLevel: 'Comfortable',
  timePreference: '',
  energyLevel: '',
  isRecurring: false,
  recurringInterval: '',
  frequencyPerDay: '',
};

const INITIAL_STATE = {
  uiState: 'form-filling', // 'form-filling' | 'loading' | 'preview' | 'clarification'
  draftTask: INITIAL_DRAFT,
  previewTask: null,
  clarificationQuestions: [],
  clarificationAnswers: [],
  loading: false,
  error: null,
};

const INITIAL_MODE = 'ai';       // 'quick' | 'ai'
const INITIAL_SOURCE_TASK_ID = null;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_ATTACHMENTS = 5;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTaskCreation() {
  // Read-only access to TaskContext for post-approve refresh.
  // fetchTasks is internal to the context; `refresh` is the public action
  // that fetches both tasks and schedule and recomputes insights.
  const { actions: { refresh: fetchTasks } } = useTaskContext();

  const [state, setState] = useState(INITIAL_STATE);

  // -------------------------------------------------------------------------
  // mode — 'quick' | 'ai'
  // -------------------------------------------------------------------------
  const [mode, setMode] = useState(INITIAL_MODE);

  // -------------------------------------------------------------------------
  // sourceTaskId — ID of the quick task being upgraded to an AI plan
  // -------------------------------------------------------------------------
  const [sourceTaskId, setSourceTaskId] = useState(INITIAL_SOURCE_TASK_ID);

  // -------------------------------------------------------------------------
  // updateDraft — update a single field (or merge an object) in draftTask
  // -------------------------------------------------------------------------
  const updateDraft = (fieldOrObject, value) => {
    if (typeof fieldOrObject === 'object' && fieldOrObject !== null) {
      // Called with an object — merge all fields at once (e.g. planThisTask)
      setState((prev) => ({
        ...prev,
        draftTask: { ...prev.draftTask, ...fieldOrObject },
      }));
    } else {
      setState((prev) => ({
        ...prev,
        draftTask: { ...prev.draftTask, [fieldOrObject]: value },
      }));
    }
  };

  // -------------------------------------------------------------------------
  // switchMode — change between 'quick' and 'ai'; preserves shared fields
  // title, deadline, and importance carry over between modes
  // -------------------------------------------------------------------------
  const switchMode = (newMode) => {
    setMode(newMode);
    // When switching to AI mode, clear quick-task-only fields from draft
    if (newMode === 'ai') {
      setState((prev) => ({
        ...prev,
        draftTask: {
          ...prev.draftTask,
          isRecurring: false,
          recurringInterval: '',
          frequencyPerDay: '',
        },
      }));
    }
  };

  // -------------------------------------------------------------------------
  // addAttachment — validate and append file metadata to draftTask.attachments
  // -------------------------------------------------------------------------
  const addAttachment = (file) => {
    // MIME type validation
    const isMimeValid =
      file.type === 'application/pdf' || file.type.startsWith('image/');
    if (!isMimeValid) {
      setState((prev) => ({
        ...prev,
        error: 'Only PDF and image files are allowed.',
      }));
      return;
    }

    // Size validation
    if (file.size > MAX_FILE_SIZE) {
      setState((prev) => ({
        ...prev,
        error: 'File size must not exceed 10 MB.',
      }));
      return;
    }

    // Count validation
    if (state.draftTask.attachments.length >= MAX_ATTACHMENTS) {
      setState((prev) => ({
        ...prev,
        error: `You can attach a maximum of ${MAX_ATTACHMENTS} files.`,
      }));
      return;
    }

    const metadata = {
      name: file.name,
      size: file.size,
      mimeType: file.type,
      uploadedAt: new Date().toISOString(),
    };

    setState((prev) => ({
      ...prev,
      error: null,
      draftTask: {
        ...prev.draftTask,
        attachments: [...prev.draftTask.attachments, metadata],
      },
    }));
  };

  // -------------------------------------------------------------------------
  // removeAttachment — remove attachment by index
  // -------------------------------------------------------------------------
  const removeAttachment = (index) => {
    setState((prev) => {
      const updated = [...prev.draftTask.attachments];
      updated.splice(index, 1);
      return {
        ...prev,
        draftTask: { ...prev.draftTask, attachments: updated },
      };
    });
  };

  // -------------------------------------------------------------------------
  // submitForPreview — POST to /preview; handle AI_Plan or clarification
  // Accepts optional overrides for assumption correction replan flow (Task 17):
  //   _corrections: string[]  — user-supplied corrections (kept separate from description)
  //   _isClarificationResubmit: boolean — enforces 1-round clarification limit
  // -------------------------------------------------------------------------
  const submitForPreview = async (overrides = {}) => {
    setState((prev) => ({
      ...prev,
      uiState: 'loading',
      loading: true,
      error: null,
    }));

    try {
      const OPTIONAL_FIELDS = [
        'description', 'category', 'taskType', 'difficulty', 'preferredWorkingTime',
        'dailyAvailability', 'experienceLevel', 'timePreference', 'energyLevel', 'recurringInterval',
        // quick-task-only fields — never sent to the AI planner endpoint
        'frequencyPerDay', 'isRecurring',
      ];
      const cleaned = { ...state.draftTask, ...overrides };
      OPTIONAL_FIELDS.forEach((f) => {
        if (cleaned[f] === '' || cleaned[f] === null || cleaned[f] === undefined || cleaned[f] === false) {
          delete cleaned[f];
        }
      });
      const payload = cleaned;
      const result = await taskService.previewTask(payload);

      if (result.clarificationRequired === true) {
        setState((prev) => ({
          ...prev,
          uiState: 'clarification',
          loading: false,
          clarificationQuestions: result.questions || [],
        }));
      } else {
        // Strip the `success` envelope key if present; store the AI_Plan
        // eslint-disable-next-line no-unused-vars
        const { success: _s1, ...aiPlan } = result;
        setState((prev) => ({
          ...prev,
          uiState: 'preview',
          loading: false,
          previewTask: aiPlan,
        }));
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        uiState: 'form-filling',
        loading: false,
        error:
          err.response?.data?.error ||
          'Something went wrong — please try again.',
      }));
    }
  };

  // -------------------------------------------------------------------------
  // submitClarification — append answer to description, re-submit for preview
  // -------------------------------------------------------------------------
  const submitClarification = async (answer) => {
    const existingDesc = state.draftTask.description || '';
    const separator = existingDesc.length > 0 ? '\n' : '';
    const combined = (existingDesc + separator + answer).slice(0, 2000);

    const updatedDraft = { ...state.draftTask, description: combined };

    setState((prev) => ({
      ...prev,
      draftTask: updatedDraft,
      uiState: 'loading',
      loading: true,
      error: null,
    }));

    try {
      const result = await taskService.previewTask(updatedDraft);

      if (result.clarificationRequired === true) {
        // Backend returns 422 in this case, but handle both:
        // if we somehow receive 200 with clarificationRequired again, treat as error
        setState((prev) => ({
          ...prev,
          uiState: 'form-filling',
          loading: false,
          error:
            'Could not generate a plan after clarification. Please add more detail and try again.',
        }));
      } else {
        // eslint-disable-next-line no-unused-vars
        const { success: _s2, ...aiPlan } = result;
        setState((prev) => ({
          ...prev,
          uiState: 'preview',
          loading: false,
          previewTask: aiPlan,
        }));
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        uiState: 'form-filling',
        loading: false,
        error:
          err.response?.data?.error ||
          'Something went wrong — please try again.',
      }));
    }
  };

  // -------------------------------------------------------------------------
  // approveTask — POST to /approve; reset on success, preserve preview on error
  // -------------------------------------------------------------------------
  const approveTask = async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      // Strip quick-task-only fields — approveSchema doesn't allow them
      const QUICK_ONLY_FIELDS = ['frequencyPerDay', 'isRecurring', 'recurringInterval'];
      const draftClean = { ...state.draftTask };
      QUICK_ONLY_FIELDS.forEach((f) => { delete draftClean[f]; });
      // Also strip empty-string optional enum fields to avoid Joi rejection
      const OPTIONAL_ENUMS = [
        'category', 'taskType', 'difficulty', 'dailyAvailability',
        'preferredWorkingTime', 'experienceLevel', 'timePreference', 'energyLevel',
      ];
      OPTIONAL_ENUMS.forEach((f) => {
        if (draftClean[f] === '' || draftClean[f] === null) delete draftClean[f];
      });

      const payload = {
        ...draftClean,
        aiPlan: state.previewTask,
      };

      // Include sourceTaskId when upgrading a quick task to an AI plan
      if (sourceTaskId) {
        payload.sourceTaskId = sourceTaskId;
      }

      await taskService.approveTask(payload);

      // Success: reset form state and sourceTaskId, then refresh task list
      setState(INITIAL_STATE);
      setSourceTaskId(INITIAL_SOURCE_TASK_ID);
      await fetchTasks();
    } catch (err) {
      // Preserve preview state — user can retry or cancel
      setState((prev) => ({
        ...prev,
        loading: false,
        error:
          err.response?.data?.error ||
          'Something went wrong — please try again.',
      }));
    }
  };

  // -------------------------------------------------------------------------
  // saveQuickTask — create a quick task without AI planning
  // -------------------------------------------------------------------------
  const saveQuickTask = async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      // Whitelist only the fields that quickTaskSchema accepts.
      // This prevents AI-planner fields (taskType, difficulty, etc.) from leaking
      // into the quick task payload when the draft was pre-filled by planThisTask.
      const QUICK_TASK_FIELDS = [
        'title', 'importance', 'category',
        'preferredWorkingTime', 'isRecurring', 'recurringInterval',
        'frequencyPerDay',
      ];
      const payload = {};
      QUICK_TASK_FIELDS.forEach((f) => {
        const val = state.draftTask[f];
        // Include field only when it has a real value (skip empty strings, null, undefined)
        if (val !== '' && val !== null && val !== undefined) {
          payload[f] = val;
        }
      });
      // Quick tasks are always due today
      payload.deadline = new Date().toISOString().slice(0, 10);
      // isRecurring false is meaningful — include it explicitly
      if (typeof state.draftTask.isRecurring === 'boolean') {
        payload.isRecurring = state.draftTask.isRecurring;
      }

      await taskService.createQuickTask(payload);

      // Success: reset state
      setState(INITIAL_STATE);
      setMode(INITIAL_MODE);
      setSourceTaskId(INITIAL_SOURCE_TASK_ID);
      await fetchTasks();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error:
          err.response?.data?.error ||
          'Something went wrong — please try again.',
      }));
    }
  };

  // -------------------------------------------------------------------------
  // planThisTask — pre-fill AI form from an existing quick task
  // -------------------------------------------------------------------------
  const planThisTask = (task) => {
    setMode('ai');
    updateDraft({ ...task });
    setSourceTaskId(task.taskId);
  };

  // -------------------------------------------------------------------------
  // edit — return to form-filling with draftTask intact, preserve previewTask
  // -------------------------------------------------------------------------
  const edit = () => {
    setState((prev) => ({
      ...prev,
      uiState: 'form-filling',
      // previewTask is intentionally kept so the user can go back to preview
      error: null,
    }));
  };

  // -------------------------------------------------------------------------
  // backToPreview — return to preview state without re-generating
  // -------------------------------------------------------------------------
  const backToPreview = () => {
    setState((prev) => ({
      ...prev,
      uiState: 'preview',
      error: null,
    }));
  };

  // -------------------------------------------------------------------------
  // cancel — reset entire state to initial
  // -------------------------------------------------------------------------
  const cancel = () => {
    setState(INITIAL_STATE);
    setMode(INITIAL_MODE);
    setSourceTaskId(INITIAL_SOURCE_TASK_ID);
  };

  // -------------------------------------------------------------------------
  // Return — destructure state fields alongside action functions
  // -------------------------------------------------------------------------
  const {
    uiState,
    draftTask,
    previewTask,
    clarificationQuestions,
    clarificationAnswers,
    loading,
    error,
  } = state;

  return {
    // State fields (destructured)
    uiState,
    draftTask,
    previewTask,
    clarificationQuestions,
    clarificationAnswers,
    loading,
    error,
    // Mode and source task state
    mode,
    sourceTaskId,
    // Actions
    updateDraft,
    switchMode,
    addAttachment,
    removeAttachment,
    submitForPreview,
    submitClarification,
    approveTask,
    saveQuickTask,
    planThisTask,
    edit,
    backToPreview,
    cancel,
  };
}
