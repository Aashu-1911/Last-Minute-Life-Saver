import api from './api';

export const generateSchedule = async (opts = {}) => {
  const res = await api.post('/api/v1/schedules/generate', opts);
  return res.data; // { schedule, summary, taskStatuses }
};

export const getAllSchedules = async () => {
  const res = await api.get('/api/v1/schedules');
  // Returns { schedule, summary, taskStatuses }
  return {
    schedule: res.data.schedule || [],
    summary: res.data.summary || {},
    taskStatuses: res.data.taskStatuses || [],
  };
};
