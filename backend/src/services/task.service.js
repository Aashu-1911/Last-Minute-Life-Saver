const { sanitizeTitle } = require('../utils/sanitize');
const AppError = require('../utils/AppError');
const geminiService = require('./gemini.service');
const priorityService = require('./priority.service');
const firestoreService = require('./firestore.service');
const confidenceService = require('./confidence.service');
const reviewService = require('./review.service');
const historyService = require('./history.service');
const visionService = require('./vision.service');
const decisionService = require('./decision.service');
const model = require('../config/gemini');

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
 * Merges extracted attachment context into the description string.
 * Caps the result at 2000 characters.
 *
 * @param {string|null} description
 * @param {object|null} extractions - Structured data extracted from attachment
 * @returns {string|null}
 */
const mergeAttachmentContext = (description, extractions) => {
  if (!extractions) return description || null;
  const extractedStr = typeof extractions === 'string'
    ? extractions
    : JSON.stringify(extractions);
  const merged = [description, extractedStr].filter(Boolean).join('\n\nExtracted from attachment:\n');
  return merged.slice(0, 2000);
};

/**
 * Generates an AI_Plan without persisting anything.
 * Returns either an AI_Plan or a ClarificationResponse.
 *
 * Enforces the 1-round clarification loop limit (Requirement 4.8):
 * if `body._isClarificationResubmit` is true and Gemini still returns
 * `clarificationRequired: true`, throws HTTP 422 instead of passing
 * the clarification response back to the client.
 *
 * Enrichments (Requirements 1, 4, 16, 17):
 *  - Fetches history context for Gemini prompt calibration
 *  - Auto-detects category from title if not provided
 *  - Analyzes attachments via Gemini Vision and merges into description
 *  - Computes composite confidence, review level, and review metadata via decisionService
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

  // 1. Fetch history context (up to 3 recent completed tasks of same category)
  const historyContext = await historyService.buildHistoryContext(body.category, firestoreService);

  // 2. Auto-detect category if not provided
  const effectiveCategory = body.category || historyService.inferCategoryFromTitle(body.title);

  // 3. Attachment intelligence — analyze attachments via Gemini Vision
  let attachmentExtractions = null;
  if (body.attachments && body.attachments.length > 0) {
    attachmentExtractions = await visionService.analyzeAttachment(body.attachments, model, requestId)
      .catch(() => null); // fallback silently on Vision API error
  }

  const contextObj = {
    title: sanitizedTitle,
    description: mergeAttachmentContext(body.description, attachmentExtractions),
    category: effectiveCategory || null,
    taskType: body.taskType || null,
    difficulty: body.difficulty || null,
    importance: body.importance,
    deadline: body.deadline,
    dailyAvailability: body.dailyAvailability || null,
    preferredWorkingTime: body.preferredWorkingTime || null,
    experienceLevel: body.experienceLevel || 'Intermediate',
    historyContext,
    // Assumption corrections from the replan flow (Task 17) — kept separate from description.
    // When present, gemini.service will inject these as a "User Corrections" section in the prompt.
    corrections: body._corrections && body._corrections.length > 0 ? body._corrections : null,
  };

  const result = await geminiService.decomposeFull(contextObj, requestId);

  // Requirement 4.8: Clarification loop is limited to 1 round.
  // If this is a resubmit after clarification and Gemini still wants clarification,
  // treat it as an AI_Plan generation failure.
  if (body._isClarificationResubmit === true && result.clarificationRequired === true) {
    throw new AppError(
      'Could not generate a plan after clarification. Please add more detail.',
      422
    );
  }

  // Compute AI decision metadata (composite confidence, review level) for non-clarification results
  if (!result.clarificationRequired) {
    const decision = decisionService.computeDecision(result, body);
    result.compositeConfidence = decision.compositeConfidence;
    result.reviewLevel = decision.reviewLevel;
    result.reviewReason = decision.reviewReason;
    result.reviewRequired = decision.reviewRequired;
  }

  return result;
};

/**
 * Persists the approved task to Firestore after recomputing backend rules.
 * Ignores client-supplied reviewRequired/confidence — always recomputes server-side.
 *
 * When body.sourceTaskId is present (Quick Task upgrade path), the existing
 * document is updated via firestoreService.updateTask instead of creating a new one.
 *
 * @param {object} body - Validated request body matching approveSchema
 * @param {string} requestId
 * @returns {Promise<object>} Saved or updated Firestore task document
 */
const approveTask = async (body, requestId) => {
  const sanitizedTitle = sanitizeTitle(body.title);
  const aiPlan = body.aiPlan;

  // Server-side recompute of all AI decision metadata — client values ignored
  const decision = decisionService.computeDecision(aiPlan, body);
  const { compositeConfidence, reviewLevel, reviewReason, reviewRequired } = decision;

  // Deterministic priority score (unchanged signature — Requirement 12)
  const priorityScore = priorityService.calculatePriority({
    deadline: body.deadline,
    importance: body.importance,
    estimatedHours: aiPlan.estimatedHours,
  });

  // Immutable snapshot of why the AI made this plan (stored at approve time)
  const planningSnapshot = {
    confidence: aiPlan.confidence,
    compositeConfidence,
    reviewLevel,
    reasoning: aiPlan.reasoning || null,
    deliverables: aiPlan.deliverables || [],
    risks: aiPlan.risks || [],
  };

  const taskDoc = {
    // Core fields
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
    experienceLevel: body.experienceLevel || null,
    // Estimation and scheduling
    estimatedHours: aiPlan.estimatedHours,
    priorityScore,
    actualHours: null,
    taskMode: 'ai',
    scheduledBy: 'AI',
    // AI plan fields (v2)
    subtasks: aiPlan.subtasks,
    taskUnderstanding: aiPlan.taskUnderstanding || null,
    understanding: aiPlan.understanding,
    compositeConfidence,
    confidence: aiPlan.confidence,
    reasoning: aiPlan.reasoning || '',
    risks: aiPlan.risks || [],
    deliverables: aiPlan.deliverables || [],
    aiSuggestions: aiPlan.aiSuggestions || [],
    // Review metadata (server-computed)
    reviewLevel,
    reviewReason,
    reviewRequired,
    // Immutable planning snapshot
    planningSnapshot,
    // Attachments
    attachments: body.attachments || [],
    // NOTE: suggestedPriorityScore is intentionally NOT stored
  };

  // Quick Task upgrade path: update existing document instead of creating new one
  if (body.sourceTaskId) {
    return firestoreService.updateTask(body.sourceTaskId, taskDoc, requestId);
  }

  return firestoreService.saveTask(taskDoc, requestId);
};

