/**
 * Priority Service — deterministic priority scoring.
 * No external calls; purely mathematical.
 */

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Calculates a priority score between 0 and 100.
 * @param {{ deadline: string, importance: number, estimatedHours: number }} params
 * @returns {number} Integer priority score 0–100
 */
const calculatePriority = ({ deadline, importance, estimatedHours }) => {
  // Compare dates at midnight UTC to ensure deterministic results within the same day
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayMidnight = new Date(todayStr + 'T00:00:00Z');
  const deadlineMidnight = new Date(deadline + 'T00:00:00Z');

  const msPerDay = 1000 * 60 * 60 * 24;
  const deadlineDays = Math.max(0, Math.round((deadlineMidnight - todayMidnight) / msPerDay));

  // 50% weight — closer deadline = higher score
  const deadlineScore = clamp(1 - deadlineDays / 30, 0, 1);

  // 30% weight — importance 1–5 normalized to 0–1
  const importanceScore = (importance - 1) / 4;

  // 20% weight — effort relative to 20h ceiling
  const effortScore = clamp(estimatedHours / 20, 0, 1);

  const raw = deadlineScore * 0.5 + importanceScore * 0.3 + effortScore * 0.2;

  return clamp(Math.round(raw * 100), 0, 100);
};

module.exports = { calculatePriority };
