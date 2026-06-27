import api from './api';

export const createTask = async (data) => {
  const res = await api.post('/api/v1/tasks', data);
  return res.data.task;
};

export const getAllTasks = async () => {
  const res = await api.get('/api/v1/tasks');
  return res.data.tasks;
};

/**
 * Sends form data to the preview endpoint and returns the full response body.
 * Returns either an AI_Plan object or a clarification response { clarificationRequired, questions }.
 * @param {object} data - DraftTask fields
 * @returns {Promise<object>}
 */
export const previewTask = async (data) => {
  const res = await api.post('/api/v1/tasks/preview', data);
  return res.data; // full body: { success, ...aiPlan } or { success, clarificationRequired, questions }
};

/**
 * Approves and persists the task. data must include all DraftTask fields plus aiPlan.
 * @param {object} data - { ...draftTask, aiPlan: AI_Plan }
 * @returns {Promise<object>} saved task object with taskId
 */
export const approveTask = async (data) => {
  const res = await api.post('/api/v1/tasks/approve', data);
  return res.data.task;
};

/**
 * Creates a Quick Task without AI planning.
 * @param {object} data - Quick task fields (title required, deadline/importance/etc. optional)
 * @returns {Promise<object>} saved task object
 */
export const createQuickTask = async (data) => {
  const res = await api.post('/api/v1/tasks/quick', data);
  return res.data.task;
};

/**
 * Marks a task as COMPLETED or PENDING.
 * @param {string} taskId
 * @param {'COMPLETED'|'PENDING'} status
 */
export const completeTask = async (taskId, status = 'COMPLETED') => {
  const res = await api.patch(`/api/v1/tasks/${taskId}/complete`, { status });
  return res.data;
};

/**
 * Toggles a subtask's completed state.
 * @param {string} taskId
 * @param {number} index
 * @param {boolean} completed
 */
export const completeSubtask = async (taskId, index, completed) => {
  const res = await api.patch(`/api/v1/tasks/${taskId}/subtasks/${index}/complete`, { completed });
  return res.data;
};
