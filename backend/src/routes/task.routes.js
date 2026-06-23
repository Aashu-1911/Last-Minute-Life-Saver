const { Router } = require('express');
const { validate } = require('../middleware/validation.middleware');
const { taskSchema } = require('../validators/task.validator');
const taskController = require('../controllers/task.controller');

const router = Router();

// POST /api/v1/tasks — validate then create
router.post('/', validate(taskSchema), taskController.createTask);

// GET /api/v1/tasks — return all tasks
router.get('/', taskController.getAllTasks);

module.exports = router;
