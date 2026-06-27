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

const taskUnderstandingSchema = Joi.object({
  goal:                 Joi.string().min(1).required(),
  detectedRequirements: Joi.array().items(Joi.string()).required(),
  assumptions:          Joi.array().items(Joi.string()).required(),
  constraints:          Joi.array().items(Joi.string()).required(),
  planningStrategy:     Joi.string().min(1).required(),
});

const explainabilitySchema = Joi.object({
  priorityExplanation:   Joi.string().min(1).required(),
  hoursExplanation:      Joi.string().min(1).required(),
  confidenceExplanation: Joi.string().min(1).required(),
  reviewExplanation:     Joi.string().min(1).required(),
});

const aiPlanSchema = Joi.object({
  taskUnderstanding:      taskUnderstandingSchema.required(),
  understanding:          Joi.string().min(1).required(),
  estimatedHours:         Joi.number().positive().required(),
  suggestedPriorityScore: Joi.number().integer().min(0).max(100).required(),
  confidence:             Joi.number().integer().min(0).max(100).required(),
  reviewRequired:         Joi.boolean().required(),
  reviewReason:           Joi.string().allow('').required(),
  risks:                  Joi.array().items(Joi.string()).required(),
  deliverables:           Joi.array().items(Joi.string()).required(),
  subtasks:               Joi.array().items(
    Joi.object({
      name:      Joi.string().min(1).required(),
      hours:     Joi.number().positive().required(),
      dependsOn: Joi.array().items(Joi.string()).optional(),
    })
  ).min(1).required(),
  reasoning:      Joi.string().min(1).required(),
  explainability: explainabilitySchema.required(),
  aiSuggestions:  Joi.array().items(
    Joi.object({
      title:  Joi.string().required(),
      reason: Joi.string().required(),
      action: Joi.string().required(),
    })
  ).max(4).required(),
}).unknown(false);

const clarificationSchema = Joi.object({
  clarificationRequired: Joi.boolean().valid(true).required(),
  questions: Joi.array().items(Joi.string().min(1)).min(2).max(5).required(),
});

const FULL_FALLBACK = {
  taskUnderstanding: {
    goal: 'Could not analyse task.',
    detectedRequirements: [],
    assumptions: [],
    constraints: [],
    planningStrategy: 'Sequential execution.',
  },
  understanding: 'Could not analyse task. Please review manually.',
  estimatedHours: 4,
  suggestedPriorityScore: 50,
  confidence: 0,
  reviewRequired: true,
  reviewReason: 'AI decomposition failed after 3 attempts.',
  risks: [],
  deliverables: [],
  subtasks: [
    { name: 'Planning', hours: 1, dependsOn: [] },
    { name: 'Execution', hours: 2, dependsOn: ['Planning'] },
    { name: 'Review', hours: 1, dependsOn: ['Execution'] },
  ],
  reasoning: 'N.O.V.A. could not generate a plan. Please add more detail and try again.',
  explainability: {
    priorityExplanation: 'Default priority assigned.',
    hoursExplanation: 'Default 4h estimate used.',
    confidenceExplanation: 'Confidence is 0% because decomposition failed.',
    reviewExplanation: 'Review required because AI decomposition failed.',
  },
  aiSuggestions: [{ title: 'Add more detail', reason: 'Plan quality improves with description', action: 'Edit task description' }],
};

