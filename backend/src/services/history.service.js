'use strict';

/**
 * history.service.js
 *
 * Provides history-based context for Gemini prompt calibration (Requirement 16)
 * and category inference from task title keywords.
 *
 * Both exported functions are best-effort: they never throw.
 */

/**
 * Category → keyword mapping used for title-based category inference.
 * Keys are the canonical category strings stored in Firestore.
 */
const CATEGORY_KEYWORDS = {
  coding:     ['code', 'build', 'implement', 'api', 'backend', 'frontend', 'deploy'],
  study:      ['revise', 'revision', 'study', 'learn', 'leetcode', 'practice'],
  assignment: ['assignment', 'dbms', 'sql', 'submit', 'lab', 'worksheet'],
  exam:       ['exam', 'test', 'viva', 'quiz'],
  meeting:    ['meeting', 'call', 'standup', 'sync'],
  personal:   ['buy', 'drink', 'water', 'grocery', 'pay', 'clean'],
  health:     ['exercise', 'workout', 'gym', 'run', 'walk', 'sleep'],
};

/**
 * buildHistoryContext
 *
 * Fetches up to 3 recently completed tasks in the same category from Firestore
 * and returns a formatted string for inclusion in the Gemini prompt context.
 *
 * @param {string|null} category - The task category to look up.
 * @param {object} firestoreService - Service exposing `getRecentCompletedByCategory`.
 * @returns {Promise<string|null>} Formatted history string, or null if unavailable.
 */
const buildHistoryContext = async (category, firestoreService) => {
  // Guard: no category → no history
  if (!category) return null;

  try {
    const completed = await firestoreService.getRecentCompletedByCategory(category, 3);

    if (!completed || completed.length === 0) return null;

    const lines = completed.map((task) => {
      const title      = task.sanitizedTitle || task.originalTitle || 'Untitled';
      const estimated  = task.estimatedHours != null ? task.estimatedHours : '?';
      const actual     = task.actualHours    != null ? task.actualHours    : 'unknown';
      return `- "${title}": estimated ${estimated}h, actual ${actual}h`;
    });

    return lines.join('\n');
  } catch {
    // Never propagate errors — history context is best-effort
    return null;
  }
};

/**
 * inferCategoryFromTitle
 *
 * Scans the task title for known keywords and returns the matching category.
 * Returns null if no keyword matches.
 *
 * @param {string} title - The raw or sanitized task title.
 * @returns {string|null} Matched category key, or null.
 */
const inferCategoryFromTitle = (title) => {
  if (!title || typeof title !== 'string') return null;

  const lower = title.toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return category;
    }
  }

  return null;
};

module.exports = {
  buildHistoryContext,
  inferCategoryFromTitle,
};
