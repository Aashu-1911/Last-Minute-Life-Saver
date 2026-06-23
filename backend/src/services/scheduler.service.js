/**
 * Scheduler Service — pure deterministic scheduling logic.
 * No Firestore, no external calls. No side effects.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Formats decimal hour → "HH:MM". e.g. 16.5 → "16:30" */
const formatTime = (hour) => {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/** Returns "YYYY-MM-DD" for a base date string offset by N days. */
const offsetDate = (base, days) => {
  const d = new Date(base + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Returns whole days available between today (inclusive) and deadline (inclusive).
 * e.g. today === deadline → 1 day.
 */
const daysUntilDeadline = (todayStr, deadlineStr) => {
  const today = new Date(todayStr + 'T00:00:00.000Z');
  const deadline = new Date(deadlineStr + 'T00:00:00.000Z');
  const ms = deadline - today;
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)) + 1);
};

// ─── AI Estimate Policy ───────────────────────────────────────────────────────
//
// VALID           0.5 – 100      → schedule normally
// REVIEW_REQUIRED 100 < h ≤ 500  → schedule, flag for human review
// INVALID_ESTIMATE h ≤ 0 | > 500 | NaN → reject, no blocks

const ESTIMATE_MIN = 0.5;
const ESTIMATE_VALID_MAX = 100;
const ESTIMATE_REVIEW_MAX = 500;

/**
 * Classifies an estimatedHours value.
 * @param {number} hours
 * @returns {'VALID' | 'REVIEW_REQUIRED' | 'INVALID_ESTIMATE'}
 */
const classifyEstimate = (hours) => {
  if (typeof hours !== 'number' || !isFinite(hours) || hours < ESTIMATE_MIN) {
    return 'INVALID_ESTIMATE';
  }
  if (hours <= ESTIMATE_VALID_MAX) return 'VALID';
  if (hours <= ESTIMATE_REVIEW_MAX) return 'REVIEW_REQUIRED';
  return 'INVALID_ESTIMATE';
};

/**
 * Back-compat helper: returns true for the VALID range only.
 * Kept so existing unit tests that import this don't break.
 */
const isValidEstimatedHours = (hours) => classifyEstimate(hours) === 'VALID';

// ─── Block Validator ──────────────────────────────────────────────────────────

const REQUIRED_BLOCK_FIELDS = [
  'taskId', 'taskTitle', 'date', 'startTime', 'endTime', 'durationHours', 'status',
];

/**
 * Throws if a block is malformed.
 * @param {object} block
 */
const validateBlock = (block) => {
  for (const field of REQUIRED_BLOCK_FIELDS) {
    if (block[field] === undefined || block[field] === null || block[field] === '') {
      throw new Error(`Schedule block missing field: ${field}`);
    }
  }
  if (block.durationHours <= 0) {
    throw new Error('Schedule block durationHours must be > 0');
  }
  if (block.endTime <= block.startTime) {
    throw new Error(`Schedule block endTime (${block.endTime}) must be after startTime (${block.startTime})`);
  }
};

// ─── Core Algorithm ───────────────────────────────────────────────────────────

/**
 * Generates a time-blocked schedule from tasks and a daily availability window.
 *
 * Status enum: SCHEDULED | OVERDUE_RISK | REVIEW_REQUIRED | UNSCHEDULED | INVALID_ESTIMATE
 *
 * @param {Array<{
 *   taskId: string,
 *   priorityScore: number,
 *   estimatedHours: number,
 *   deadline: string,
 *   sanitizedTitle?: string,
 *   originalTitle?: string,
 *   taskTitle?: string,
 * }>} tasks
 * @param {{ startHour: number, endHour: number }} availability
 * @param {{ today?: string }} [options]  — today override for deterministic tests ("YYYY-MM-DD")
 * @returns {{
 *   blocks: object[],
 *   summary: {
 *     totalScheduledHours: number,
 *     overdueRiskTasks: number,
 *     unscheduledTasks: number,
 *     invalidTasks: number,
 *     reviewRequiredTasks: number
 *   },
 *   taskStatuses: object[]
 * }}
 */
