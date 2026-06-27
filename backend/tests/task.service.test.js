/**
 * Property-Based Tests for task.service.js
 *
 * Property 1: reviewRequired Rules are Monotone-Additive
 *   - If any rule condition is triggered, reviewRequired must be true
 *   - Rules fire independently and additively
 *   - Gemini's own reviewRequired flag is always passed through
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

// Mock Firebase and Gemini configs so the module can be required without real credentials
jest.mock('../src/config/firebase', () => ({}));
jest.mock('../src/config/gemini', () => ({ generateContent: jest.fn() }));

const fc = require('fast-check');
const { applyReviewRequiredRules } = require('../src/services/task.service');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Clearly past date — never flaky */
const PAST_DATE = '2020-01-01';

/** Clearly future date — well beyond today */
const FUTURE_DATE = '2099-12-31';

/**
 * Build a "clean" aiPlan that triggers no rules on its own.
 * Tests override specific fields to exercise individual rules.
 */
const cleanAiPlan = (overrides = {}) => ({
  estimatedHours: 10,      // valid range: 0.5–100
  confidence: 80,          // >= 70
  reviewRequired: false,
  reviewReason: '',
  ...overrides,
});

/**
 * Build a "clean" formData that triggers no rules on its own.
 */
const cleanFormData = (overrides = {}) => ({
  description: 'A clear description',
  difficulty: 'Medium',
  deadline: FUTURE_DATE,
  ...overrides,
});

// ─── Property 1a: Backend rules are sole authority — Gemini flag is NOT passed through ───────────

describe('Property 1a: Backend rules are sole authority for reviewRequired', () => {
  test('geminiReviewRequired=true does NOT yield reviewRequired=true when no backend rule fires', () => {
    /**
     * The implementation intentionally ignores Gemini's reviewRequired flag.
     * Backend rules (hours range, confidence, blank desc + hard diff, past deadline) are
     * the sole authority. When none of those fire, reviewRequired must be false regardless
     * of what Gemini sent.
     *
     * Generator: all inputs safely in range so no backend rule fires.
     */
    const safeInputs = fc.record({
      estimatedHours: fc.float({ min: Math.fround(0.5), max: Math.fround(100), noNaN: true }),
      confidence: fc.integer({ min: 70, max: 100 }),
      description: fc.string({ minLength: 1 }),
      difficulty: fc.constantFrom('Easy', 'Medium'),
      geminiReason: fc.string(),
    });

    fc.assert(
      fc.property(safeInputs, ({ estimatedHours, confidence, description, difficulty, geminiReason }) => {
        // geminiReviewRequired=true — but backend should still return false because no rule fires
        const aiPlan = cleanAiPlan({ estimatedHours, confidence, reviewRequired: true, reviewReason: geminiReason });
        const formData = cleanFormData({ description, difficulty, deadline: FUTURE_DATE });
        const { reviewRequired } = applyReviewRequiredRules(aiPlan, formData);
        // Backend ignores Gemini's flag — should be false when no backend rule fires
        return reviewRequired === false;
      }),
      { numRuns: 200 }
    );
  });
});

// ─── Property 1b: Rule 1 — estimatedHours out of sane range ──────────────────

describe('Property 1b: Rule 1 — estimatedHours out of range triggers reviewRequired', () => {
  test('estimatedHours > 100 triggers reviewRequired=true', () => {
    const tooHighHours = fc.float({ min: Math.fround(100.01), max: Math.fround(10000), noNaN: true });

    fc.assert(
      fc.property(tooHighHours, (estimatedHours) => {
        const aiPlan = cleanAiPlan({ estimatedHours });
        const formData = cleanFormData();
        const { reviewRequired } = applyReviewRequiredRules(aiPlan, formData);
        return reviewRequired === true;
      }),
      { numRuns: 200 }
    );
  });

  test('estimatedHours < 0.5 triggers reviewRequired=true', () => {
    const tooLowHours = fc.oneof(
      fc.float({ min: Math.fround(-1000), max: Math.fround(0.49), noNaN: true }),
      fc.constant(0),
      fc.constant(0.1),
      fc.constant(0.49)
    );

    fc.assert(
      fc.property(tooLowHours, (estimatedHours) => {
        const aiPlan = cleanAiPlan({ estimatedHours });
        const formData = cleanFormData();
        const { reviewRequired } = applyReviewRequiredRules(aiPlan, formData);
        return reviewRequired === true;
      }),
      { numRuns: 200 }
    );
  });
});

