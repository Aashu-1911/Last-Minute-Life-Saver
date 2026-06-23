const { Router } = require('express');
const { validate } = require('../middleware/validation.middleware');
const { scheduleGenerateSchema } = require('../validators/schedule.validator');
const scheduleController = require('../controllers/schedule.controller');

const router = Router();

// POST /api/v1/schedules/generate — generate and persist schedule
router.post('/generate', validate(scheduleGenerateSchema), scheduleController.generateSchedule);

// GET /api/v1/schedules — all schedule blocks
router.get('/', scheduleController.getAllSchedules);

// GET /api/v1/schedules/task/:taskId — blocks for one task
router.get('/task/:taskId', scheduleController.getScheduleByTask);

module.exports = router;