const buildFullPrompt = (ctx) => `
You are N.O.V.A., an expert AI productivity assistant.
Analyze the task below. Return ONLY valid JSON — no markdown, no code fences, no prose.

=== TASK CONTEXT ===
Title: "${ctx.title}"
Description: ${ctx.description || 'not provided'}
Category: ${ctx.category || 'not provided'}
Task Type: ${ctx.taskType || 'not provided'}
Difficulty: ${ctx.difficulty || 'not provided'}
Importance (1–5): ${ctx.importance}
Deadline: ${ctx.deadline}
Daily Availability: ${ctx.dailyAvailability || 'not provided'}
Preferred Working Time: ${ctx.preferredWorkingTime || 'not provided'}
Experience Level: ${ctx.experienceLevel || 'Comfortable'}
${ctx.historyContext ? `\n=== PAST SIMILAR TASKS (for calibration) ===\n${ctx.historyContext}` : ''}
${ctx.corrections && ctx.corrections.length > 0 ? `\n=== USER CORRECTIONS (apply these when generating the new plan) ===\nThe user has identified incorrect assumptions in the previous plan. Treat each correction as authoritative context and revise your taskUnderstanding, estimates, and subtasks accordingly:\n${ctx.corrections.map((c, i) => `${i + 1}. ${c}`).join('\n')}` : ''}

=== STEP 1 — UNDERSTAND ===
Before generating subtasks, derive taskUnderstanding:
- goal: what the user primarily wants to achieve (one sentence)
- detectedRequirements: specific deliverables or sub-goals inferred
- assumptions: what you assumed about the user/task
- constraints: deadline, difficulty, availability constraints
- planningStrategy: one sentence on how subtasks should be ordered

If the task is obvious (e.g. "Drink water", "Submit form", "Call mentor"), skip clarification and plan directly.
Only return clarificationRequired if the title is genuinely ambiguous (e.g. "do project", "work stuff").

=== STEP 2 — ESTIMATE HOURS ===
Use experience level for calibration. Experience level labels and their meaning:
- "Never done before" = Beginner
- "Some experience" = Intermediate-low
- "Comfortable" = Intermediate (default)
- "Expert" = Advanced

Daily availability → hours per day mapping:
- "< 1 hour" = 0.75h/day
- "1-2 hours" = 1.5h/day
- "2-4 hours" = 3h/day
- "4-6 hours" = 5h/day
- "6+ hours" = 7h/day

AVAILABILITY-AWARE SCOPING RULES (follow these strictly when Daily Availability is provided):
1. Compute totalAvailableHours = daysUntilDeadline × hoursPerDay.
2. Scope the plan to fit within totalAvailableHours. Ask: "What is the most valuable subset of this task a user can realistically complete in totalAvailableHours?"
3. Do NOT plan for the full theoretical scope if it exceeds what the user can do. Focus the subtasks on the highest-value work that fits.
4. If the topic is genuinely large (e.g. full DSA, full course), scope down to a focused subset: e.g. "DSA revision of Arrays + Strings" instead of all topics.
5. estimatedHours MUST equal the sum of subtask hours, and MUST be ≤ totalAvailableHours.
6. ONLY exceed totalAvailableHours if there is no meaningful way to scope down the task (e.g. a fixed-duration exam). In that case, note in reasoning that the task exceeds availability.

EXAMPLE: Task = "DSA revision", Daily Availability = "1-2 hours" (1.5h/day), Deadline = 3 days away.
- totalAvailableHours = 1.5 × 3 = 4.5h
- DO NOT say "DSA revision takes 30h". Instead, scope to: review 2–3 key topics (arrays, strings, hashmaps), practice 3–4 problems each.
- estimatedHours = 4.5h, subtasks fit within that total.

Calibration examples (use as baselines, then scale DOWN to availability window if needed):
- Filing/submitting a form: 0.25h
- Single meeting or call: 1h
- LeetCode revision (full): 20–40h (Comfortable), 30–50h (Never done before), 15–25h (Expert)
- Research paper (full): 15–25h
- DBMS assignment (full): 22–30h (Comfortable), 35–45h (Never done before), 15–20h (Expert)
- Portfolio website (full): 60–90h (Comfortable), 90–120h (Never done before), 30–50h (Expert)
- College assignment (medium): 8–20h
DO NOT overestimate. Scope plans to the available window, not the theoretical maximum.

=== STEP 3 — CONFIDENCE ===
- Very detailed description + deliverables: 95–99%
- Clear software/assignment with description: 90–95%
- Simple obvious task: 85–95%
- Title only, no description: 45–70%
- Conflicting or ambiguous input: 40–60%
- Impossible or nonsensical request: 30–50%

=== STEP 4 — RISKS ===
Task-specific plain strings only. No structured objects.
- Coding: deployment issues, integration problems, testing effort
- Exam: time management, topic coverage, revision depth
- Assignment: requirement ambiguity, documentation effort, domain complexity
- Research: lack of references, scope creep, writing time
Avoid generic filler risks. Return [] if no meaningful risks apply.

=== STEP 5 — DELIVERABLES ===
Detect output artefacts as plain strings:
- DBMS: "ER Diagram", "Relational Schema", "SQL Queries", "Documentation"
- Portfolio: "Frontend", "Backend API", "Deployment", "Documentation"
- Research: "Literature Review", "Comparison Table", "Final Report"
- Hackathon: "MVP", "Deployment", "Presentation", "Documentation"
Return [] if none apply (e.g. meeting, call, drink water).

=== STEP 6 — SUBTASKS ===
Derive subtasks from detectedRequirements. Include dependsOn array where ordering matters
(e.g. "Deployment" dependsOn ["Backend API", "Frontend"]).
Each subtask: { "name": "...", "hours": <number>, "dependsOn": [] }

=== STEP 7 — REASONING ===
2–5 plain-English sentences explaining: how you interpreted the task, why subtasks are ordered this way,
why you chose this estimate, why the risks are relevant. No chain-of-thought or technical details.

=== STEP 8 — EXPLAINABILITY ===
Four one-sentence justifications:
- priorityExplanation: why this priority score
- hoursExplanation: why this hour estimate
- confidenceExplanation: what drove the confidence score
- reviewExplanation: why the review status is what it is

=== STEP 9 — SUGGESTIONS ===
2–4 actionable suggestions. Each suggestion is an object with:
- title: short suggestion title (e.g. "Split into phases")
- reason: why this is recommended (one sentence)
- action: concrete action the user can take (e.g. "Break task into Phase 1: Research, Phase 2: Implementation")

=== CLARIFICATION (only if genuinely ambiguous — not for obvious tasks) ===
{
  "clarificationRequired": true,
  "questions": ["<option 1>", "<option 2>", ...]
}

=== OUTPUT FORMAT (for non-ambiguous tasks) ===
{
  "taskUnderstanding": {
    "goal": "...",
    "detectedRequirements": ["..."],
    "assumptions": ["..."],
    "constraints": ["..."],
    "planningStrategy": "..."
  },
  "understanding": "...",
  "estimatedHours": <positive number>,
  "suggestedPriorityScore": <integer 0–100>,
  "confidence": <integer 0–100>,
  "reviewRequired": false,
  "reviewReason": "",
  "risks": ["<plain string risk>", ...],
  "deliverables": ["..."],
  "subtasks": [{ "name": "...", "hours": <number>, "dependsOn": [] }],
  "reasoning": "...",
  "explainability": {
    "priorityExplanation": "...",
    "hoursExplanation": "...",
    "confidenceExplanation": "...",
    "reviewExplanation": "..."
  },
  "aiSuggestions": [
    { "title": "...", "reason": "...", "action": "..." }
  ]
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
