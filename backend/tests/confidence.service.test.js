/**
 * Tests for confidence.service.js
 *
 * Tests the weighted composite confidence formula:
 *   composite = round(geminiScore * 0.5 + completenessScore * 0.3 + consistencyScore * 0.2)
 *
 * Components:
 *   - Gemini confidence: 50% weight
 *   - Input completeness: 30% weight (description + 6 optional fields)
 *   - Deadline consistency: 20% weight (0 if past, 100 if future/absent)
 *
 * **Validates: Requirements 2, 12**
 */

const fc = require('fast-check');
const { computeCompositeConfidence } = require('../src/services/confidence.service');

/** Clearly future date — never flaky */
const FUTURE_DATE = '2099-12-31';
/** Clearly past date — never flaky */
const PAST_DATE = '2020-01-01';

// ── 1. Weighted formula — known exact values ───────────────────────────────────

describe('computeCompositeConfidence — weighted formula', () => {
  test('known exact value: gemini=80, desc+category, future deadline → 68', () => {
    // completenessRaw = 20 (desc) + 5 (category) = 25
    // composite = round(80*0.5 + 25*0.3 + 100*0.2) = round(40 + 7.5 + 20) = round(67.5) = 68
    const result = computeCompositeConfidence(80, {
      description: 'A description that is long enough to count',
      category: 'Work',
      deadline: FUTURE_DATE,
    });
    expect(result).toBe(68);
  });

  test('known exact value: gemini=100, no optional fields, no description, no deadline → 70', () => {
    // completenessRaw = 0, consistencyScore = 100 (no deadline = not past)
    // composite = round(100*0.5 + 0*0.3 + 100*0.2) = round(50 + 0 + 20) = 70
    const result = computeCompositeConfidence(100, {});
    expect(result).toBe(70);
  });

  test('known exact value: gemini=50, no fields, past deadline → 25', () => {
    // completenessRaw = 0, consistencyScore = 0 (past deadline)
    // composite = round(50*0.5 + 0*0.3 + 0*0.2) = round(25) = 25
    const result = computeCompositeConfidence(50, { deadline: PAST_DATE });
    expect(result).toBe(25);
  });

  test('known exact value: gemini=60, all 6 optional fields + description, future deadline → 60', () => {
    // completenessRaw = 20 + 6*5 = 50, consistencyScore = 100
    // composite = round(60*0.5 + 50*0.3 + 100*0.2) = round(30 + 15 + 20) = 65
    const result = computeCompositeConfidence(60, {
      description: 'A description that is long enough to count',
      category: 'Work',
      taskType: 'Deep Work',
      difficulty: 'Medium',
      dailyAvailability: '4-6 hours',
      preferredWorkingTime: 'Evening',
      experienceLevel: 'Comfortable',
      deadline: FUTURE_DATE,
    });
    expect(result).toBe(65);
  });
});

// ── 2. All optional fields filled ────────────────────────────────────────────

describe('computeCompositeConfidence — all optional fields filled', () => {
  test('all 6 optional fields + good description → completenessRaw = 50 (not capped)', () => {
    // completenessRaw = 20 + 6*5 = 50 (under the 100 cap)
    // gemini=0, no deadline → round(0*0.5 + 50*0.3 + 100*0.2) = round(0 + 15 + 20) = 35
    const result = computeCompositeConfidence(0, {
      description: 'A description that is long enough to count',
      category: 'Work',
      taskType: 'Deep Work',
      difficulty: 'Medium',
      dailyAvailability: '4-6 hours',
      preferredWorkingTime: 'Evening',
      experienceLevel: 'Comfortable',
    });
    expect(result).toBe(35);
  });
});

// ── 3. Past deadline → consistencyScore = 0 ──────────────────────────────────

