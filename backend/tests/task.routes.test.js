/**
 * Property-Based Tests for task routes (HTTP layer integration)
 *
 * Property 3: Clarification Loop Never Exceeds 1 Round
 *   - When a request is flagged as a clarification resubmit (_isClarificationResubmit: true)
 *     and Gemini still returns clarificationRequired: true, the backend MUST return
 *     HTTP 422 with a human-readable error string — for ANY non-empty answer string.
 *
 * **Validates: Requirements 4.8**
 */

// Mock Firebase and Gemini configs so the app can be required without real credentials.
jest.mock('../src/config/firebase', () => ({}));
jest.mock('../src/config/gemini', () => ({ generateContent: jest.fn() }));

// Mock the entire geminiService module — we control decomposeFull in each test.
jest.mock('../src/services/gemini.service');
// Mock firestoreService to prevent any real DB calls.
jest.mock('../src/services/firestore.service');
// Mock history and priority services to prevent real calls in quick task route.
jest.mock('../src/services/history.service');
jest.mock('../src/services/priority.service');

const request = require('supertest');
const fc = require('fast-check');
const app = require('../src/app');
const geminiService = require('../src/services/gemini.service');
const firestoreService = require('../src/services/firestore.service');
const historyService = require('../src/services/history.service');
const priorityService = require('../src/services/priority.service');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Valid base body for POST /api/v1/tasks/preview.
 * All required fields pass validation; description and _isClarificationResubmit
 * are injected per test.
 */
const makeBody = (answer) => ({
  title: 'Test Task',
  deadline: '2099-12-31',
  importance: 3,
  description: answer,
  _isClarificationResubmit: true,
});

// ── Property 3: Clarification Loop Never Exceeds 1 Round ──────────────────────

