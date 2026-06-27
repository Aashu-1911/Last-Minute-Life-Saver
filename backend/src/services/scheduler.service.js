/**
 * Scheduler Service — pure deterministic scheduling logic.
 * No Firestore, no external calls. No side effects.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Formats decimal hour → "HH:MM". e.g. 16.5 → "16:30" */
const formatTime = (hour) => {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/** Returns "YYYY-MM-DD" for a base date string offset by N days. */
const offsetDate = (base, days) => {
  const d = new Date(base + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Returns whole days available between today (inclusive) and deadline (inclusive).
 * e.g. today === deadline → 1 day.
 */
const daysUntilDeadline = (todayStr, deadlineStr) => {
  const today = new Date(todayStr + "T00:00:00.000Z");
  const deadline = new Date(deadlineStr + "T00:00:00.000Z");
  const ms = deadline - today;
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)) + 1);
};

// ─── AI Estimate Policy ───────────────────────────────────────────────────────
//
// VALID           0.5 – 100       → schedule normally
// REVIEW_REQUIRED 100 < h ≤ 500   → do NOT schedule, flag for human review
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
  if (typeof hours !== "number" || !isFinite(hours) || hours < ESTIMATE_MIN) {
    return "INVALID_ESTIMATE";
  }
  if (hours <= ESTIMATE_VALID_MAX) return "VALID";
  if (hours <= ESTIMATE_REVIEW_MAX) return "REVIEW_REQUIRED";
  return "INVALID_ESTIMATE";
};

/** Back-compat: returns true for VALID range only. */
const isValidEstimatedHours = (hours) => classifyEstimate(hours) === "VALID";

// ─── Block Validator ──────────────────────────────────────────────────────────

const REQUIRED_BLOCK_FIELDS = [
  "taskId",
  "taskTitle",
  "date",
  "startTime",
  "endTime",
  "durationHours",
  "status",
];

const validateBlock = (block) => {
  for (const field of REQUIRED_BLOCK_FIELDS) {
    if (
      block[field] === undefined ||
      block[field] === null ||
      block[field] === ""
    ) {
      throw new Error(`Schedule block missing field: ${field}`);
    }
  }
  if (block.durationHours <= 0) {
    throw new Error("Schedule block durationHours must be > 0");
  }
  if (block.endTime <= block.startTime) {
    throw new Error(
      `Schedule block endTime (${block.endTime}) must be after startTime (${block.startTime})`,
    );
  }
};

// ─── Core Algorithm ───────────────────────────────────────────────────────────

