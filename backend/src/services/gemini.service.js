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

module.exports = { decomposeTask };