const generateSchedule = (tasks, availability, { today } = {}) => {
  const { startHour, endHour } = availability;
  const dailyHours = endHour - startHour;
  const todayStr = today || new Date().toISOString().slice(0, 10);

  const blocks = [];
  const taskStatuses = [];
  const summary = {
    totalScheduledHours: 0,
    overdueRiskTasks: 0,
    unscheduledTasks: 0,
    invalidTasks: 0,
    reviewRequiredTasks: 0,
  };

  // ── 1. Classify estimate quality; separate invalids immediately ───────────
  const schedulableTasks = [];

  for (const task of tasks) {
    const tier = classifyEstimate(task.estimatedHours);

    if (tier === 'INVALID_ESTIMATE') {
      taskStatuses.push({
        taskId: task.taskId,
        scheduleStatus: 'INVALID_ESTIMATE',
        feasible: false,
        requiredHours: task.estimatedHours,
        availableHours: 0,
        deficitHours: task.estimatedHours,
        reviewRequired: false,
        reviewReason: null,
      });
      summary.invalidTasks += 1;
      continue;
    }

    schedulableTasks.push({ ...task, _estimateTier: tier });
  }

  // ── 2. Sort: higher priorityScore first, earlier deadline as tiebreaker ──
  schedulableTasks.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    return new Date(a.deadline) - new Date(b.deadline);
  });

  // ── 3. Greedy scheduling — shared day cursor prevents inter-task overlap ──
  let dayOffset = 0;
  let currentDayFilled = 0;

  for (const task of schedulableTasks) {
    const title = task.taskTitle || task.sanitizedTitle || task.originalTitle || '';
    const deadlineStr = task.deadline.slice(0, 10);
    const isReviewRequired = task._estimateTier === 'REVIEW_REQUIRED';

    const daysAvailable = daysUntilDeadline(todayStr, deadlineStr);
    const availableHours = dailyHours * daysAvailable;
    const schedulableHours = Math.min(task.estimatedHours, availableHours);
    const isOverdueRisk = task.estimatedHours > availableHours;

    // Deadline already passed — nothing can be scheduled
    if (schedulableHours <= 0) {
      taskStatuses.push({
        taskId: task.taskId,
        scheduleStatus: 'OVERDUE_RISK',
        feasible: false,
        requiredHours: task.estimatedHours,
        availableHours: 0,
        deficitHours: task.estimatedHours,
        reviewRequired: isReviewRequired,
        reviewReason: isReviewRequired ? 'High effort estimate' : null,
      });
      summary.overdueRiskTasks += 1;
      if (isReviewRequired) summary.reviewRequiredTasks += 1;
      continue;
    }

    let remaining = schedulableHours;
    let scheduledForTask = 0;

    while (remaining > 0) {
      // Advance cursor to next day when current day is full
      if (currentDayFilled >= dailyHours) {
        dayOffset += 1;
        currentDayFilled = 0;
      }

      const blockDate = offsetDate(todayStr, dayOffset);

      // Never write a block past the task deadline
      if (blockDate > deadlineStr) break;

      const dayAvailable = dailyHours - currentDayFilled;
      const blockHours = Math.min(remaining, dayAvailable);
      const blockStart = startHour + currentDayFilled;
      const blockEnd = blockStart + blockHours;

      const block = {
        taskId: task.taskId,
        taskTitle: title,
        date: blockDate,
        startTime: formatTime(blockStart),
        endTime: formatTime(blockEnd),
        durationHours: blockHours,
        status: 'PLANNED',
        priorityScoreAtGeneration: task.priorityScore,
      };

      validateBlock(block); // throws on malformed data

      blocks.push(block);
      scheduledForTask += blockHours;
      currentDayFilled += blockHours;
      remaining -= blockHours;
    }

    summary.totalScheduledHours += scheduledForTask;

    // Determine final status for this task
    let scheduleStatus;
    if (scheduledForTask === 0) {
      scheduleStatus = 'UNSCHEDULED';
      summary.unscheduledTasks += 1;
    } else if (isOverdueRisk) {
      scheduleStatus = 'OVERDUE_RISK';
      summary.overdueRiskTasks += 1;
    } else if (isReviewRequired) {
      scheduleStatus = 'REVIEW_REQUIRED';
    } else {
      scheduleStatus = 'SCHEDULED';
    }

    // reviewRequiredTasks is independent of scheduleStatus —
    // a task can be OVERDUE_RISK *and* reviewRequired simultaneously.
    if (isReviewRequired) {
      summary.reviewRequiredTasks += 1;
    }

    taskStatuses.push({
      taskId: task.taskId,
      scheduleStatus,
      feasible: !isOverdueRisk,
      requiredHours: task.estimatedHours,
      availableHours,
      deficitHours: Math.max(0, task.estimatedHours - availableHours),
      reviewRequired: isReviewRequired,
      reviewReason: isReviewRequired ? 'High effort estimate' : null,
    });
  }

  summary.totalScheduledHours = Math.round(summary.totalScheduledHours * 100) / 100;

  return { blocks, summary, taskStatuses };
};

module.exports = {
  generateSchedule,
  classifyEstimate,
  isValidEstimatedHours,
  daysUntilDeadline,
  validateBlock,
};
