const Joi = require('joi');

// ── Constant arrays ───────────────────────────────────────────────────────────
const CATEGORIES = [
  'Work',
  'Personal',
  'Health',
  'Finance',
  'Learning',
  'Social',
  'Home',
  'Other',
];

const TASK_TYPES = [
  'Deep Work',
  'Meeting',
  'Admin',
  'Creative',
  'Exercise',
  'Errand',
  'Other',
];

const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Very Hard'];

const DAILY_AVAIL = ['< 1 hour', '1-2 hours', '2-4 hours', '4-6 hours', '6+ hours'];

const WORK_TIMES = ['Early Morning', 'Morning', 'Afternoon', 'Evening', 'Late Night'];

// ── Attachment schema ─────────────────────────────────────────────────────────
const attachmentSchema = Joi.object({
  name: Joi.string().required(),
  size: Joi.number().integer().positive().required(),
  mimeType: Joi.string().required(),
  uploadedAt: Joi.string().isoDate().required(),
});

// ── Custom future-date validator (deadline strictly after today midnight) ─────
const futureDateValidator = (value, helpers) => {
  const deadlineDate = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (deadlineDate <= today) {
    return helpers.error('any.invalid');
  }
  return value;
};

// ── Existing task schema (unchanged) ─────────────────────────────────────────
const taskSchema = Joi.object({
  title: Joi.string().min(3).max(200).required(),
  deadline: Joi.string()
    .isoDate()
    .required()
    .custom((value, helpers) => {
      const deadlineDate = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (deadlineDate <= today) {
        return helpers.error('any.invalid');
      }
      return value;
    })
    .messages({
      'any.invalid': 'deadline must be a future date',
    }),
  importance: Joi.number().integer().min(1).max(5).required(),
});

// ── Preview schema ────────────────────────────────────────────────────────────
const previewSchema = Joi.object({
  title: Joi.string()
    .min(3)
    .max(200)
    .pattern(/\S/)
    .required(),
  description: Joi.string().max(2000).allow('', null).optional(),
  category: Joi.string()
    .valid(...CATEGORIES)
    .allow('')
    .optional(),
  taskType: Joi.string()
    .valid(...TASK_TYPES)
    .allow('')
    .optional(),
  difficulty: Joi.string()
    .valid(...DIFFICULTIES)
    .allow('')
    .optional(),
  deadline: Joi.string()
    .isoDate()
    .required()
    .custom(futureDateValidator)
    .messages({
      'any.invalid': 'deadline must be a future date',
    }),
  importance: Joi.number().integer().min(1).max(5).required(),
  dailyAvailability: Joi.string()
    .valid(...DAILY_AVAIL)
    .allow('')
    .optional(),
  preferredWorkingTime: Joi.string()
    .valid(...WORK_TIMES)
    .allow('')
    .optional(),
  experienceLevel: Joi.string()
    .valid('Never done before', 'Some experience', 'Comfortable', 'Expert')
    .allow('')
    .optional(),
  timePreference: Joi.string()
    .valid('Morning', 'Afternoon', 'Evening', 'Night')
    .allow('')
    .optional(),
  energyLevel: Joi.string()
    .valid('High Focus', 'Normal', 'Low Energy')
    .allow('')
    .optional(),
  isRecurring: Joi.boolean().optional(),
  recurringInterval: Joi.string()
    .valid('Daily', 'Weekly', 'Monthly')
    .allow('')
    .optional(),
  attachments: Joi.array().items(attachmentSchema).max(5).optional(),
  // Flag indicating this is a resubmission after a clarification round.
  // When true, the service will return HTTP 422 if Gemini still asks for clarification
  // (enforcing the 1-round clarification loop limit — Requirement 4.8).
  _isClarificationResubmit: Joi.boolean().optional(),
  // Corrections from the assumption correction flow (Task 17 replan) — kept separate from description
  _corrections: Joi.array().items(Joi.string()).optional(),
});

