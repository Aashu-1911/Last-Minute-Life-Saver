const { Router } = require('express');
const { validate } = require('../middleware/validation.middleware');
const { taskSchema, previewSchema, approveSchema, quickTaskSchema } = require('../validators/task.validator');
const taskController = require('../controllers/task.controller');

const router = Router();

// POST /api/v1/tasks/preview — generate AI plan without persisting
router.post('/preview', validate(previewSchema), taskController.previewTask);

// POST /api/v1/tasks/approve — persist the approved task
router.post('/approve', validate(approveSchema), taskController.approveTask);

// POST /api/v1/tasks/quick — create a quick task without AI planning
router.post('/quick', validate(quickTaskSchema), taskController.createQuickTask);

// POST /api/v1/tasks — validate then create (existing endpoint, unchanged)
router.post('/', validate(taskSchema), taskController.createTask);

// GET /api/v1/tasks — return all tasks (existing endpoint, unchanged)
router.get('/', taskController.getAllTasks);

// PATCH /api/v1/tasks/:taskId/complete — mark task complete/pending
router.patch('/:taskId/complete', taskController.completeTask);

// PATCH /api/v1/tasks/:taskId/subtasks/:index/complete — toggle subtask completion
router.patch('/:taskId/subtasks/:index/complete', taskController.completeSubtask);

module.exports = router;
