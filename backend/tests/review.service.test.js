/**
 * Tests for review.service.js
 *
 * Tests the three-tier review level logic: NONE | WARNING | REQUIRED
 *
 * REQUIRED conditions (highest severity):
 *   - Deadline today/past
 *   - estimatedHours > maxPossible (daysLeft × dailyHours)
 *   - compositeConfidence < 75
 *   - descBlank && (difficulty === 'Hard' || 'Very Hard')
 *
 * WARNING conditions:
 *   - estimatedHours > 50 && <= 80
 *   - compositeConfidence >= 75 && <= 84
 *
 * NONE: none of the above triggered.
 *
 * **Validates: Requirements 4, 11, 19**
 */

const fc = require('fast-check');
const { applyReviewLevel } = require('../src/services/review.service');

/** Clearly future date — well beyond today */
const FUTURE_DATE = '2099-12-31';
/** Clearly past date — never flaky */
const PAST_DATE = '2020-01-01';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Clean aiPlan — triggers no rules on its own */
const cleanAiPlan = (overrides = {}) => ({
  estimatedHours: 10,
  ...overrides,
});

/** Clean formData — triggers no rules on its own */
const cleanFormData = (overrides = {}) => ({
  description: 'A clear and complete description of the task',
  difficulty: 'Medium',
  deadline: FUTURE_DATE,
  dailyAvailability: '4-6 hours', // 5h/day
  ...overrides,
});

// ── REQUIRED conditions ────────────────────────────────────────────────────────

describe('applyReviewLevel — REQUIRED conditions', () => {
  test('REQUIRED: deadline in the past', () => {
    const result = applyReviewLevel(
      cleanAiPlan(),
      cleanFormData({ deadline: PAST_DATE }),
      90
    );
    expect(result.reviewLevel).toBe('REQUIRED');
    expect(result.reviewRequired).toBe(true);
  });

  test('REQUIRED: deadline is today (treated as past/due)', () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const result = applyReviewLevel(
      cleanAiPlan(),
      cleanFormData({ deadline: todayStr }),
      90
    );
    expect(result.reviewLevel).toBe('REQUIRED');
    expect(result.reviewRequired).toBe(true);
  });

  test('REQUIRED: estimatedHours > maxPossible — hours exceed deadline capacity', () => {
    // dailyAvailability '1-2 hours' = 1.5h/day
    // Tomorrow = 1 day left → maxPossible = 1.5h
    // estimatedHours = 100 > 1.5 → REQUIRED
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const result = applyReviewLevel(
      cleanAiPlan({ estimatedHours: 100 }),
      cleanFormData({ deadline: tomorrowStr, dailyAvailability: '1-2 hours' }),
      90
    );
    expect(result.reviewLevel).toBe('REQUIRED');
    expect(result.reviewRequired).toBe(true);
  });

  test('REQUIRED: compositeConfidence < 75', () => {
    const result = applyReviewLevel(
      cleanAiPlan(),
      cleanFormData(),
      74
    );
    expect(result.reviewLevel).toBe('REQUIRED');
    expect(result.reviewRequired).toBe(true);
  });

  test('REQUIRED: compositeConfidence = 0 (absolute minimum)', () => {
    const result = applyReviewLevel(
      cleanAiPlan(),
      cleanFormData(),
      0
    );
    expect(result.reviewLevel).toBe('REQUIRED');
    expect(result.reviewRequired).toBe(true);
  });

  test('REQUIRED: blank description + Hard difficulty', () => {
    const result = applyReviewLevel(
      cleanAiPlan(),
      cleanFormData({ description: '', difficulty: 'Hard' }),
      90
    );
    expect(result.reviewLevel).toBe('REQUIRED');
    expect(result.reviewRequired).toBe(true);
  });

  test('REQUIRED: blank description + Very Hard difficulty', () => {
    const result = applyReviewLevel(
      cleanAiPlan(),
      cleanFormData({ description: '   ', difficulty: 'Very Hard' }),
      90
    );
    expect(result.reviewLevel).toBe('REQUIRED');
    expect(result.reviewRequired).toBe(true);
  });

  test('NOT REQUIRED: blank description + Medium difficulty (rule does not fire)', () => {
    const result = applyReviewLevel(
      cleanAiPlan(),
      cleanFormData({ description: '', difficulty: 'Medium' }),
      90
    );
    // No REQUIRED rule fires — could be NONE or WARNING depending on other fields
    expect(result.reviewLevel).not.toBe('REQUIRED');
  });
});