describe('Property 3: Clarification Loop Never Exceeds 1 Round', () => {
  beforeEach(() => {
    // Always return clarificationRequired: true from Gemini — simulates a stubborn
    // AI that refuses to produce a plan even after the user answered clarification questions.
    geminiService.decomposeFull.mockResolvedValue({
      clarificationRequired: true,
      questions: ['a', 'b'],
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test(
    'for any non-empty answer string, resubmit with clarificationRequired response yields HTTP 422 with human-readable error',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate arbitrary non-empty strings as the clarification answer.
          // Constrain to printable ASCII so it passes the Joi description validator.
          fc.stringOf(
            fc.char().filter((c) => c >= ' ' && c <= '~'),
            { minLength: 1, maxLength: 200 }
          ),
          async (answer) => {
            const response = await request(app)
              .post('/api/v1/tasks/preview')
              .set('Content-Type', 'application/json')
              .send(makeBody(answer));

            // Status must be 422 — not 200 (clarification) or any other code
            if (response.status !== 422) return false;

            // Body must have a non-empty, human-readable error string
            if (typeof response.body.error !== 'string') return false;
            if (response.body.error.trim().length === 0) return false;

            return true;
          }
        ),
        { numRuns: 50 }  // 50 runs is sufficient for an HTTP integration property
      );
    }
  );

  test('resubmit flag true with clarificationRequired response returns HTTP 422', async () => {
    const response = await request(app)
      .post('/api/v1/tasks/preview')
      .set('Content-Type', 'application/json')
      .send(makeBody('I need help with my project presentation'));

    expect(response.status).toBe(422);
    expect(typeof response.body.error).toBe('string');
    expect(response.body.error.trim().length).toBeGreaterThan(0);
  });

  test('resubmit flag false with clarificationRequired response returns HTTP 200 (not blocked)', async () => {
    // Without the resubmit flag, first-round clarification should pass through as HTTP 200
    const response = await request(app)
      .post('/api/v1/tasks/preview')
      .set('Content-Type', 'application/json')
      .send({
        title: 'Test Task',
        deadline: '2099-12-31',
        importance: 3,
        description: 'some description',
        _isClarificationResubmit: false,
      });

    expect(response.status).toBe(200);
    expect(response.body.clarificationRequired).toBe(true);
  });

  test('resubmit flag absent with clarificationRequired response returns HTTP 200 (not blocked)', async () => {
    // No resubmit flag at all — first request, should not be blocked
    const response = await request(app)
      .post('/api/v1/tasks/preview')
      .set('Content-Type', 'application/json')
      .send({
        title: 'Test Task',
        deadline: '2099-12-31',
        importance: 3,
      });

    expect(response.status).toBe(200);
    expect(response.body.clarificationRequired).toBe(true);
  });
});


// ── POST /api/v1/tasks/quick — Quick Task creation ────────────────────────────

/**
 * Tests for the POST /quick route.
 * Validates HTTP 201 response, taskMode field, and input validation.
 *
 * **Validates: Requirements 2, 11, 12, 19**
 */
describe('POST /api/v1/tasks/quick — Quick Task creation', () => {
  beforeEach(() => {
    // Mock firestoreService.saveTask to return a simulated saved document
    firestoreService.saveTask.mockImplementation(async (doc) => ({
      ...doc,
      taskId: 'test-quick-id',
      createdAt: new Date(),
    }));

    // historyService.inferCategoryFromTitle: return null to avoid real inference
    historyService.inferCategoryFromTitle.mockReturnValue(null);

    // priorityService.calculatePriority: return 0
    priorityService.calculatePriority.mockReturnValue(0);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('POST /quick with valid body returns HTTP 201 with success=true and taskMode=quick', async () => {
    const response = await request(app)
      .post('/api/v1/tasks/quick')
      .set('Content-Type', 'application/json')
      .send({ title: 'Buy coffee', importance: 3 });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.task).toBeDefined();
    expect(response.body.task.taskMode).toBe('quick');
  });

  test('POST /quick with minimum required fields (title only) returns HTTP 201', async () => {
    const response = await request(app)
      .post('/api/v1/tasks/quick')
      .set('Content-Type', 'application/json')
      .send({ title: 'Drink water' });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  test('POST /quick with optional fields returns HTTP 201', async () => {
    const response = await request(app)
      .post('/api/v1/tasks/quick')
      .set('Content-Type', 'application/json')
      .send({
        title: 'Team meeting prep',
        importance: 4,
        description: 'Prepare slides for the team sync',
        deadline: '2099-06-30',
      });

    expect(response.status).toBe(201);
    expect(response.body.task.taskMode).toBe('quick');
  });

  test('POST /quick missing title returns HTTP 400', async () => {
    const response = await request(app)
      .post('/api/v1/tasks/quick')
      .set('Content-Type', 'application/json')
      .send({ importance: 3 });

    expect(response.status).toBe(400);
  });

  test('POST /quick title too short (< 3 chars) returns HTTP 400', async () => {
    const response = await request(app)
      .post('/api/v1/tasks/quick')
      .set('Content-Type', 'application/json')
      .send({ title: 'ab', importance: 3 });

    expect(response.status).toBe(400);
  });

  test('POST /quick invalid importance value (0) returns HTTP 400', async () => {
    const response = await request(app)
      .post('/api/v1/tasks/quick')
      .set('Content-Type', 'application/json')
      .send({ title: 'Valid title here', importance: 0 });

    expect(response.status).toBe(400);
  });

  test('POST /quick invalid importance value (6) returns HTTP 400', async () => {
    const response = await request(app)
      .post('/api/v1/tasks/quick')
      .set('Content-Type', 'application/json')
      .send({ title: 'Valid title here', importance: 6 });

    expect(response.status).toBe(400);
  });

  test('POST /quick response body has taskId from saveTask mock', async () => {
    const response = await request(app)
      .post('/api/v1/tasks/quick')
      .set('Content-Type', 'application/json')
      .send({ title: 'Submit assignment', importance: 2 });

    expect(response.status).toBe(201);
    expect(response.body.task.taskId).toBe('test-quick-id');
  });
});