describe('computeCompositeConfidence — past deadline', () => {
  test('past deadline reduces the 20% consistency component to 0', () => {
    // gemini=80, no other fields, past deadline
    // composite = round(80*0.5 + 0*0.3 + 0*0.2) = round(40) = 40
    const result = computeCompositeConfidence(80, { deadline: PAST_DATE });
    expect(result).toBe(40);
  });

  test('future deadline keeps consistencyScore = 100', () => {
    // gemini=80, no other fields, future deadline
    // composite = round(80*0.5 + 0*0.3 + 100*0.2) = round(40 + 0 + 20) = 60
    const result = computeCompositeConfidence(80, { deadline: FUTURE_DATE });
    expect(result).toBe(60);
  });

  test('no deadline defaults to consistencyScore = 100 (not considered past)', () => {
    // gemini=80, no other fields, no deadline
    // composite = round(80*0.5 + 0*0.3 + 100*0.2) = round(40 + 0 + 20) = 60
    const resultNoDeadline = computeCompositeConfidence(80, {});
    const resultFutureDeadline = computeCompositeConfidence(80, { deadline: FUTURE_DATE });
    expect(resultNoDeadline).toBe(resultFutureDeadline);
  });
});

// ── 4. No optional fields, no description ────────────────────────────────────

describe('computeCompositeConfidence — no optional fields', () => {
  test('no optional fields and no description → completenessScore = 0', () => {
    // gemini=70, no fields, no deadline → round(70*0.5 + 0 + 100*0.2) = round(35 + 20) = 55
    const result = computeCompositeConfidence(70, {});
    expect(result).toBe(55);
  });

  test('description shorter than 10 chars does not count toward completeness', () => {
    // description = "short" (5 chars, fails > 10 check)
    // gemini=70 → same as no description
    const resultShortDesc = computeCompositeConfidence(70, { description: 'short' });
    const resultNoDesc = computeCompositeConfidence(70, {});
    expect(resultShortDesc).toBe(resultNoDesc);
  });
});

// ── 5. Result is always an integer ────────────────────────────────────────────

describe('computeCompositeConfidence — result is always an integer', () => {
  test('result is an integer for known inputs', () => {
    const result = computeCompositeConfidence(75, {
      description: 'A description that is long enough',
      deadline: FUTURE_DATE,
    });
    expect(Number.isInteger(result)).toBe(true);
  });

  test('Math.round ensures integer result even with fractional weights', () => {
    // gemini=1, completeness=20 (just desc) → round(1*0.5 + 20*0.3 + 100*0.2) = round(0.5 + 6 + 20) = round(26.5) = 27
    const result = computeCompositeConfidence(1, {
      description: 'A description that is long enough',
    });
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBe(27);
  });
});

// ── 6. Property-based: result always in [0, 100] ─────────────────────────────

describe('computeCompositeConfidence — property: result always in [0, 100]', () => {
  /**
   * **Validates: Requirements 2, 12**
   *
   * For any valid geminiConfidence in [0, 100] and any body:
   * - The result must be an integer
   * - The result must be in range [0, 100]
   */
  test('property: result in [0, 100] and is integer for arbitrary inputs', () => {
    const validConfidence = fc.integer({ min: 0, max: 100 });
    const optionalString = fc.option(fc.string({ minLength: 0, maxLength: 50 }), { nil: undefined });
    const optionalDate = fc.option(
      fc.constantFrom(PAST_DATE, FUTURE_DATE, '2024-01-01', '2023-06-15'),
      { nil: undefined }
    );

    const bodyArb = fc.record({
      description: optionalString,
      category: optionalString,
      taskType: optionalString,
      difficulty: optionalString,
      dailyAvailability: optionalString,
      preferredWorkingTime: optionalString,
      experienceLevel: optionalString,
      deadline: optionalDate,
    });

    fc.assert(
      fc.property(validConfidence, bodyArb, (geminiConfidence, body) => {
        const result = computeCompositeConfidence(geminiConfidence, body);

        // Must be an integer
        if (!Number.isInteger(result)) return false;

        // Must be in range [0, 100]
        if (result < 0 || result > 100) return false;

        return true;
      }),
      { numRuns: 500 }
    );
  });
});
