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
