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

/**
 * POST /api/v1/tasks/quick
 * Creates a quick task (no AI planning); returns HTTP 201 with the saved task.
 */
const createQuickTask = asyncHandler(async (req, res) => {
  const task = await taskService.createQuickTask(req.body, req.requestId);
  res.status(201).json({ success: true, task });
});

/**
 * PATCH /api/v1/tasks/:taskId/complete
 * Marks a task as COMPLETED (or toggles back to PENDING).
 */
const completeTask = asyncHandler(async (req, res) => {
  const { taskId } = req.params;
  const { status = 'COMPLETED' } = req.body;
  const allowed = ['COMPLETED', 'PENDING', 'IN_PROGRESS'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ success: false, error: `status must be one of ${allowed.join(', ')}` });
  }
  await taskService.updateTaskStatus(taskId, status, req.requestId);
  res.status(200).json({ success: true, taskId, status });
});

/**
 * PATCH /api/v1/tasks/:taskId/subtasks/:index/complete
 * Toggles a subtask's completed state by index.
 */
const completeSubtask = asyncHandler(async (req, res) => {
  const { taskId, index } = req.params;
  const idx = parseInt(index, 10);
  if (isNaN(idx) || idx < 0) {
    return res.status(400).json({ success: false, error: 'index must be a non-negative integer' });
  }
  const { completed } = req.body;
  const updatedSubtasks = await taskService.toggleSubtask(taskId, idx, !!completed, req.requestId);
  res.status(200).json({ success: true, taskId, subtasks: updatedSubtasks });
});

module.exports = { createTask, getAllTasks, previewTask, approveTask, createQuickTask, completeTask, completeSubtask };
