const asyncHandler = require('../utils/asyncHandler');
const scheduleService = require('../services/schedule.service');

/**
 * POST /api/v1/schedules/generate
 */
const generateSchedule = asyncHandler(async (req, res) => {
  const { schedule, summary, taskStatuses } = await scheduleService.generateAndSaveSchedule(
    req.body,
    req.requestId
  );
  res.status(200).json({ success: true, schedule, summary, taskStatuses });
});

/**
 * GET /api/v1/schedules
 */
const getAllSchedules = asyncHandler(async (req, res) => {
  const { schedule, summary, taskStatuses } = await scheduleService.getAllSchedules();
  res.status(200).json({ success: true, schedule, summary, taskStatuses });
});

/**
 * GET /api/v1/schedules/task/:taskId
 */
const getScheduleByTask = asyncHandler(async (req, res) => {
  const { schedule, summary, taskStatuses } = await scheduleService.getScheduleByTask(req.params.taskId);
  res.status(200).json({ success: true, schedule, summary, taskStatuses });
});

module.exports = { generateSchedule, getAllSchedules, getScheduleByTask };
