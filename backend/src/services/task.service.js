const { sanitizeTitle } = require('../utils/sanitize');
const AppError = require('../utils/AppError');
const geminiService = require('./gemini.service');
const priorityService = require('./priority.service');
const firestoreService = require('./firestore.service');

/**
 * Applies 4 backend reviewRequired rules additively.
 * Rules fire independently of Gemini's own reviewRequired flag.
 *
 * @param {{ estimatedHours: number, confidence: number, reviewRequired: boolean, reviewReason: string }} aiPlan
 * @param {{ description?: string, difficulty?: string, deadline: string }} formData
 * @returns {{ reviewRequired: boolean, reviewReason: string }}
 */
const applyReviewRequiredRules = (aiPlan, formData) => {
  const reasons = [];

  // Rule 1: estimatedHours out of sane range
  if (aiPlan.estimatedHours > 100 || aiPlan.estimatedHours < 0.5) {
    reasons.push(
      `Estimated hours (${aiPlan.estimatedHours}) is outside the expected range (0.5–100h) — please verify the AI estimate.`
    );
  }

  // Rule 2: Low confidence
  if (aiPlan.confidence < 70) {
    reasons.push(
      `AI confidence is ${aiPlan.confidence}% (below 70%) — the decomposition may be inaccurate.`
    );
  }

  // Rule 3: No description AND hard difficulty
  const descBlank = !formData.description || formData.description.trim() === '';
  const hardDifficulty = formData.difficulty === 'Hard' || formData.difficulty === 'Very Hard';
  if (descBlank && hardDifficulty) {
    reasons.push(
      `Task difficulty is ${formData.difficulty} but no description was provided — additional context is recommended.`
    );
  }

  // Rule 4: Deadline is today or in the past (date-only comparison at midnight UTC)
  const deadlineMidnightUTC = new Date(formData.deadline + 'T00:00:00Z');
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayMidnightUTC = new Date(todayStr + 'T00:00:00Z');
  if (deadlineMidnightUTC <= todayMidnightUTC) {
    reasons.push(
      `The deadline (${formData.deadline}) is today or in the past — immediate review required.`
    );
  }

  // Backend rules are the sole authority for reviewRequired.
  // Gemini's own reviewRequired flag is ignored — only the 4 rules above determine it.
  // Gemini's reviewReason is included only when at least one backend rule also fires.
  const finalReviewRequired = reasons.length > 0;
  const geminiReason = finalReviewRequired && aiPlan.reviewReason ? aiPlan.reviewReason : '';
  const allReasons = geminiReason ? [geminiReason, ...reasons] : reasons;
  const finalReviewReason = allReasons.filter(Boolean).join(' ');

  return { reviewRequired: finalReviewRequired, reviewReason: finalReviewReason };
};

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

/**
 * Generates an AI_Plan without persisting anything.
 * Returns either an AI_Plan or a ClarificationResponse.
 *
 * Enforces the 1-round clarification loop limit (Requirement 4.8):
 * if `body._isClarificationResubmit` is true and Gemini still returns
 * `clarificationRequired: true`, throws HTTP 422 instead of passing
 * the clarification response back to the client.
 *
 * @param {object} body - Validated request body matching previewSchema
 * @param {string} requestId
 * @returns {Promise<object>} AI_Plan or { clarificationRequired: true, questions: [...] }
 */
const previewTask = async (body, requestId) => {
  const sanitizedTitle = sanitizeTitle(body.title);
  if (!sanitizedTitle) {
    throw new AppError('Task title is empty after sanitization', 400);
  }

  const contextObj = {
    title: sanitizedTitle,
    description: body.description || null,
    category: body.category || null,
    taskType: body.taskType || null,
    difficulty: body.difficulty || null,
    importance: body.importance,
    deadline: body.deadline,
    dailyAvailability: body.dailyAvailability || null,
    preferredWorkingTime: body.preferredWorkingTime || null,
  };

  const result = await geminiService.decomposeFull(contextObj, requestId);

  // Requirement 4.8: Clarification loop is limited to 1 round.
  // If this is a resubmit after clarification and Gemini still wants clarification,
  // treat it as an AI_Plan generation failure.
  if (body._isClarificationResubmit === true && result.clarificationRequired === true) {
    throw new AppError(
      'Could not generate a plan after clarification. Please provide more detail or try a different task description.',
      422
    );
  }

  // Apply backend reviewRequired rules to the AI_Plan before returning to the frontend,
  // so the preview card shows the accurate flag (not Gemini's raw flag).
  if (!result.clarificationRequired) {
    const { reviewRequired, reviewReason } = applyReviewRequiredRules(result, body);
    result.reviewRequired = reviewRequired;
    result.reviewReason = reviewReason;
  }

  return result;
};

/**
 * Persists the approved task to Firestore after recomputing backend rules.
 * Ignores client-supplied reviewRequired — always recomputes from form data.
 *
 * @param {object} body - Validated request body matching approveSchema
 * @param {string} requestId
 * @returns {Promise<object>} Saved Firestore task document
 */
const approveTask = async (body, requestId) => {
  const sanitizedTitle = sanitizeTitle(body.title);
  const aiPlan = body.aiPlan;

  // Recompute reviewRequired — ignores client-submitted value
  const { reviewRequired, reviewReason } = applyReviewRequiredRules(aiPlan, body);

  // Deterministic priority score (same formula as createTask)
  const priorityScore = priorityService.calculatePriority({
    deadline: body.deadline,
    importance: body.importance,
    estimatedHours: aiPlan.estimatedHours,
  });

  const taskDoc = {
    originalTitle: body.title,
    sanitizedTitle,
    deadline: body.deadline,
    importance: body.importance,
    description: body.description || null,
    category: body.category || null,
    taskType: body.taskType || null,
    difficulty: body.difficulty || null,
    dailyAvailability: body.dailyAvailability || null,
    preferredWorkingTime: body.preferredWorkingTime || null,
    estimatedHours: aiPlan.estimatedHours,
    priorityScore,
    subtasks: aiPlan.subtasks,
    understanding: aiPlan.understanding,
    confidence: aiPlan.confidence,
    risks: aiPlan.risks,
    reviewRequired,
    reviewReason,
    attachments: body.attachments || [],
    // NOTE: suggestedPriorityScore is intentionally NOT stored
  };

  return firestoreService.saveTask(taskDoc, requestId);
};

module.exports = { createTask, getAllTasks, previewTask, approveTask, applyReviewRequiredRules };
