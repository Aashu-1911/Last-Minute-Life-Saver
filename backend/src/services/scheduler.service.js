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

  for (const task of tasks) {
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

  // ── 3. Greedy scheduling — shared day cursor prevents inter-task overlap ──
  let dayOffset = 0;
  let currentDayFilled = 0;

  for (const task of schedulableTasks) {
    const title =
      task.taskTitle || task.sanitizedTitle || task.originalTitle || "";
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

    let remaining = schedulableHours;
    let scheduledForTask = 0;

    while (remaining > 0) {
      if (currentDayFilled >= dailyHours) {
        dayOffset += 1;
        currentDayFilled = 0;
      }

      const blockDate = offsetDate(todayStr, dayOffset);
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
        status: "PLANNED",
        priorityScoreAtGeneration: task.priorityScore,
      };

      validateBlock(block);
      blocks.push(block);
      scheduledForTask += blockHours;
      currentDayFilled += blockHours;
      remaining -= blockHours;
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