// ── AI plan body schema ───────────────────────────────────────────────────────
const aiPlanBodySchema = Joi.object({
  taskUnderstanding: Joi.object({
    goal: Joi.string().min(1).required(),
    detectedRequirements: Joi.array().items(Joi.string()).required(),
    assumptions: Joi.array().items(Joi.string()).required(),
    constraints: Joi.array().items(Joi.string()).required(),
    planningStrategy: Joi.string().min(1).required(),
  }).required(),
  understanding: Joi.string().min(1).required(),
  estimatedHours: Joi.number().positive().required(),
  suggestedPriorityScore: Joi.number().integer().min(0).max(100).required(),
  confidence: Joi.number().integer().min(0).max(100).required(),
  reviewRequired: Joi.boolean().required(),
  reviewReason: Joi.string().allow('').required(),
  // risks kept as plain string[] per tasks.md (not structured objects)
  risks: Joi.array().items(Joi.string()).required(),
  deliverables: Joi.array().items(Joi.string()).required(),
  subtasks: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().min(1).required(),
        hours: Joi.number().positive().required(),
        dependsOn: Joi.array().items(Joi.string()).optional(),
      })
    )
    .min(1)
    .required(),
  reasoning: Joi.string().min(1).required(),
  explainability: Joi.object({
    priorityExplanation: Joi.string().min(1).required(),
    hoursExplanation: Joi.string().min(1).required(),
    confidenceExplanation: Joi.string().min(1).required(),
    reviewExplanation: Joi.string().min(1).required(),
  }).required(),
  aiSuggestions: Joi.array()
    .items(
      Joi.object({
        title: Joi.string(),
        reason: Joi.string(),
        action: Joi.string(),
      })
    )
    .required(),
  // Backend-injected decision fields returned by previewTask and echoed back on approve
  compositeConfidence: Joi.number().integer().min(0).max(100).optional(),
  reviewLevel: Joi.string().valid('NONE', 'WARNING', 'REQUIRED').optional(),
}).unknown(true); // allow any extra backend-injected fields through

// ── Approve schema ────────────────────────────────────────────────────────────
// Same fields as previewSchema but deadline has NO future-date check,
// plus aiPlan is required. sourceTaskId replaces upgradeTaskId.
const approveSchema = Joi.object({
  title: Joi.string()
    .min(3)
    .max(200)
    .pattern(/\S/)
    .required(),
  description: Joi.string().max(2000).allow('', null).optional(),
  category: Joi.string()
    .valid(...CATEGORIES)
    .allow('')
    .optional(),
  taskType: Joi.string()
    .valid(...TASK_TYPES)
    .allow('')
    .optional(),
  difficulty: Joi.string()
    .valid(...DIFFICULTIES)
    .allow('')
    .optional(),
  deadline: Joi.string().isoDate().required(),
  importance: Joi.number().integer().min(1).max(5).required(),
  dailyAvailability: Joi.string()
    .valid(...DAILY_AVAIL)
    .allow('')
    .optional(),
  preferredWorkingTime: Joi.string()
    .valid(...WORK_TIMES)
    .allow('')
    .optional(),
  experienceLevel: Joi.string()
    .valid('Never done before', 'Some experience', 'Comfortable', 'Expert')
    .allow('')
    .optional(),
  timePreference: Joi.string()
    .valid('Morning', 'Afternoon', 'Evening', 'Night')
    .allow('')
    .optional(),
  energyLevel: Joi.string()
    .valid('High Focus', 'Normal', 'Low Energy')
    .allow('')
    .optional(),
  isRecurring: Joi.boolean().optional(),
  recurringInterval: Joi.string()
    .valid('Daily', 'Weekly', 'Monthly')
    .allow('')
    .optional(),
  attachments: Joi.array().items(attachmentSchema).max(5).optional(),
  aiPlan: aiPlanBodySchema.required(),
  sourceTaskId: Joi.string().optional(), // Quick Task upgrade path — updates existing doc
});

// ── Quick Task schema ─────────────────────────────────────────────────────────
const quickTaskSchema = Joi.object({
  title: Joi.string().min(3).max(200).pattern(/\S/).required(),
  deadline: Joi.string().isoDate().allow(null, '').optional(),
  importance: Joi.number().integer().min(1).max(5).optional().default(3),
  description: Joi.string().max(2000).allow('', null).optional(),
  category: Joi.string()
    .valid(...CATEGORIES)
    .allow('')
    .optional(),
  preferredWorkingTime: Joi.string()
    .valid(...WORK_TIMES)
    .allow('')
    .optional(),
  dailyAvailability: Joi.string()
    .valid(...DAILY_AVAIL)
    .allow('')
    .optional(),
  timePreference: Joi.string()
    .valid('Morning', 'Afternoon', 'Evening', 'Night')
    .allow('')
    .optional(),
  energyLevel: Joi.string()
    .valid('High Focus', 'Normal', 'Low Energy')
    .allow('')
    .optional(),
  isRecurring: Joi.boolean().optional(),
  // recurringInterval is only meaningful when isRecurring is true;
  // validation of the conditional dependency is enforced in the service layer
  recurringInterval: Joi.string()
    .valid('Daily', 'Weekly', 'Monthly')
    .allow('')
    .optional(),
  // frequencyPerDay: how many times this task occurs per day (e.g. "Drink water" = 8)
  // When set, the scheduler distributes this many evenly-spaced reminder slots across the day.
  frequencyPerDay: Joi.number().integer().min(1).max(48).optional(),
});

module.exports = {
  taskSchema,
  previewSchema,
  approveSchema,
  quickTaskSchema,
  // Exported for use in tests / other modules if needed
  CATEGORIES,
  TASK_TYPES,
  DIFFICULTIES,
  DAILY_AVAIL,
  WORK_TIMES,
  attachmentSchema,
  aiPlanBodySchema,
};
