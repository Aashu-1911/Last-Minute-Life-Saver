import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import * as taskService from '../services/taskService';
import * as scheduleService from '../services/scheduleService';
import { computeInsights } from '../utils/insights';

const TaskContext = createContext(null);

export const TaskProvider = ({ children }) => {
  const [tasks, setTasks] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [summary, setSummary] = useState({});
  const [taskStatuses, setTaskStatuses] = useState([]);
  const [insights, setInsights] = useState({
    biggestRisk: null,
    highestLeverage: null,
    capacityUtilization: 0,
    productivityScore: 0,
  });

  const [loading, setLoading] = useState({
    tasks: false,
    schedule: false,
    createTask: false,
    generateSchedule: false,
    refresh: false,
  });

  const [error, setError] = useState({
    tasks: null,
    schedule: null,
    createTask: null,
    generateSchedule: null,
  });

  const setLoadingKey = (key, val) =>
    setLoading((prev) => ({ ...prev, [key]: val }));

  const setErrorKey = (key, val) =>
    setError((prev) => ({ ...prev, [key]: val }));

  const refreshInsights = useCallback((t, ts, s) => {
    setInsights(computeInsights(t, ts, s));
  }, []);

  // Recompute insights whenever any of the three data sources change
  useEffect(() => {
    setInsights(computeInsights(tasks, taskStatuses, summary));
  }, [tasks, taskStatuses, summary]);

  const fetchTasks = useCallback(async () => {
    setLoadingKey('tasks', true);
    setErrorKey('tasks', null);
    try {
      const data = await taskService.getAllTasks();
      setTasks(data);
      return data;
    } catch (err) {
      setErrorKey('tasks', err.response?.data?.error || 'Failed to load tasks');
      return [];
    } finally {
      setLoadingKey('tasks', false);
    }
  }, []);

  const fetchSchedule = useCallback(async () => {
    setLoadingKey('schedule', true);
    setErrorKey('schedule', null);
    try {
      const data = await scheduleService.getAllSchedules();
      // getAllSchedules now returns { schedule, summary, taskStatuses }
      setSchedule(data.schedule || []);
      setSummary(data.summary || {});
      setTaskStatuses(data.taskStatuses || []);
      return data;
    } catch (err) {
      setErrorKey('schedule', err.response?.data?.error || 'Failed to load schedule');
      return { schedule: [], summary: {}, taskStatuses: [] };
    } finally {
      setLoadingKey('schedule', false);
    }
  }, []);

  const createTask = useCallback(async (formData) => {
    setLoadingKey('createTask', true);
    setErrorKey('createTask', null);
    try {
      const task = await taskService.createTask(formData);
      // Auto-refresh tasks after creation
      const updated = await fetchTasks();
      refreshInsights(updated, taskStatuses, summary);
      return task;
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to create task';
      setErrorKey('createTask', msg);
      throw new Error(msg);
    } finally {
      setLoadingKey('createTask', false);
    }
  }, [fetchTasks, taskStatuses, summary, refreshInsights]);

  const generateSchedule = useCallback(async (opts = {}) => {
    setLoadingKey('generateSchedule', true);
    setErrorKey('generateSchedule', null);
    try {
      const result = await scheduleService.generateSchedule(opts);
      setSchedule(result.schedule || []);
      setSummary(result.summary || {});
      setTaskStatuses(result.taskStatuses || []);
      refreshInsights(tasks, result.taskStatuses || [], result.summary || {});
      // Also refresh tasks to pick up any status changes
      await fetchTasks();
      return result;
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to generate schedule';
      setErrorKey('generateSchedule', msg);
      throw new Error(msg);
    } finally {
      setLoadingKey('generateSchedule', false);
    }
  }, [tasks, fetchTasks, refreshInsights]);

  const refresh = useCallback(async () => {
    setLoadingKey('refresh', true);
    try {
      const [t, sched] = await Promise.all([fetchTasks(), fetchSchedule()]);
      // fetchSchedule already sets summary/taskStatuses in state;
      // re-compute insights with fresh values
      refreshInsights(t, sched.taskStatuses || [], sched.summary || {});
    } finally {
      setLoadingKey('refresh', false);
    }
  }, [fetchTasks, fetchSchedule, refreshInsights]);

  // Initial load — fetch both then compute insights
  useEffect(() => {
    const init = async () => {
      const [t, sched] = await Promise.all([fetchTasks(), fetchSchedule()]);
      refreshInsights(t, sched.taskStatuses || [], sched.summary || {});
    };
    init();
  }, []);

  return (
    <TaskContext.Provider
      value={{
        tasks, schedule, summary, taskStatuses, insights,
        loading, error,
        actions: { createTask, generateSchedule, refresh },
      }}
    >
      {children}
    </TaskContext.Provider>
  );
};

export const useTaskContext = () => {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error('useTaskContext must be used inside TaskProvider');
  return ctx;
};
