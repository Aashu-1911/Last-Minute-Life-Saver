/**
 * confidence.service.js
 * Computes composite confidence score from Gemini confidence + input quality signals.
 * No external dependencies — pure JS only.
 */

/**
 * Compute a composite confidence score blending three weighted components:
 *  - Gemini confidence score (50%)
 *  - Input completeness score (30%)
 *  - Deadline consistency score (20%)
 *
 * @param {number} geminiConfidence - Raw confidence score from Gemini (0–100)
 * @param {object} body             - Request body containing task form fields
 * @returns {number} Integer in range [0, 100]
 */
const computeCompositeConfidence = (geminiConfidence, body) => {
  // Component 1: Gemini confidence (50%)
  const geminiScore = geminiConfidence;

  // Component 2: Input completeness (30%)
  let completenessRaw = 0;
  if (body.description && body.description.trim().length > 10) completenessRaw += 20;
  const optionalFields = [
    'category',
    'taskType',
    'difficulty',
    'dailyAvailability',
    'preferredWorkingTime',
    'experienceLevel',
  ];
  optionalFields.forEach((f) => {
    if (body[f]) completenessRaw += 5;
  });
  const completenessScore = Math.min(completenessRaw, 100); // cap at 100

  // Component 3: Deadline consistency (20%)
  const todayStr = new Date().toISOString().slice(0, 10);
  const deadlineInPast = body.deadline && body.deadline <= todayStr;
  const consistencyScore = deadlineInPast ? 0 : 100;

  // Weighted composite
  const composite = Math.round(
    geminiScore * 0.5 + completenessScore * 0.3 + consistencyScore * 0.2
  );

  return Math.min(100, Math.max(0, composite));
};

module.exports = { computeCompositeConfidence };