// ── WARNING conditions ─────────────────────────────────────────────────────────

describe('applyReviewLevel — WARNING conditions', () => {
  test('WARNING: estimatedHours = 60 (> 50 and <= 80)', () => {
    const result = applyReviewLevel(
      cleanAiPlan({ estimatedHours: 60 }),
      cleanFormData(),
      90  // high confidence, no REQUIRED triggers
    );
    expect(result.reviewLevel).toBe('WARNING');
    expect(result.reviewRequired).toBe(true);
  });

  test('WARNING: estimatedHours = 51 (just above threshold)', () => {
    const result = applyReviewLevel(
      cleanAiPlan({ estimatedHours: 51 }),
      cleanFormData(),
      90
    );
    expect(result.reviewLevel).toBe('WARNING');
  });

  test('WARNING: estimatedHours = 80 (at upper boundary)', () => {
    const result = applyReviewLevel(
      cleanAiPlan({ estimatedHours: 80 }),
      cleanFormData(),
      90
    );
    expect(result.reviewLevel).toBe('WARNING');
  });

  test('NOT WARNING: estimatedHours = 50 (at threshold, not above)', () => {
    const result = applyReviewLevel(
      cleanAiPlan({ estimatedHours: 50 }),
      cleanFormData(),
      90
    );
    expect(result.reviewLevel).toBe('NONE');
  });

  test('NOT WARNING: estimatedHours = 81 (above upper boundary)', () => {
    // 81h > 80 so the WARNING range does not apply.
    // With confidence=90, no past deadline — could still be REQUIRED via hours > maxPossible
    // Use far future deadline with 6+ hours/day to ensure hours are feasible
    const result = applyReviewLevel(
      cleanAiPlan({ estimatedHours: 81 }),
      cleanFormData({ dailyAvailability: '6+ hours' }), // 7h/day × many days = feasible
      90
    );
    // 81h > 80 — not in WARNING range AND not impossible given 6+ hours/day × ~365 days
    expect(result.reviewLevel).toBe('NONE');
  });

  test('WARNING: compositeConfidence = 80 (in 75–84 band)', () => {
    const result = applyReviewLevel(
      cleanAiPlan(),
      cleanFormData(),
      80
    );
    expect(result.reviewLevel).toBe('WARNING');
    expect(result.reviewRequired).toBe(true);
  });

  test('WARNING: compositeConfidence = 75 (lower boundary of warning band)', () => {
    const result = applyReviewLevel(
      cleanAiPlan(),
      cleanFormData(),
      75
    );
    expect(result.reviewLevel).toBe('WARNING');
  });

  test('WARNING: compositeConfidence = 84 (upper boundary of warning band)', () => {
    const result = applyReviewLevel(
      cleanAiPlan(),
      cleanFormData(),
      84
    );
    expect(result.reviewLevel).toBe('WARNING');
  });

  test('NOT WARNING: compositeConfidence = 85 (just above warning band)', () => {
    const result = applyReviewLevel(
      cleanAiPlan(),
      cleanFormData(),
      85
    );
    expect(result.reviewLevel).toBe('NONE');
  });
});

// ── NONE condition ─────────────────────────────────────────────────────────────

describe('applyReviewLevel — NONE condition', () => {
  test('NONE: all clean — future deadline, low hours, high confidence, description provided', () => {
    const result = applyReviewLevel(
      cleanAiPlan({ estimatedHours: 10 }),
      cleanFormData(),
      90
    );
    expect(result.reviewLevel).toBe('NONE');
    expect(result.reviewRequired).toBe(false);
    expect(result.reviewReason).toBe('');
  });

  test('NONE: reviewRequired boolean is false when level is NONE', () => {
    const result = applyReviewLevel(cleanAiPlan(), cleanFormData(), 90);
    expect(result.reviewRequired).toBe(result.reviewLevel !== 'NONE');
    expect(result.reviewRequired).toBe(false);
  });
});

// ── Highest severity wins ───────────────────────────────────────────────────────

