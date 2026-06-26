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

// ─── Property 1a: Gemini flag passthrough ─────────────────────────────────────

describe('Property 1a: Gemini reviewRequired flag passthrough', () => {
  test('geminiReviewRequired=true always yields reviewRequired=true', () => {
    /**
     * Generator: arbitrary estimatedHours, confidence, difficulty, description, deadline
     * — all in the "clean" range so no backend rule fires.
     * Only the Gemini flag is true.
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
        const aiPlan = cleanAiPlan({ estimatedHours, confidence, reviewRequired: true, reviewReason: geminiReason });
        const formData = cleanFormData({ description, difficulty });
        const { reviewRequired } = applyReviewRequiredRules(aiPlan, formData);
        return reviewRequired === true;
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
      // Gemini flag
      fc.record({
        estimatedHours: fc.float({ min: Math.fround(0.5), max: Math.fround(100), noNaN: true }),
        confidence: fc.integer({ min: 70, max: 100 }),
        geminiReviewRequired: fc.constant(true),
        description: fc.string({ minLength: 1 }),
        difficulty: fc.constantFrom('Easy', 'Medium'),
        deadline: fc.constant(FUTURE_DATE),
      }),
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
 * Property 7: Approve Recomputes reviewRequired Server-Side
 *   - Even if the client sends aiPlan.reviewRequired = false, the backend
 *     must recompute and set reviewRequired = true when any rule fires
 *     (e.g. confidence < 70 triggers Rule 2).
 *
 * Validates: Requirements 8.5, 11.2
 */

// Require approveTask directly from the service (already exported for testing)
const { approveTask } = require('../src/services/task.service');
const firestoreService = require('../src/services/firestore.service');
const priorityService = require('../src/services/priority.service');
const geminiService = require('../src/services/gemini.service');

// Mock dependencies so approveTask runs without real Firebase / Gemini
jest.mock('../src/services/firestore.service');
jest.mock('../src/services/priority.service');
jest.mock('../src/services/gemini.service');

/**
 * A minimal but fully valid aiPlan object (passes approveSchema).
 * Override individual fields per test.
 */
const baseAiPlan = (overrides = {}) => ({
  understanding: 'Implement the feature as described.',
  estimatedHours: 8,
  suggestedPriorityScore: 75,   // advisory only — must NOT be persisted
  confidence: 85,
  reviewRequired: false,
  reviewReason: '',
  risks: [],
  subtasks: [{ name: 'Planning', hours: 2 }, { name: 'Execution', hours: 6 }],
  ...overrides,
});

/**
 * A minimal valid request body for approveTask.
 * Uses a future deadline so Rule 4 does not fire.
 */
const baseBody = (aiPlanOverrides = {}, bodyOverrides = {}) => ({
  title: 'Build the landing page',
  description: 'A detailed description of the task.',
  category: 'Project',
  taskType: 'Coding Project',
  difficulty: 'Medium',
  deadline: '2099-12-31',
  importance: 3,
  dailyAvailability: '4h',
  preferredWorkingTime: 'Evening',
  attachments: [],
  aiPlan: baseAiPlan(aiPlanOverrides),
  ...bodyOverrides,
});

describe('Property 6: approveTask never stores suggestedPriorityScore', () => {
  let capturedDoc;

  beforeEach(() => {
    capturedDoc = null;
    // Capture the document passed to saveTask
    firestoreService.saveTask.mockImplementation(async (doc) => {
      capturedDoc = doc;
      return { ...doc, taskId: 'mock-task-id', status: 'PENDING', createdAt: new Date() };
    });
    // calculatePriority returns a fixed score — value doesn't matter for this property
    priorityService.calculatePriority.mockReturnValue(60);
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
    // Test a range of suggestedPriorityScore values the client might send
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

describe('Property 7: approveTask recomputes reviewRequired server-side', () => {
  let capturedDoc;

  beforeEach(() => {
    capturedDoc = null;
    firestoreService.saveTask.mockImplementation(async (doc) => {
      capturedDoc = doc;
      return { ...doc, taskId: 'mock-task-id', status: 'PENDING', createdAt: new Date() };
    });
    priorityService.calculatePriority.mockReturnValue(50);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('client sends reviewRequired=false but Rule 2 (confidence<70) fires → saved doc has reviewRequired=true', async () => {
    const body = baseBody({ reviewRequired: false, confidence: 30 });
    // confidence: 30 < 70  → Rule 2 must fire and override the client's false

    await approveTask(body, 'req-003');

    expect(capturedDoc).not.toBeNull();
    expect(capturedDoc.reviewRequired).toBe(true);
  });

  test('client sends reviewRequired=false but Rule 1 (estimatedHours>100) fires → saved doc has reviewRequired=true', async () => {
    const body = baseBody({ reviewRequired: false, estimatedHours: 200 });

    await approveTask(body, 'req-004');

    expect(capturedDoc.reviewRequired).toBe(true);
  });

  test('client sends reviewRequired=false but Rule 3 (blank description + Hard) fires → saved doc has reviewRequired=true', async () => {
    const body = baseBody(
      { reviewRequired: false },
      { description: '', difficulty: 'Hard' }
    );

    await approveTask(body, 'req-005');

    expect(capturedDoc.reviewRequired).toBe(true);
  });

  test('client sends reviewRequired=false but Rule 4 (past deadline) fires → saved doc has reviewRequired=true', async () => {
    const body = baseBody(
      { reviewRequired: false },
      { deadline: '2020-01-01' }
    );

    await approveTask(body, 'req-006');

    expect(capturedDoc.reviewRequired).toBe(true);
  });

  test('all rules clean → reviewRequired remains false as supplied by client', async () => {
    // confidence >= 70, estimatedHours in range, description provided,
    // difficulty not hard, deadline well in the future, gemini flag false
    const body = baseBody({ reviewRequired: false, confidence: 85, estimatedHours: 8 });

    await approveTask(body, 'req-007');

    expect(capturedDoc.reviewRequired).toBe(false);
  });

  test('reviewReason is a non-empty string when Rule 2 fires', async () => {
    const body = baseBody({ reviewRequired: false, confidence: 30 });

    await approveTask(body, 'req-008');

    expect(typeof capturedDoc.reviewReason).toBe('string');
    expect(capturedDoc.reviewReason.length).toBeGreaterThan(0);
  });
});
