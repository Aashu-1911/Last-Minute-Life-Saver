import api from './api';

export const createTask = async (data) => {
  const res = await api.post('/api/v1/tasks', data);
  return res.data.task;
};

export const getAllTasks = async () => {
  const res = await api.get('/api/v1/tasks');
  return res.data.tasks;
};
