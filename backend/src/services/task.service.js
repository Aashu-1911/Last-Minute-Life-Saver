const { sanitizeTitle } = require('../utils/sanitize');
const AppError = require('../utils/AppError');
const geminiService = require('./gemini.service');
const priorityService = require('./priority.service');
const firestoreService = require('./firestore.service');

/**
 * Orchestrates the full task creation workflow:
 * sanitize → Gemini decompose → priority score → Firestore persist
 *
 * @param {{ title: string, deadline: string, importance: number }} input
 * @param {string} requestId
 * @returns {Promise<object>} Complete task object with taskId
 */
const createTask = async ({ title, deadline, importance }, requestId) => {
  // 1. Sanitize title
  const sanitizedTitle = sanitizeTitle(title);
  if (!sanitizedTitle) {
    throw new AppError('Task title is empty after sanitization', 400);
  }

  // 2. Decompose via Gemini
  const { estimatedHours, subtasks } = await geminiService.decomposeTask(sanitizedTitle, requestId);

  // 3. Calculate priority score
  const priorityScore = priorityService.calculatePriority({ deadline, importance, estimatedHours });

  // 4. Persist to Firestore
  const saved = await firestoreService.saveTask(
    {
      originalTitle: title,
      sanitizedTitle,
      deadline,
      importance,
      estimatedHours,
      priorityScore,
      subtasks,
    },
    requestId
  );

  // 5. Return complete task object
  return saved;
};

/**
 * Retrieves all tasks, delegating to Firestore service.
 * @returns {Promise<object[]>}
 */
const getAllTasks = () => firestoreService.getAllTasks();

module.exports = { createTask, getAllTasks };
