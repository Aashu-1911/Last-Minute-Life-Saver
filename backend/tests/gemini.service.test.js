/**
 * Property-Based Tests for gemini.service.js
 *
 * Property 4: Fallback Structural Validity
 *   - FULL_FALLBACK must pass aiPlanSchema validation
 *   - Any mutation that sets estimatedHours to a non-positive value (0, -1, null)
 *     must FAIL aiPlanSchema validation
 *
 * Validates: Requirements 3.5, 8.2
 */

// Stub the Gemini API config so the module can be required without a real API key.
// The tests here never call the Gemini API — they only exercise the pure schema
// and constant exports from gemini.service.js.
jest.mock('../src/config/gemini', () => ({
  generateContent: jest.fn(),
}));

const fc = require('fast-check');
const { aiPlanSchema, FULL_FALLBACK } = require('../src/services/gemini.service');

// ─── Property 4: Fallback Structural Validity ─────────────────────────────────

describe('Property 4: Fallback Structural Validity', () => {
  test('FULL_FALLBACK is valid against aiPlanSchema', () => {
    const { error } = aiPlanSchema.validate(FULL_FALLBACK);
    expect(error).toBeUndefined();
  });

  test('mutations with non-positive estimatedHours fail aiPlanSchema', () => {
    /**
     * Generator: pick a non-positive estimatedHours value from {0, negative integer, null}.
     * These are the only values the property spec requires us to exercise.
     */
    const nonPositiveHours = fc.oneof(
      fc.constant(0),
      fc.integer({ min: -1000, max: -1 }),
      fc.constant(null)
    );

    fc.assert(
      fc.property(nonPositiveHours, (badHours) => {
        const mutated = { ...FULL_FALLBACK, estimatedHours: badHours };
        const { error } = aiPlanSchema.validate(mutated);
        // Validation MUST fail — a non-positive estimatedHours is schema-invalid
        return error !== undefined;
      }),
      { numRuns: 200 }
    );
  });
});
