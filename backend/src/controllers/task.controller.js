const asyncHandler = require("../utils/asyncHandler");
const taskService = require("../services/task.service");

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

/**
 * POST /api/v1/tasks/preview
 * Returns an AI_Plan or clarification response — no Firestore write.
 */
const previewTask = asyncHandler(async (req, res) => {
  const result = await taskService.previewTask(req.body, req.requestId);
  res.status(200).json({ success: true, ...result });
});

/**
 * POST /api/v1/tasks/approve
 * Persists the approved task; returns HTTP 201 with the saved task.
 */
const approveTask = asyncHandler(async (req, res) => {
  const task = await taskService.approveTask(req.body, req.requestId);
  res.status(201).json({ success: true, task });
});

module.exports = { createTask, getAllTasks, previewTask, approveTask };
