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
  // updateDraft — update a single field in draftTask
  // -------------------------------------------------------------------------
  const updateDraft = (field, value) => {
    setState((prev) => ({
      ...prev,
      draftTask: { ...prev.draftTask, [field]: value },
    }));
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
  // -------------------------------------------------------------------------
  const submitForPreview = async () => {
    setState((prev) => ({
      ...prev,
      uiState: 'loading',
      loading: true,
      error: null,
    }));

    try {
      const result = await taskService.previewTask(state.draftTask);

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
      await taskService.approveTask({
        ...state.draftTask,
        aiPlan: state.previewTask,
      });

      // Success: reset form state, then refresh task list
      setState(INITIAL_STATE);
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
    // Actions
    updateDraft,
    addAttachment,
    removeAttachment,
    submitForPreview,
    submitClarification,
    approveTask,
    edit,
    backToPreview,
    cancel,
  };
}
