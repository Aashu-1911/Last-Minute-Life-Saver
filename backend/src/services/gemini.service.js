const Joi = require('joi');
const model = require('../config/gemini');
const logger = require('../config/logger');

const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

const FALLBACK = {
  estimatedHours: 4,
  subtasks: [
    { name: 'Planning', hours: 1 },
    { name: 'Execution', hours: 2 },
    { name: 'Review', hours: 1 },
  ],
  _fallback: true,
};

const responseSchema = Joi.object({
  estimatedHours: Joi.number().positive().required(),
  subtasks: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().min(1).required(),
        hours: Joi.number().positive().required(),
      })
    )
    .required(),
}).unknown(true); // allow extra keys like _fallback during validation

const buildPrompt = (sanitizedTitle) =>
  `You are a task planning assistant.
Analyze the following task and return ONLY valid JSON.
Do not use markdown. Do not use code fences. Do not include explanations.
Do not include comments. Do not include any text before or after the JSON object.

Task: "${sanitizedTitle}"

Required JSON format:
{
  "estimatedHours": <total positive number>,
  "subtasks": [
    { "name": "<subtask name>", "hours": <positive number> }
  ]
}`;

/**
 * Calls Gemini with a 30-second timeout.
 * @param {string} prompt
 * @returns {Promise<string>} raw text response
 */
const callWithTimeout = (prompt) => {
  const apiCall = model.generateContent(prompt).then((result) => result.response.text());
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Gemini request timed out after 30s')), TIMEOUT_MS)
  );
  return Promise.race([apiCall, timeout]);
};

/**
 * Decomposes a sanitized task title using the Gemini API.
 * Retries up to 3 times; returns fallback if all attempts fail.
 * @param {string} sanitizedTitle
 * @param {string} requestId
 * @returns {Promise<{ estimatedHours: number, subtasks: Array<{ name: string, hours: number }> }>}
 */
const decomposeTask = async (sanitizedTitle, requestId) => {
  const prompt = buildPrompt(sanitizedTitle);

  logger.debug('Gemini prompt built', { requestId, prompt });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const rawText = await callWithTimeout(prompt);

      logger.info('Gemini raw response received', { requestId, attempt, rawText });

      const parsed = JSON.parse(rawText);

      // Log token usage if present
      if (parsed.usageMetadata) {
        logger.info('Gemini token usage', { requestId, usage: parsed.usageMetadata });
      }

      const { error, value } = responseSchema.validate(parsed);
      if (error) {
        throw new Error(`Schema validation failed: ${error.message}`);
      }

      // Return only the fields we need, no extra keys
      return {
        estimatedHours: value.estimatedHours,
        subtasks: value.subtasks,
      };
    } catch (err) {
      logger.warn('Gemini attempt failed', { requestId, attempt, error: err.message });
    }
  }

  // All attempts exhausted — use fallback
  logger.warn('All Gemini attempts failed, using fallback', { requestId });

  const { _fallback, ...fallbackResult } = FALLBACK;
  return fallbackResult;
};

// ─── decomposeFull additions ────────────────────────────────────────────────

const aiPlanSchema = Joi.object({
  understanding: Joi.string().min(1).required(),
  estimatedHours: Joi.number().positive().required(),
  suggestedPriorityScore: Joi.number().integer().min(0).max(100).required(),
  confidence: Joi.number().integer().min(0).max(100).required(),
  reviewRequired: Joi.boolean().required(),
  reviewReason: Joi.string().allow('').required(),
  risks: Joi.array().items(Joi.string()).required(),
  subtasks: Joi.array().items(
    Joi.object({ name: Joi.string().min(1).required(), hours: Joi.number().positive().required() })
  ).min(1).required(),
}).unknown(false);

const clarificationSchema = Joi.object({
  clarificationRequired: Joi.boolean().valid(true).required(),
  questions: Joi.array().items(Joi.string().min(1)).min(2).max(5).required(),
});

const FULL_FALLBACK = {
  understanding: 'Could not analyse task. Please review manually.',
  estimatedHours: 4,
  suggestedPriorityScore: 50,
  confidence: 0,
  reviewRequired: true,
  reviewReason: 'AI decomposition failed after 3 attempts — manual review required.',
  risks: [],
  subtasks: [
    { name: 'Planning', hours: 1 },
    { name: 'Execution', hours: 2 },
    { name: 'Review', hours: 1 },
  ],
};

const buildFullPrompt = (ctx) => `
You are a task planning assistant for an AI productivity app.

Analyze the following task and return ONLY valid JSON — no markdown, no code fences, no prose.

Task Context:
- Title: "${ctx.title}"
- Description: ${ctx.description || 'not provided'}
- Category: ${ctx.category || 'not provided'}
- Task Type: ${ctx.taskType || 'not provided'}
- Difficulty: ${ctx.difficulty || 'not provided'}
- Importance (1-5): ${ctx.importance}
- Deadline: ${ctx.deadline}
- Daily Availability: ${ctx.dailyAvailability || 'not provided'}
- Preferred Working Time: ${ctx.preferredWorkingTime || 'not provided'}

If the title is too vague to plan confidently, return:
{
  "clarificationRequired": true,
  "questions": ["<option 1>", "<option 2>", ...]
}
(2-5 suggested clarification options as strings)

Otherwise return:
{
  "understanding": "<your interpretation of what this task requires>",
  "estimatedHours": <positive number>,
  "suggestedPriorityScore": <integer 0-100>,
  "confidence": <integer 0-100>,
  "reviewRequired": <boolean>,
  "reviewReason": "<empty string or reason>",
  "risks": ["<risk>", ...],
  "subtasks": [{ "name": "<name>", "hours": <positive number> }]
}
`.trim();

/**
 * Decomposes a task using a rich multi-field context object.
 * Retries up to 3 times; returns FULL_FALLBACK if all attempts fail.
 * @param {object} contextObj
 * @param {string} contextObj.title
 * @param {string|null} contextObj.description
 * @param {string|null} contextObj.category
 * @param {string|null} contextObj.taskType
 * @param {string|null} contextObj.difficulty
 * @param {number} contextObj.importance
 * @param {string} contextObj.deadline
 * @param {string|null} contextObj.dailyAvailability
 * @param {string|null} contextObj.preferredWorkingTime
 * @param {string} requestId
 * @returns {Promise<object>} AI_Plan or ClarificationResponse
 */
const decomposeFull = async (contextObj, requestId) => {
  const prompt = buildFullPrompt(contextObj);

  logger.debug('decomposeFull prompt built', { requestId, prompt });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const rawText = await callWithTimeout(prompt);

      logger.info('decomposeFull raw response received', { requestId, attempt, rawText });

      const parsed = JSON.parse(rawText);

      if (parsed.clarificationRequired === true) {
        const { error } = clarificationSchema.validate(parsed);
        if (!error) {
          return { clarificationRequired: true, questions: parsed.questions };
        }
        throw new Error(`Clarification schema invalid: ${error.message}`);
      }

      const { error, value } = aiPlanSchema.validate(parsed);
      if (!error) {
        return value;
      }
      throw new Error(`AI_Plan schema invalid: ${error.message}`);
    } catch (err) {
      logger.warn('decomposeFull attempt failed', { requestId, attempt, error: err.message });
    }
  }

  // All 3 attempts failed — return fallback, never throw
  logger.warn('All decomposeFull attempts failed, returning fallback', { requestId });
  return FULL_FALLBACK;
};

module.exports = { decomposeTask, decomposeFull, aiPlanSchema, FULL_FALLBACK };