/**
 * Keyword → estimated hours mapping for Quick Tasks (Requirement 11.9)
 */
const KEYWORD_HOURS = {
  meeting: 1,
  call: 0.5,
  read: 0.5,
  submit: 0.25,
  email: 0.25,
  buy: 0.25,
};

/**
 * Creates a Quick Task — a lightweight task without AI decomposition.
 * Saves immediately to Firestore with keyword-inferred estimatedHours
 * and optional priority score when a deadline is provided.
 *
 * Quick Task documents store NO null AI fields — only the fields they
 * actually have are included in the document (Requirement 18.3 / tasks.md note).
 *
 * @param {object} body - Validated request body matching quickTaskSchema
 * @param {string} requestId
 * @returns {Promise<object>} Saved Firestore task document
 */
const createQuickTask = async (body, requestId) => {
  // 1. Sanitize title
  const sanitizedTitle = sanitizeTitle(body.title);
  if (!sanitizedTitle) {
    throw new AppError('Title empty after sanitization', 400);
  }

  // 2. Estimated hours — keyword inference for regular tasks; 0 for frequency/habit tasks
  const titleLower = sanitizedTitle.toLowerCase();
  let estimatedHours;
  if (body.frequencyPerDay) {
    // Frequency tasks (e.g. "Drink water 8x") are habit reminders — no time budget needed
    estimatedHours = 0;
  } else {
    estimatedHours = Object.entries(KEYWORD_HOURS).find(([kw]) => titleLower.includes(kw))?.[1] ?? 0.5;
  }

  // 3. Core fields
  const deadline = body.deadline || null;
  const importance = body.importance || 3;

  // 4. Priority score — only computed when a deadline is provided (Requirement 13.4)
  const priorityScore = deadline
    ? priorityService.calculatePriority({ deadline, importance, estimatedHours })
    : 0;

  // 5. Auto-detect category if not provided (Requirement 11 / design notes)
  const category = body.category || historyService.inferCategoryFromTitle(body.title) || null;

  // 6. Build taskDoc with ONLY fields Quick Tasks actually have — no null AI fields
  const taskDoc = {
    originalTitle: body.title,
    sanitizedTitle,
    deadline,
    importance,
    estimatedHours,
    priorityScore,
    status: 'PENDING',
    taskMode: 'quick',
    subtasks: [],
    description: body.description || null,
    category,
    preferredWorkingTime: body.preferredWorkingTime || null,
    dailyAvailability: body.dailyAvailability || null,
    experienceLevel: body.experienceLevel || null,
    timePreference: body.timePreference || null,
    energyLevel: body.energyLevel || null,
    scheduledBy: 'User',
    actualHours: null,
    attachments: [],
  };

  // Frequency field — only stored when the user provided it
  if (body.frequencyPerDay) taskDoc.frequencyPerDay = body.frequencyPerDay;

  // 7. Persist to Firestore
  return firestoreService.saveTask(taskDoc, requestId);
};

/**
 * Updates the status of a task document.
 * @param {string} taskId
 * @param {string} status - 'COMPLETED' | 'PENDING' | 'IN_PROGRESS'
 * @param {string} requestId
 */
const updateTaskStatus = async (taskId, status, requestId) => {
  const fields = { status };
  if (status === 'COMPLETED') {
    fields.completedAt = new Date().toISOString();
  }
  return firestoreService.updateTask(taskId, fields, requestId);
};

/**
 * Toggles the completed state of a specific subtask by index.
 * Reads the current subtasks array, updates the target subtask, writes back.
 * @param {string} taskId
 * @param {number} index
 * @param {boolean} completed
 * @param {string} requestId
 * @returns {Promise<Array>} Updated subtasks array
 */
const toggleSubtask = async (taskId, index, completed, requestId) => {
  // Read current task to get subtasks array
  const tasks = await firestoreService.getAllTasks();
  const task = tasks.find((t) => t.taskId === taskId);
  if (!task) throw new AppError(`Task ${taskId} not found`, 404);

  const subtasks = [...(task.subtasks || [])];
  if (index >= subtasks.length) throw new AppError(`Subtask index ${index} out of range`, 400);

  subtasks[index] = { ...subtasks[index], completed };

  // Auto-complete parent task when all subtasks are done
  const allDone = subtasks.every((s) => s.completed);
  await firestoreService.updateTask(taskId, {
    subtasks,
    ...(allDone ? { status: 'COMPLETED', completedAt: new Date().toISOString() } : {}),
  }, requestId);

  return subtasks;
};

module.exports = { createTask, getAllTasks, previewTask, approveTask, createQuickTask, applyReviewRequiredRules, mergeAttachmentContext, updateTaskStatus, toggleSubtask };
