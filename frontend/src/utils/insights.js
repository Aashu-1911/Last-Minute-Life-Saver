/**
 * Computes all AI insights and productivity score from existing context data.
 * Pure function — no API calls, no side effects.
 */

// Human-readable labels for structured reviewReason codes
const REVIEW_REASON_LABELS = {
  ESTIMATE_EXCEEDS_MAXIMUM: 'Estimated effort exceeds the allowed maximum.',
  ESTIMATE_BELOW_MINIMUM: 'Estimated effort is below the allowed minimum.',
  INVALID_AI_OUTPUT: 'AI returned an invalid effort estimate.',
  MANUAL_REVIEW_REQUIRED: 'This task requires manual review before scheduling.',
};

export const getReviewReasonLabel = (code) =>
  REVIEW_REASON_LABELS[code] || code || 'This task requires review before scheduling.';

export const computeInsights = (tasks = [], taskStatuses = [], summary = {}) => {
  const {
    totalScheduledHours = 0,
    overdueRiskTasks = 0,
    reviewRequiredTasks = 0,
    unscheduledTasks = 0,
  } = summary;

  const taskMap = Object.fromEntries(tasks.map((t) => [t.taskId, t]));

  const getTitle = (taskId) =>
    taskMap[taskId]?.sanitizedTitle || taskMap[taskId]?.originalTitle || taskId;

  // Scheduling risk: only OVERDUE_RISK tasks with a real deficit
  const schedulingRiskStatuses = taskStatuses.filter(
    (s) => s.scheduleStatus === 'OVERDUE_RISK' && s.deficitHours != null && s.deficitHours > 0
  );
  const biggestRiskStatus = [...schedulingRiskStatuses].sort((a, b) => b.deficitHours - a.deficitHours)[0] || null;
  const biggestRisk = biggestRiskStatus
    ? {
        taskId: biggestRiskStatus.taskId,
        taskTitle: getTitle(biggestRiskStatus.taskId),
        requiredHours: biggestRiskStatus.requiredHours,
        availableHours: biggestRiskStatus.availableHours,
        deficitHours: biggestRiskStatus.deficitHours,
        type: 'scheduling',
      }
    : null;

  // Validation risk: REVIEW_REQUIRED tasks (separate category)
  const validationRiskStatuses = taskStatuses.filter((s) => s.reviewRequired);
  const biggestValidationRisk = validationRiskStatuses[0]
    ? {
        taskId: validationRiskStatuses[0].taskId,
        taskTitle: getTitle(validationRiskStatuses[0].taskId),
        reviewReason: validationRiskStatuses[0].reviewReason,
        requiredHours: validationRiskStatuses[0].requiredHours,
        type: 'validation',
      }
    : null;

  // Highest leverage: SCHEDULED task with most requiredHours
  const scheduledStatuses = taskStatuses.filter((s) => s.scheduleStatus === 'SCHEDULED');
  const topLeverage = [...scheduledStatuses].sort((a, b) => b.requiredHours - a.requiredHours)[0] || null;
  const highestLeverage = topLeverage
    ? {
        taskId: topLeverage.taskId,
        taskTitle: getTitle(topLeverage.taskId),
        scheduledHours: topLeverage.requiredHours,
      }
    : null;

  // Capacity utilization
  const totalPossibleHours = totalScheduledHours + (unscheduledTasks > 0 ? unscheduledTasks * 4 : 0);
  const capacityUtilization =
    totalPossibleHours > 0
      ? Math.round((totalScheduledHours / totalPossibleHours) * 100)
      : totalScheduledHours > 0
      ? 100
      : 0;

  // Productivity score: clamp(100 - overdue*15 - review*5 + min(hours/10, 20), 0, 100)
  const raw =
    100 - overdueRiskTasks * 15 - reviewRequiredTasks * 5 + Math.min(totalScheduledHours / 10, 20);
  const productivityScore = Math.max(0, Math.min(100, Math.round(raw)));

  return {
    biggestRisk,
    biggestValidationRisk,
    highestLeverage,
    capacityUtilization,
    productivityScore,
  };
};
