/**
 * decision.service.js
 * Computes all AI decision metadata (confidence, review level, urgency, workload).
 * Does NOT import or modify priority.service.js.
 */

const confidenceService = require('./confidence.service');
const reviewService = require('./review.service');

/**
 * Compute all AI decision metadata for a given AI plan and form data.
 *
 * @param {object} aiPlan   - AI-generated plan (must have `confidence` and `estimatedHours`)
 * @param {object} formData - Request body / form data from the user (must have `deadline`)
 * @returns {{
 *   compositeConfidence: number,
 *   reviewLevel: string,
 *   reviewReason: string,
 *   reviewRequired: boolean,
 *   urgencyScore: number,
 *   workloadScore: number
 * }}
 */
const computeDecision = (aiPlan, formData) => {
  // 1. Composite confidence (blends Gemini score + completeness + consistency)
  const compositeConfidence = confidenceService.computeCompositeConfidence(
    aiPlan.confidence,
    formData
  );

  // 2. Three-tier review level (NONE | WARNING | REQUIRED)
  const { reviewLevel, reviewReason, reviewRequired } = reviewService.applyReviewLevel(
    aiPlan,
    formData,
    compositeConfidence
  );

  // 3. Urgency score (0–40): based on days until deadline via midnight UTC comparison
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayMidnightUTC = new Date(todayStr + 'T00:00:00Z');
  const deadlineStr = formData.deadline || todayStr;
  const deadlineMidnightUTC = new Date(deadlineStr + 'T00:00:00Z');

  const daysUntilDeadline = Math.max(
    1,
    Math.floor((deadlineMidnightUTC - todayMidnightUTC) / 86400000)
  );
  const urgencyScore = Math.max(0, 40 - Math.floor(daysUntilDeadline / 3));

  // 4. Workload score (0–15): relative effort vs 100h ceiling
  const workloadScore = Math.min(15, (aiPlan.estimatedHours / 100) * 15);

  return {
    compositeConfidence,
    reviewLevel,
    reviewReason,
    reviewRequired,
    urgencyScore,
    workloadScore,
  };
};

module.exports = { computeDecision };
