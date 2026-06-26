/**
 * review.service.js
 * Determines the review level for an AI-generated task plan.
 * Three tiers: NONE | WARNING | REQUIRED (no BLOCKED — simplifies frontend).
 * No external dependencies — pure JS only.
 */

/**
 * Maps daily availability strings to approximate hours per day.
 * @type {Object.<string, number>}
 */
const DAILY_HOURS_MAP = {
  '< 1 hour': 0.75,
  '1-2 hours': 1.5,
  '2-4 hours': 3,
  '4-6 hours': 5,
  '6+ hours': 7,
};

const DEFAULT_DAILY_HOURS = 4;

/**
 * Severity ordering used to ensure we always raise to the highest tier.
 * @type {string[]}
 */
const LEVEL_ORDER = ['NONE', 'WARNING', 'REQUIRED'];

/**
 * Apply three-tier review level logic.
 *
 * REQUIRED conditions (highest severity):
 *  - Deadline is today or in the past
 *  - Estimated hours mathematically impossible (hours > daysLeft × dailyH)
 *  - Composite confidence < 75
 *  - Description is blank AND difficulty is Hard/Very Hard
 *
 * WARNING conditions:
 *  - estimatedHours > 50 AND ≤ 80
 *  - Composite confidence 75–84 (inclusive)
 *
 * NONE: none of the above triggered.
 *
 * When multiple conditions fire, the highest severity wins.
 *
 * @param {object} aiPlan              - AI-generated plan (must have estimatedHours)
 * @param {object} formData            - Request body / form data from the user
 * @param {number} compositeConfidence - Composite confidence score (0–100)
 * @returns {{ reviewLevel: string, reviewReason: string, reviewRequired: boolean }}
 */
const applyReviewLevel = (aiPlan, formData, compositeConfidence) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayMidnightUTC = new Date(todayStr + 'T00:00:00Z');

  // Parse deadline — default to today if missing so we treat it as past-due
  const deadlineStr = formData.deadline || todayStr;
  const deadlineMidnightUTC = new Date(deadlineStr + 'T00:00:00Z');

  // Daily hours from availability string
  const dailyHours = DAILY_HOURS_MAP[formData.dailyAvailability] ?? DEFAULT_DAILY_HOURS;

  // Days until deadline (minimum 1 to avoid divide-by-zero)
  const msPerDay = 86400000;
  const rawDays = Math.floor((deadlineMidnightUTC - todayMidnightUTC) / msPerDay);
  const daysUntilDeadline = Math.max(1, rawDays);
  const maxPossibleHours = daysUntilDeadline * dailyHours;

  const reasons = [];
  let level = 'NONE';

  /**
   * Raise the current level if newLevel is of higher severity.
   * @param {string} newLevel
   */
  const raise = (newLevel) => {
    if (LEVEL_ORDER.indexOf(newLevel) > LEVEL_ORDER.indexOf(level)) {
      level = newLevel;
    }
  };

  // ── REQUIRED conditions ───────────────────────────────────────────────────

  // Deadline today or past
  if (deadlineMidnightUTC <= todayMidnightUTC) {
    raise('REQUIRED');
    reasons.push(`Deadline (${deadlineStr}) is today or in the past.`);
  }

  // Hours mathematically impossible given availability and remaining days
  if (aiPlan.estimatedHours > maxPossibleHours) {
    raise('REQUIRED');
    reasons.push(
      `${aiPlan.estimatedHours}h needed but only ${maxPossibleHours}h available before deadline.`
    );
  }

  // Low composite confidence
  if (compositeConfidence < 75) {
    raise('REQUIRED');
    reasons.push(`Confidence is ${compositeConfidence}% (below 75%).`);
  }

  // Blank description with hard difficulty
  const descBlank = !formData.description || formData.description.trim() === '';
  const hardDiff =
    formData.difficulty === 'Hard' || formData.difficulty === 'Very Hard';
  if (descBlank && hardDiff) {
    raise('REQUIRED');
    reasons.push(`Difficulty is ${formData.difficulty} but no description provided.`);
  }

  // ── WARNING conditions ────────────────────────────────────────────────────

  // Significant but not extreme effort
  if (aiPlan.estimatedHours > 50 && aiPlan.estimatedHours <= 80) {
    raise('WARNING');
    reasons.push(
      `Estimated effort (${aiPlan.estimatedHours}h) is significant — verify scope.`
    );
  }

  // Moderate confidence band (75–84 inclusive)
  if (compositeConfidence >= 75 && compositeConfidence <= 84) {
    raise('WARNING');
    reasons.push(
      `Confidence is ${compositeConfidence}% — consider adding more detail.`
    );
  }

  return {
    reviewLevel: level,
    reviewReason: reasons.join(' '),
    reviewRequired: level !== 'NONE', // backward-compat boolean
  };
};

module.exports = { applyReviewLevel };
