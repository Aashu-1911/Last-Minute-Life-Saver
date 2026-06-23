const asyncHandler = require('../utils/asyncHandler');
const taskService = require('../services/task.service');

/**
 * POST /api/v1/tasks
 * Creates a new task via the task service and responds 201.
 */
const createTask = asyncHandler(async (req, res) => {
  const task = await taskService.createTask(req.body, req.requestId);
  res.status(201).json({ success: true, task });
});

/**
 * GET /api/v1/tasks
 * Returns all stored tasks ordered by createdAt descending.
 */
const getAllTasks = asyncHandler(async (req, res) => {
  const tasks = await taskService.getAllTasks();
  res.status(200).json({ success: true, tasks });
});

module.exports = { createTask, getAllTasks };