describe('applyReviewLevel — severity precedence', () => {
  test('REQUIRED beats WARNING: both conditions fire → REQUIRED', () => {
    // estimatedHours=60 → WARNING, compositeConfidence=50 → REQUIRED
    // REQUIRED should win
    const result = applyReviewLevel(
      cleanAiPlan({ estimatedHours: 60 }),
      cleanFormData(),
      50  // < 75 → REQUIRED
    );
    expect(result.reviewLevel).toBe('REQUIRED');
  });

  test('REQUIRED beats WARNING: past deadline + high hours both fire', () => {
    // Past deadline → REQUIRED, estimatedHours=60 → WARNING
    const result = applyReviewLevel(
      cleanAiPlan({ estimatedHours: 60 }),
      cleanFormData({ deadline: PAST_DATE }),
      90
    );
    expect(result.reviewLevel).toBe('REQUIRED');
  });

  test('multiple REQUIRED conditions all fire → still REQUIRED (not escalated further)', () => {
    const result = applyReviewLevel(
      cleanAiPlan(),
      cleanFormData({ deadline: PAST_DATE, description: '', difficulty: 'Hard' }),
      50  // < 75 → REQUIRED
    );
    expect(result.reviewLevel).toBe('REQUIRED');
  });
});

// ── reviewRequired boolean invariant ─────────────────────────────────────────

describe('applyReviewLevel — reviewRequired boolean invariant', () => {
  test('reviewRequired is false for NONE', () => {
    const result = applyReviewLevel(cleanAiPlan(), cleanFormData(), 90);
    expect(result.reviewRequired).toBe(false);
  });

  test('reviewRequired is true for WARNING', () => {
    const result = applyReviewLevel(cleanAiPlan({ estimatedHours: 60 }), cleanFormData(), 90);
    expect(result.reviewRequired).toBe(true);
  });

  test('reviewRequired is true for REQUIRED', () => {
    const result = applyReviewLevel(cleanAiPlan(), cleanFormData(), 50);
    expect(result.reviewRequired).toBe(true);
  });

  test('reviewRequired always equals (reviewLevel !== "NONE")', () => {
    const scenarios = [
      [cleanAiPlan(), cleanFormData(), 90],                                   // NONE
      [cleanAiPlan({ estimatedHours: 60 }), cleanFormData(), 90],             // WARNING
      [cleanAiPlan(), cleanFormData(), 50],                                   // REQUIRED (low conf)
      [cleanAiPlan(), cleanFormData({ deadline: PAST_DATE }), 90],           // REQUIRED (past deadline)
    ];

    for (const [aiPlan, formData, confidence] of scenarios) {
      const result = applyReviewLevel(aiPlan, formData, confidence);
      expect(result.reviewRequired).toBe(result.reviewLevel !== 'NONE');
    }
  });
});

// ── Property-based: result is always one of ['NONE', 'WARNING', 'REQUIRED'] ──

describe('applyReviewLevel — property: result is always a valid level', () => {
  /**
   * **Validates: Requirements 4, 11, 19**
   *
   * For any valid inputs, reviewLevel must be one of the three valid tiers.
   */
  test('property: reviewLevel is always NONE, WARNING, or REQUIRED', () => {
    const validLevels = ['NONE', 'WARNING', 'REQUIRED'];

    const hoursArb = fc.float({ min: Math.fround(0.1), max: Math.fround(200), noNaN: true });
    const confidenceArb = fc.integer({ min: 0, max: 100 });
    const deadlineArb = fc.constantFrom(PAST_DATE, FUTURE_DATE, '2024-06-01', '2025-01-01');
    const difficultyArb = fc.constantFrom('Easy', 'Medium', 'Hard', 'Very Hard');
    const descriptionArb = fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: '' });
    const availabilityArb = fc.constantFrom(
      '< 1 hour', '1-2 hours', '2-4 hours', '4-6 hours', '6+ hours', undefined
    );

    fc.assert(
      fc.property(
        hoursArb, confidenceArb, deadlineArb, difficultyArb, descriptionArb, availabilityArb,
        (estimatedHours, compositeConfidence, deadline, difficulty, description, dailyAvailability) => {
          const aiPlan = { estimatedHours };
          const formData = { description, difficulty, deadline };
          if (dailyAvailability) formData.dailyAvailability = dailyAvailability;

          const result = applyReviewLevel(aiPlan, formData, compositeConfidence);

          // reviewLevel must be a valid tier
          if (!validLevels.includes(result.reviewLevel)) return false;

          // reviewRequired must match level
          if (result.reviewRequired !== (result.reviewLevel !== 'NONE')) return false;

          // reviewReason must be a string
          if (typeof result.reviewReason !== 'string') return false;

          return true;
        }
      ),
      { numRuns: 500 }
    );
  });
});