/**
 * Generates a time-blocked schedule from tasks and a daily availability window.
 *
 * Estimate policy:
 *   VALID (0.5–100)           → scheduled normally
 *   REVIEW_REQUIRED (100–500) → NOT scheduled; taskStatus = REVIEW_REQUIRED, reviewReason set
 *   INVALID_ESTIMATE (>500|≤0)→ NOT scheduled; taskStatus = INVALID_ESTIMATE
 *
 * @param {Array<object>} tasks
 * @param {{ startHour: number, endHour: number }} availability
 * @param {{ today?: string }} [options]
 * @returns {{ blocks: object[], summary: object, taskStatuses: object[] }}
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

  // ── 1. Classify all tasks; pull out non-schedulable ones immediately ──────
  const schedulableTasks = [];
  const frequencyTasks = [];

  for (const task of tasks) {
    // Frequency/habit tasks (e.g. "Drink water 8x") get reminder slots, not time blocks
    if (task.frequencyPerDay && task.frequencyPerDay > 0) {
      frequencyTasks.push(task);
      continue;
    }

    const tier = classifyEstimate(task.estimatedHours);

    if (tier === "INVALID_ESTIMATE") {
      taskStatuses.push({
        taskId: task.taskId,
        scheduleStatus: "INVALID_ESTIMATE",
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

    if (tier === "REVIEW_REQUIRED") {
      // Do NOT schedule — flag for human review, generate zero blocks
      taskStatuses.push({
        taskId: task.taskId,
        scheduleStatus: "REVIEW_REQUIRED",
        feasible: false,
        requiredHours: task.estimatedHours,
        availableHours: null, // not applicable — not a scheduling issue
        deficitHours: null, // not applicable — not a scheduling issue
        reviewRequired: true,
        reviewReason: "ESTIMATE_EXCEEDS_MAXIMUM",
        reviewRangeMin: ESTIMATE_MIN,
        reviewRangeMax: ESTIMATE_VALID_MAX,
      });
      summary.reviewRequiredTasks += 1;
      continue;
    }

    // VALID tier — proceed to scheduling
    schedulableTasks.push(task);
  }

  // ── 2. Sort: higher priorityScore first, earlier deadline as tiebreaker ──
  schedulableTasks.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore)
      return b.priorityScore - a.priorityScore;
    return new Date(a.deadline) - new Date(b.deadline);
  });

  // ── 3. Spread scheduling — per-task daily allocation across all available days ──
  //
  // Instead of a shared greedy cursor that packs Day 1 first, each task gets its own
  // spread: hoursPerDay = estimatedHours / daysAvailable (capped at dailyHours).
  // We track per-day usage in a map so multiple tasks share the same day window
  // without overlap, and load is distributed across all days up to the deadline.

  // dayUsed[dateStr] = hours already allocated on that date across all tasks
  const dayUsed = {};

  const getDayUsed = (dateStr) => dayUsed[dateStr] || 0;
  const addDayUsed = (dateStr, h) => { dayUsed[dateStr] = (dayUsed[dateStr] || 0) + h; };

  for (const task of schedulableTasks) {
    const title = task.taskTitle || task.sanitizedTitle || task.originalTitle || "";
    const deadlineStr = task.deadline.slice(0, 10);

    const daysAvailable = daysUntilDeadline(todayStr, deadlineStr);
    const availableHours = dailyHours * daysAvailable;
    const schedulableHours = Math.min(task.estimatedHours, availableHours);
    const isOverdueRisk = task.estimatedHours > availableHours;

    if (schedulableHours <= 0) {
      taskStatuses.push({
        taskId: task.taskId,
        scheduleStatus: "OVERDUE_RISK",
        feasible: false,
        requiredHours: task.estimatedHours,
        availableHours: 0,
        deficitHours: task.estimatedHours,
        reviewRequired: false,
        reviewReason: null,
      });
      summary.overdueRiskTasks += 1;
      continue;
    }

    // Ideal hours per day: spread evenly, cap at what's left in daily window
    const idealPerDay = Math.min(schedulableHours / daysAvailable, dailyHours);

    let remaining = schedulableHours;
    let scheduledForTask = 0;

    for (let d = 0; d < daysAvailable && remaining > 0.001; d++) {
      const blockDate = offsetDate(todayStr, d);
      if (blockDate > deadlineStr) break;

      // How much room is left in this day across all tasks?
      const roomInDay = dailyHours - getDayUsed(blockDate);
      if (roomInDay <= 0.001) continue; // day is full, skip to next

      // Allocate up to idealPerDay for this task on this day,
      // but never more than room available or remaining hours
      const blockHours = Math.round(Math.min(idealPerDay, roomInDay, remaining) * 100) / 100;
      if (blockHours <= 0) continue;

      const dayStart = startHour + getDayUsed(blockDate);
      const block = {
        taskId: task.taskId,
        taskTitle: title,
        date: blockDate,
        startTime: formatTime(dayStart),
        endTime: formatTime(dayStart + blockHours),
        durationHours: blockHours,
        status: "PLANNED",
        priorityScoreAtGeneration: task.priorityScore,
      };

      validateBlock(block);
      blocks.push(block);
      addDayUsed(blockDate, blockHours);
      scheduledForTask += blockHours;
      remaining = Math.round((remaining - blockHours) * 100) / 100;
    }

    summary.totalScheduledHours += scheduledForTask;

    let scheduleStatus;
    if (scheduledForTask === 0) {
      scheduleStatus = "UNSCHEDULED";
      summary.unscheduledTasks += 1;
    } else if (isOverdueRisk) {
      scheduleStatus = "OVERDUE_RISK";
      summary.overdueRiskTasks += 1;
    } else {
      scheduleStatus = "SCHEDULED";
    }

    taskStatuses.push({
      taskId: task.taskId,
      scheduleStatus,
      feasible: !isOverdueRisk,
      requiredHours: task.estimatedHours,
      availableHours,
      deficitHours: Math.max(0, task.estimatedHours - availableHours),
      reviewRequired: false,
      reviewReason: null,
    });
  }

  summary.totalScheduledHours =
    Math.round(summary.totalScheduledHours * 100) / 100;

  // ── 4. Frequency/habit tasks — evenly-spaced reminder slots across today ──
  for (const task of frequencyTasks) {
    const title = task.taskTitle || task.sanitizedTitle || task.originalTitle || '';
    const freq = Math.min(task.frequencyPerDay, 48);
    const windowHours = endHour - startHour;
    // Gap between each reminder (e.g. 8 reminders across 14h = every 1.75h)
    const gapHours = windowHours / freq;
    // Slot duration: 10% of gap, capped at 15 min, rounded to 2 decimal places
    const slotDuration = Math.round(Math.min(gapHours * 0.1, 0.25) * 100) / 100 || 0.01;

    const reminderBlocks = [];
    for (let i = 0; i < freq; i++) {
      const slotStart = startHour + i * gapHours;
      const slotEnd = slotStart + slotDuration;
      if (slotStart >= endHour) break;

      const block = {
        taskId: task.taskId,
        taskTitle: title,
        date: todayStr,
        startTime: formatTime(slotStart),
        endTime: formatTime(Math.min(slotEnd, endHour)),
        durationHours: slotDuration,
        status: 'PLANNED',
        isReminder: true,
        priorityScoreAtGeneration: task.priorityScore || 0,
      };
      validateBlock(block);
      reminderBlocks.push(block);
    }

    blocks.push(...reminderBlocks);
    taskStatuses.push({
      taskId: task.taskId,
      scheduleStatus: 'SCHEDULED',
      feasible: true,
      requiredHours: 0,
      availableHours: windowHours,
      deficitHours: 0,
      reviewRequired: false,
      reviewReason: null,
      isFrequencyTask: true,
      frequencyPerDay: freq,
    });
  }

  return { blocks, summary, taskStatuses };
};

module.exports = {
  generateSchedule,
  classifyEstimate,
  isValidEstimatedHours,
  daysUntilDeadline,
  validateBlock,
  ESTIMATE_MIN,
  ESTIMATE_VALID_MAX,
  ESTIMATE_REVIEW_MAX,
};