// ─── Property 1c: Rule 2 — Low confidence ─────────────────────────────────────

describe('Property 1c: Rule 2 — confidence < 70 triggers reviewRequired', () => {
  test('confidence < 70 triggers reviewRequired=true', () => {
    const lowConfidence = fc.integer({ min: 0, max: 69 });

    fc.assert(
      fc.property(lowConfidence, (confidence) => {
        const aiPlan = cleanAiPlan({ confidence });
        const formData = cleanFormData();
        const { reviewRequired } = applyReviewRequiredRules(aiPlan, formData);
        return reviewRequired === true;
      }),
      { numRuns: 200 }
    );
  });
});

// ─── Property 1d: Rule 3 — Blank description + hard difficulty ────────────────

describe('Property 1d: Rule 3 — blank description + hard difficulty triggers reviewRequired', () => {
  test('blank description with Hard or Very Hard difficulty triggers reviewRequired=true', () => {
    const blankDescription = fc.oneof(
      fc.constant(''),
      fc.constant('   '),
      fc.constant('\t'),
      fc.constant('\n'),
    );
    const hardDifficulty = fc.constantFrom('Hard', 'Very Hard');

    fc.assert(
      fc.property(
        fc.tuple(blankDescription, hardDifficulty),
        ([description, difficulty]) => {
          const aiPlan = cleanAiPlan();
          const formData = cleanFormData({ description, difficulty });
          const { reviewRequired } = applyReviewRequiredRules(aiPlan, formData);
          return reviewRequired === true;
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ─── Property 1e: Rule 4 — Deadline in the past ───────────────────────────────

describe('Property 1e: Rule 4 — past/today deadline triggers reviewRequired', () => {
  test('deadline in the past triggers reviewRequired=true', () => {
    /**
     * Generate dates clearly in the past: year 2000–2023, any month/day.
     * Using ISO string format 'YYYY-MM-DD'.
     */
    const pastDate = fc.tuple(
      fc.integer({ min: 2000, max: 2023 }),
      fc.integer({ min: 1, max: 12 }),
      fc.integer({ min: 1, max: 28 })  // cap at 28 to avoid invalid dates
    ).map(([year, month, day]) => {
      const mm = String(month).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    });

    fc.assert(
      fc.property(pastDate, (deadline) => {
        const aiPlan = cleanAiPlan();
        const formData = cleanFormData({ deadline });
        const { reviewRequired } = applyReviewRequiredRules(aiPlan, formData);
        return reviewRequired === true;
      }),
      { numRuns: 200 }
    );
  });

  test('a fixed known past date triggers reviewRequired=true', () => {
    const aiPlan = cleanAiPlan();
    const formData = cleanFormData({ deadline: PAST_DATE });
    const { reviewRequired } = applyReviewRequiredRules(aiPlan, formData);
    expect(reviewRequired).toBe(true);
  });
});

// ─── Property 1f: Combined — never false when any condition is met ─────────────

describe('Property 1f: Combined — reviewRequired never false when any rule condition is met', () => {
  test('any triggered rule condition always yields reviewRequired=true', () => {
    /**
     * Generator: pick one triggering condition at random, combine with otherwise clean inputs.
     * This ensures that any single condition is sufficient to set reviewRequired=true.
     */
    const triggeringScenario = fc.oneof(
      // Rule 1a: hours too high
      fc.record({
        estimatedHours: fc.float({ min: Math.fround(100.01), max: Math.fround(10000), noNaN: true }),
        confidence: fc.integer({ min: 70, max: 100 }),
        geminiReviewRequired: fc.constant(false),
        description: fc.string({ minLength: 1 }),
        difficulty: fc.constantFrom('Easy', 'Medium'),
        deadline: fc.constant(FUTURE_DATE),
      }),
      // Rule 1b: hours too low
      fc.record({
        estimatedHours: fc.constant(0.1),
        confidence: fc.integer({ min: 70, max: 100 }),
        geminiReviewRequired: fc.constant(false),
        description: fc.string({ minLength: 1 }),
        difficulty: fc.constantFrom('Easy', 'Medium'),
        deadline: fc.constant(FUTURE_DATE),
      }),
      // Rule 2: low confidence
      fc.record({
        estimatedHours: fc.float({ min: Math.fround(0.5), max: Math.fround(100), noNaN: true }),
        confidence: fc.integer({ min: 0, max: 69 }),
        geminiReviewRequired: fc.constant(false),
        description: fc.string({ minLength: 1 }),
        difficulty: fc.constantFrom('Easy', 'Medium'),
        deadline: fc.constant(FUTURE_DATE),
      }),
      // Rule 3: blank description + hard difficulty
      fc.record({
        estimatedHours: fc.float({ min: Math.fround(0.5), max: Math.fround(100), noNaN: true }),
        confidence: fc.integer({ min: 70, max: 100 }),
        geminiReviewRequired: fc.constant(false),
        description: fc.constant(''),
        difficulty: fc.constantFrom('Hard', 'Very Hard'),
        deadline: fc.constant(FUTURE_DATE),
      }),
      // Rule 4: past deadline
      fc.record({
        estimatedHours: fc.float({ min: Math.fround(0.5), max: Math.fround(100), noNaN: true }),
        confidence: fc.integer({ min: 70, max: 100 }),
        geminiReviewRequired: fc.constant(false),
        description: fc.string({ minLength: 1 }),
        difficulty: fc.constantFrom('Easy', 'Medium'),
        deadline: fc.constant(PAST_DATE),
      }),
    );

    fc.assert(
      fc.property(
        triggeringScenario,
        ({ estimatedHours, confidence, geminiReviewRequired, description, difficulty, deadline }) => {
          const aiPlan = cleanAiPlan({ estimatedHours, confidence, reviewRequired: geminiReviewRequired });
          const formData = cleanFormData({ description, difficulty, deadline });
          const { reviewRequired } = applyReviewRequiredRules(aiPlan, formData);
          return reviewRequired === true;
        }
      ),
      { numRuns: 200 }
    );
  });

  test('no rule triggered means reviewRequired follows only geminiReviewRequired=false', () => {
    /**
     * All conditions safely in range — reviewRequired must be false.
     */
    const safeInputs = fc.record({
      estimatedHours: fc.float({ min: Math.fround(0.5), max: Math.fround(100), noNaN: true }),
      confidence: fc.integer({ min: 70, max: 100 }),
      description: fc.string({ minLength: 1 }),
      difficulty: fc.constantFrom('Easy', 'Medium'),
    });

    fc.assert(
      fc.property(safeInputs, ({ estimatedHours, confidence, description, difficulty }) => {
        const aiPlan = cleanAiPlan({ estimatedHours, confidence, reviewRequired: false });
        const formData = cleanFormData({ description, difficulty, deadline: FUTURE_DATE });
        const { reviewRequired } = applyReviewRequiredRules(aiPlan, formData);
        return reviewRequired === false;
      }),
      { numRuns: 200 }
    );
  });
});


// ─── Property 2: Priority Score Bounds and Determinism ────────────────────────

/**
 * Property 2: Priority Score Bounds and Determinism
 *
 * For any valid input { deadline (future date), importance (1–5), estimatedHours (0.5–100) }:
 *   - calculatePriority is deterministic: calling twice with the same inputs yields the same result
 *   - The result is an integer
 *   - The result is in the range [0, 100]
 *
 * **Validates: Requirements 11.2, 12.1**
 */

// Use jest.requireActual to get the real implementation (jest.mock is hoisted and replaces the module)
const { calculatePriority } = jest.requireActual('../src/services/priority.service');

describe('Property 2: Priority Score Bounds and Determinism', () => {
  test('calculatePriority is deterministic, returns an integer, and stays within [0, 100]', () => {
    /**
     * Generator: future dates (0–365 days from today), importance 1–5, estimatedHours 0.5–100
     */
    const futureDateStr = fc.nat({ max: 365 }).map((daysAhead) => {
      const d = new Date();
      d.setDate(d.getDate() + daysAhead);
      return d.toISOString().slice(0, 10); // YYYY-MM-DD
    });

    const validInputs = fc.record({
      deadline: futureDateStr,
      importance: fc.integer({ min: 1, max: 5 }),
      estimatedHours: fc.float({ min: Math.fround(0.5), max: Math.fround(100), noNaN: true }),
    });

    fc.assert(
      fc.property(validInputs, (inputs) => {
        const result1 = calculatePriority(inputs);
        const result2 = calculatePriority(inputs);

        // Deterministic: same inputs always yield same result
        if (result1 !== result2) return false;

        // Must be an integer
        if (!Number.isInteger(result1)) return false;

        // Must be in range [0, 100]
        if (result1 < 0 || result1 > 100) return false;

        return true;
      }),
      { numRuns: 200 }
    );
  });
});


// ─── Properties 6 & 7: approveTask persistence rules ─────────────────────────

/**
 * Property 6: Approve Never Stores suggestedPriorityScore
 *   - The Firestore document passed to saveTask must NOT contain a
 *     `suggestedPriorityScore` key, even when the aiPlan contains one.
 *
 * Property 7: Approve Recomputes All Decision Metadata Server-Side
 *   - approveTask calls decisionService.computeDecision (server-side recompute)
 *   - The saved doc contains all v2 fields: compositeConfidence, reviewLevel,
 *     reviewReason, reviewRequired, planningSnapshot, scheduledBy, taskMode
 *   - When body.sourceTaskId is present, updateTask is called instead of saveTask
 *
 * Validates: Requirements 1, 2, 4, 7, 8.5, 11.2, 12, 18
 */

// Require approveTask directly from the service (already exported for testing)
const { approveTask } = require('../src/services/task.service');
const firestoreService = require('../src/services/firestore.service');
const priorityService = require('../src/services/priority.service');
const geminiService = require('../src/services/gemini.service');
const decisionService = require('../src/services/decision.service');

// Mock dependencies so approveTask runs without real Firebase / Gemini / confidence/review logic
jest.mock('../src/services/firestore.service');
jest.mock('../src/services/priority.service');
jest.mock('../src/services/gemini.service');
jest.mock('../src/services/decision.service');

/**
 * A minimal but fully valid aiPlan object.
 * Override individual fields per test.
 */
const baseAiPlan = (overrides = {}) => ({
  understanding: 'Implement the feature as described.',
  estimatedHours: 8,
  suggestedPriorityScore: 75,   // advisory only — must NOT be persisted
  confidence: 85,
  reviewRequired: false,        // client value — ignored by backend
  reviewReason: '',
  risks: [{ risk: 'Scope creep', probability: 'Medium', impact: 'High', mitigation: 'Define clear scope' }],
  deliverables: ['Frontend', 'Backend API'],
  reasoning: 'Task is well-defined with clear deliverables.',
  aiSuggestions: ['Break work into phases'],
  taskUnderstanding: {
    goal: 'Build a landing page',
    detectedRequirements: ['Responsive design', 'SEO'],
    assumptions: ['Modern browser support'],
    constraints: ['2 week deadline'],
    planningStrategy: 'Sequential phases',
  },
  subtasks: [{ name: 'Planning', hours: 2 }, { name: 'Execution', hours: 6 }],
  ...overrides,
});

/**
 * A minimal valid request body for approveTask.
 * Uses a future deadline so deadline rules do not fire.
 */
const baseBody = (aiPlanOverrides = {}, bodyOverrides = {}) => ({
  title: 'Build the landing page',
  description: 'A detailed description of the task.',
  category: 'Work',
  taskType: 'Deep Work',
  difficulty: 'Medium',
  deadline: '2099-12-31',
  importance: 3,
  dailyAvailability: '4-6 hours',
  preferredWorkingTime: 'Evening',
  attachments: [],
  aiPlan: baseAiPlan(aiPlanOverrides),
  ...bodyOverrides,
});

/** Default mock return for decisionService.computeDecision */
const mockDecision = {
  compositeConfidence: 88,
  reviewLevel: 'NONE',
  reviewReason: '',
  reviewRequired: false,
  urgencyScore: 10,
  workloadScore: 1.2,
};

describe('Property 6: approveTask never stores suggestedPriorityScore', () => {
  let capturedDoc;

  beforeEach(() => {
    capturedDoc = null;
    firestoreService.saveTask.mockImplementation(async (doc) => {
      capturedDoc = doc;
      return { ...doc, taskId: 'mock-task-id', status: 'PENDING', createdAt: new Date() };
    });
    firestoreService.updateTask.mockImplementation(async (taskId, doc) => {
      capturedDoc = doc;
      return { ...doc, taskId, updatedAt: new Date() };
    });
    priorityService.calculatePriority.mockReturnValue(60);
    decisionService.computeDecision.mockReturnValue(mockDecision);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('document passed to saveTask has no suggestedPriorityScore key', async () => {
    await approveTask(baseBody(), 'req-001');

    expect(capturedDoc).not.toBeNull();
    expect(capturedDoc).not.toHaveProperty('suggestedPriorityScore');
  });

  test('suggestedPriorityScore is absent regardless of the value supplied in aiPlan', async () => {
    for (const score of [0, 25, 50, 75, 100]) {
      capturedDoc = null;
      await approveTask(baseBody({ suggestedPriorityScore: score }), `req-score-${score}`);
      expect(capturedDoc).not.toBeNull();
      expect(capturedDoc).not.toHaveProperty('suggestedPriorityScore');
    }
  });

  test('document contains priorityScore (deterministic backend value) instead', async () => {
    priorityService.calculatePriority.mockReturnValue(42);
    await approveTask(baseBody(), 'req-002');

    expect(capturedDoc).toHaveProperty('priorityScore', 42);
  });
});

describe('Property 7: approveTask recomputes all decision metadata server-side', () => {
  let capturedDoc;

  beforeEach(() => {
    capturedDoc = null;
    firestoreService.saveTask.mockImplementation(async (doc) => {
      capturedDoc = doc;
      return { ...doc, taskId: 'mock-task-id', status: 'PENDING', createdAt: new Date() };
    });
    firestoreService.updateTask.mockImplementation(async (taskId, doc) => {
      capturedDoc = doc;
      return { ...doc, taskId, updatedAt: new Date() };
    });
    priorityService.calculatePriority.mockReturnValue(50);
    decisionService.computeDecision.mockReturnValue(mockDecision);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('decisionService.computeDecision is called with aiPlan and body', async () => {
    const body = baseBody();
    await approveTask(body, 'req-003');

    expect(decisionService.computeDecision).toHaveBeenCalledWith(body.aiPlan, body);
  });

  test('saved doc contains reviewRequired from decisionService (server-computed)', async () => {
    decisionService.computeDecision.mockReturnValue({ ...mockDecision, reviewRequired: true, reviewLevel: 'REQUIRED', reviewReason: 'Low confidence' });
    const body = baseBody({ reviewRequired: false }); // client sends false — ignored

    await approveTask(body, 'req-004');

    expect(capturedDoc.reviewRequired).toBe(true);
    expect(capturedDoc.reviewLevel).toBe('REQUIRED');
    expect(capturedDoc.reviewReason).toBe('Low confidence');
  });

  test('saved doc has compositeConfidence from decisionService', async () => {
    decisionService.computeDecision.mockReturnValue({ ...mockDecision, compositeConfidence: 72 });
    await approveTask(baseBody(), 'req-005');

    expect(capturedDoc.compositeConfidence).toBe(72);
  });

  test('saved doc has all v2 fields: taskUnderstanding, reasoning, deliverables, aiSuggestions', async () => {
    await approveTask(baseBody(), 'req-006');

    expect(capturedDoc).toHaveProperty('taskUnderstanding');
    expect(capturedDoc).toHaveProperty('reasoning');
    expect(capturedDoc).toHaveProperty('deliverables');
    expect(capturedDoc).toHaveProperty('aiSuggestions');
    expect(capturedDoc).toHaveProperty('reviewLevel');
  });

  test('saved doc has taskMode=ai, scheduledBy=AI, actualHours=null', async () => {
    await approveTask(baseBody(), 'req-007');

    expect(capturedDoc.taskMode).toBe('ai');
    expect(capturedDoc.scheduledBy).toBe('AI');
    expect(capturedDoc.actualHours).toBeNull();
  });

  test('saved doc contains planningSnapshot with correct fields', async () => {
    const aiPlanOverrides = { confidence: 85, reasoning: 'Well scoped task.', deliverables: ['API', 'Docs'] };
    decisionService.computeDecision.mockReturnValue({ ...mockDecision, compositeConfidence: 90, reviewLevel: 'NONE' });

    await approveTask(baseBody(aiPlanOverrides), 'req-008');

    expect(capturedDoc).toHaveProperty('planningSnapshot');
    const snap = capturedDoc.planningSnapshot;
    expect(snap.confidence).toBe(85);
    expect(snap.compositeConfidence).toBe(90);
    expect(snap.reviewLevel).toBe('NONE');
    expect(snap.reasoning).toBe('Well scoped task.');
    expect(snap.deliverables).toEqual(['API', 'Docs']);
    expect(snap).toHaveProperty('risks');
  });

  test('when sourceTaskId present, updateTask is called instead of saveTask', async () => {
    const body = baseBody({}, { sourceTaskId: 'quick-task-abc123' });
    await approveTask(body, 'req-009');

    expect(firestoreService.updateTask).toHaveBeenCalledWith('quick-task-abc123', expect.any(Object), 'req-009');
    expect(firestoreService.saveTask).not.toHaveBeenCalled();
  });

  test('when sourceTaskId absent, saveTask is called (normal AI task flow)', async () => {
    const body = baseBody();
    await approveTask(body, 'req-010');

    expect(firestoreService.saveTask).toHaveBeenCalled();
    expect(firestoreService.updateTask).not.toHaveBeenCalled();
  });
});


// ─── Properties 8 & 9: createQuickTask ───────────────────────────────────────

/**
 * Property 8: createQuickTask keyword-hour inference
 *   - Title containing a keyword maps to the correct estimatedHours
 *   - Titles with no keyword default to 0.5h
 *   - The keyword with the first match wins
 *
 * Property 9: createQuickTask document shape
 *   - Saved doc has taskMode='quick', scheduledBy='User', subtasks=[], status='PENDING'
 *   - No null AI fields (no understanding, compositeConfidence, confidence, risks, etc.)
 *   - priorityScore=0 when deadline is absent; priorityScore>0 when deadline is present
 *   - Auto-detects category from title when body.category is not provided
 *
 * Validates: Requirements 11, 13, 18
 */

const { createQuickTask } = require('../src/services/task.service');

// firestoreService and priorityService are already mocked above; reuse those mocks.

describe('Property 8: createQuickTask keyword-hour inference', () => {
  let capturedDoc;

  beforeEach(() => {
    capturedDoc = null;
    firestoreService.saveTask.mockImplementation(async (doc) => {
      capturedDoc = doc;
      return { ...doc, taskId: 'mock-quick-id', createdAt: new Date() };
    });
    priorityService.calculatePriority.mockReturnValue(40);
  });

  afterEach(() => { jest.clearAllMocks(); });

  const KEYWORD_CASES = [
    ['Team meeting tomorrow', 'meeting', 1],
    ['Call mentor about project', 'call', 0.5],
    ['Read chapter 5', 'read', 0.5],
    ['Submit assignment', 'submit', 0.25],
    ['Send email to professor', 'email', 0.25],
    ['Buy groceries', 'buy', 0.25],
    ['Do something random', null, 0.5],   // no keyword → default 0.5
  ];

  test.each(KEYWORD_CASES)(
    'title "%s" (keyword: %s) → estimatedHours=%d',
    async (title, _keyword, expectedHours) => {
      await createQuickTask({ title, importance: 3 }, 'req-kw');
      expect(capturedDoc.estimatedHours).toBe(expectedHours);
    }
  );

  test('property: title containing exactly one known keyword gets the correct hours', () => {
    /**
     * Build titles that contain exactly one keyword so the match is unambiguous.
     * We pad with strings that cannot introduce other keywords.
     */
    const keywordExpected = { meeting: 1, call: 0.5, read: 0.5, submit: 0.25, email: 0.25, buy: 0.25 };
    const OTHER_KEYWORDS = Object.keys(keywordExpected);

    // Safe alphanumeric padding strings that contain none of the keywords
    const safePadding = fc.stringOf(fc.mapToConstant(
      { num: 26, build: (v) => String.fromCharCode(97 + v) }, // a-z
    ), { minLength: 0, maxLength: 5 }).filter((s) => {
      return !OTHER_KEYWORDS.some((kw) => s.toLowerCase().includes(kw));
    });

    return fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...Object.entries(keywordExpected)),
        safePadding,
        safePadding,
        async ([keyword, expectedHours], prefix, suffix) => {
          const title = `${prefix}${keyword}${suffix}`.trim() || keyword;
          // Verify no OTHER keyword sneaked in via prefix/suffix
          const titleLower = title.toLowerCase();
          const matchedKeywords = OTHER_KEYWORDS.filter((kw) => titleLower.includes(kw));
          // If multiple keywords match, skip this sample (can't guarantee winner)
          if (matchedKeywords.length > 1) return true;

          capturedDoc = null;
          firestoreService.saveTask.mockImplementation(async (doc) => {
            capturedDoc = doc;
            return { ...doc, taskId: 'kw-test' };
          });
          await createQuickTask({ title, importance: 3 }, 'req-prop-kw');
          return capturedDoc.estimatedHours === expectedHours;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('title with no keyword defaults to estimatedHours=0.5', () => {
    // Titles that contain none of the known keywords
    const noKeywordTitles = fc.string({ minLength: 3 }).filter((s) => {
      const lower = s.toLowerCase();
      return !['meeting', 'call', 'read', 'submit', 'email', 'buy'].some((kw) => lower.includes(kw));
    });

    return fc.assert(
      fc.asyncProperty(noKeywordTitles, async (title) => {
        capturedDoc = null;
        firestoreService.saveTask.mockImplementation(async (doc) => {
          capturedDoc = doc;
          return { ...doc, taskId: 'default-hours' };
        });
        await createQuickTask({ title, importance: 3 }, 'req-default');
        return capturedDoc.estimatedHours === 0.5;
      }),
      { numRuns: 100 }
    );
  });
});

describe('Property 9: createQuickTask document shape', () => {
  let capturedDoc;

  beforeEach(() => {
    capturedDoc = null;
    firestoreService.saveTask.mockImplementation(async (doc) => {
      capturedDoc = doc;
      return { ...doc, taskId: 'mock-shape-id', createdAt: new Date() };
    });
    priorityService.calculatePriority.mockReturnValue(55);
  });

  afterEach(() => { jest.clearAllMocks(); });

  const AI_ONLY_FIELDS = [
    'understanding', 'compositeConfidence', 'confidence', 'risks', 'deliverables',
    'aiSuggestions', 'taskUnderstanding', 'reasoning', 'explainability',
    'reviewLevel', 'reviewReason', 'reviewRequired', 'planningSnapshot',
    'taskType', 'difficulty',
  ];

  test('taskMode=quick, scheduledBy=User, subtasks=[], status=PENDING (set on taskDoc)', async () => {
    await createQuickTask({ title: 'Buy coffee', importance: 3 }, 'req-shape-1');

    expect(capturedDoc.taskMode).toBe('quick');
    expect(capturedDoc.scheduledBy).toBe('User');
    expect(capturedDoc.subtasks).toEqual([]);
    expect(capturedDoc.status).toBe('PENDING');
  });

  test('no null AI-only fields are included in the document', async () => {
    await createQuickTask({ title: 'Read chapter 3', importance: 2 }, 'req-shape-2');

    for (const field of AI_ONLY_FIELDS) {
      expect(capturedDoc).not.toHaveProperty(field);
    }
  });

  test('priorityScore=0 when deadline is absent', async () => {
    await createQuickTask({ title: 'Quick note', importance: 3 }, 'req-no-deadline');

    expect(capturedDoc.priorityScore).toBe(0);
    expect(priorityService.calculatePriority).not.toHaveBeenCalled();
  });

  test('priorityScore is computed when deadline is present', async () => {
    priorityService.calculatePriority.mockReturnValue(72);
    await createQuickTask({ title: 'Submit form', deadline: '2099-06-30', importance: 4 }, 'req-with-deadline');

    expect(priorityService.calculatePriority).toHaveBeenCalled();
    expect(capturedDoc.priorityScore).toBe(72);
  });

  test('actualHours is null, attachments is empty array', async () => {
    await createQuickTask({ title: 'Team meeting', importance: 3 }, 'req-shape-3');

    expect(capturedDoc.actualHours).toBeNull();
    expect(capturedDoc.attachments).toEqual([]);
  });

  test('category falls back to historyService inference when not provided', async () => {
    // "meeting" is a keyword in historyService CATEGORY_KEYWORDS → maps to 'meeting'
    await createQuickTask({ title: 'standup meeting', importance: 3 }, 'req-cat-infer');

    expect(capturedDoc.category).toBe('meeting');
  });

  test('explicit body.category takes precedence over title inference', async () => {
    await createQuickTask({ title: 'standup meeting', category: 'work', importance: 3 }, 'req-cat-explicit');

    expect(capturedDoc.category).toBe('work');
  });

  test('optional fields present in body are persisted', async () => {
    const body = {
      title: 'Evening call',
      importance: 2,
      description: 'Weekly sync',
      preferredWorkingTime: 'Evening',
      dailyAvailability: '1-2 hours',
      experienceLevel: 'Comfortable',
      timePreference: 'Evening',
      energyLevel: 'Normal',
    };
    await createQuickTask(body, 'req-optional');

    expect(capturedDoc.description).toBe('Weekly sync');
    expect(capturedDoc.preferredWorkingTime).toBe('Evening');
    expect(capturedDoc.dailyAvailability).toBe('1-2 hours');
    expect(capturedDoc.experienceLevel).toBe('Comfortable');
    expect(capturedDoc.timePreference).toBe('Evening');
    expect(capturedDoc.energyLevel).toBe('Normal');
  });

  test('throws AppError when title is empty after sanitization', async () => {
    await expect(createQuickTask({ title: '   ', importance: 3 }, 'req-empty')).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
