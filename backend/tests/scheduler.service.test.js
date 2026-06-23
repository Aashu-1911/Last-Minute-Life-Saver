/**
 * Unit tests for scheduler.service.js
 * Pure logic — no Firestore, no external calls.
 */

const {
  generateSchedule,
  classifyEstimate,
  isValidEstimatedHours,
  daysUntilDeadline,
} = require('../src/services/scheduler.service');

const TODAY = '2026-06-23';
const avail = { startHour: 16, endHour: 22 }; // 6 h/day
const opts = { today: TODAY };

const makeTask = (overrides) => ({
  taskId: 'task-1',
  taskTitle: 'Test Task',
  priorityScore: 80,
  estimatedHours: 4,
  deadline: '2026-07-10',
  ...overrides,
});

// ─── classifyEstimate ─────────────────────────────────────────────────────────

test('classifyEstimate: 0.5 → VALID', () => {
  expect(classifyEstimate(0.5)).toBe('VALID');
});

test('classifyEstimate: 100 → VALID', () => {
  expect(classifyEstimate(100)).toBe('VALID');
});

test('classifyEstimate: 150 → REVIEW_REQUIRED', () => {
  expect(classifyEstimate(150)).toBe('REVIEW_REQUIRED');
});

test('classifyEstimate: 500 → REVIEW_REQUIRED', () => {
  expect(classifyEstimate(500)).toBe('REVIEW_REQUIRED');
});

test('classifyEstimate: 501 → INVALID_ESTIMATE', () => {
  expect(classifyEstimate(501)).toBe('INVALID_ESTIMATE');
});

test('classifyEstimate: 0 → INVALID_ESTIMATE', () => {
  expect(classifyEstimate(0)).toBe('INVALID_ESTIMATE');
});

test('classifyEstimate: NaN → INVALID_ESTIMATE', () => {
  expect(classifyEstimate(NaN)).toBe('INVALID_ESTIMATE');
});

// ─── isValidEstimatedHours (back-compat) ──────────────────────────────────────

test('isValidEstimatedHours: accepts 0.5', () => {
  expect(isValidEstimatedHours(0.5)).toBe(true);
});

test('isValidEstimatedHours: accepts 100', () => {
  expect(isValidEstimatedHours(100)).toBe(true);
});

test('isValidEstimatedHours: rejects 0', () => {
  expect(isValidEstimatedHours(0)).toBe(false);
});

test('isValidEstimatedHours: rejects 700', () => {
  expect(isValidEstimatedHours(700)).toBe(false);
});

// ─── daysUntilDeadline ────────────────────────────────────────────────────────

test('daysUntilDeadline: same day returns 1', () => {
  expect(daysUntilDeadline('2026-06-23', '2026-06-23')).toBe(1);
});

test('daysUntilDeadline: deadline tomorrow returns 2', () => {
  expect(daysUntilDeadline('2026-06-23', '2026-06-24')).toBe(2);
});

// ─── 1. Task fits before deadline → SCHEDULED ────────────────────────────────

test('task that fits before deadline is SCHEDULED', () => {
  const task = makeTask({ estimatedHours: 4, deadline: '2026-07-10' });
  const { taskStatuses, blocks } = generateSchedule([task], avail, opts);

  expect(taskStatuses[0].scheduleStatus).toBe('SCHEDULED');
  expect(taskStatuses[0].feasible).toBe(true);
  expect(taskStatuses[0].reviewRequired).toBe(false);
  expect(blocks.length).toBeGreaterThan(0);
  expect(blocks[0].date).toBe(TODAY);
});

// ─── 2. Task exceeds deadline capacity → OVERDUE_RISK ────────────────────────

test('task that exceeds deadline capacity is OVERDUE_RISK', () => {
  // deadline tomorrow = 2 days × 6h = 12h available; task needs 20h
  const task = makeTask({ estimatedHours: 20, deadline: '2026-06-24' });
  const { taskStatuses, summary, blocks } = generateSchedule([task], avail, opts);

  expect(taskStatuses[0].scheduleStatus).toBe('OVERDUE_RISK');
  expect(taskStatuses[0].feasible).toBe(false);
  expect(taskStatuses[0].deficitHours).toBe(8); // 20 - 12
  expect(summary.overdueRiskTasks).toBe(1);

  // Schedules as many hours as possible before deadline
  const totalScheduled = blocks.reduce((s, b) => s + b.durationHours, 0);
  expect(totalScheduled).toBe(12);
});

// ─── 3. REVIEW_REQUIRED: estimatedHours = 150 ────────────────────────────────

test('task with estimatedHours=150 is REVIEW_REQUIRED and still scheduled', () => {
  const task = makeTask({ estimatedHours: 150, deadline: '2030-01-01' });
  const { taskStatuses, summary, blocks } = generateSchedule([task], avail, opts);

  expect(taskStatuses[0].scheduleStatus).toBe('REVIEW_REQUIRED');
  expect(taskStatuses[0].reviewRequired).toBe(true);
  expect(taskStatuses[0].reviewReason).toBe('High effort estimate');
  expect(summary.reviewRequiredTasks).toBe(1);
  // Blocks must exist — task should still be scheduled
  expect(blocks.length).toBeGreaterThan(0);
});

// ─── 4. INVALID_ESTIMATE: estimatedHours > 500 ───────────────────────────────

test('task with estimatedHours=5000 is INVALID_ESTIMATE, no blocks', () => {
  const task = makeTask({ estimatedHours: 5000 });
  const { taskStatuses, summary, blocks } = generateSchedule([task], avail, opts);

  expect(taskStatuses[0].scheduleStatus).toBe('INVALID_ESTIMATE');
  expect(summary.invalidTasks).toBe(1);
  expect(blocks.length).toBe(0);
});

// ─── 5. Multi-day split ───────────────────────────────────────────────────────

test('task needing more than one daily window is split across days', () => {
  const task = makeTask({ estimatedHours: 10, deadline: '2026-07-10' });
  const { blocks } = generateSchedule([task], avail, opts);

  const dates = [...new Set(blocks.map((b) => b.date))];
  expect(dates.length).toBe(2);
  const totalHours = blocks.reduce((s, b) => s + b.durationHours, 0);
  expect(totalHours).toBe(10);
});

// ─── 6. Priority ordering ────────────────────────────────────────────────────

test('higher priority task is scheduled before lower priority task', () => {
  const low = makeTask({ taskId: 'low', priorityScore: 30, estimatedHours: 3, deadline: '2026-07-10' });
  const high = makeTask({ taskId: 'high', priorityScore: 90, estimatedHours: 3, deadline: '2026-07-10' });

  const { blocks } = generateSchedule([low, high], avail, opts);
  expect(blocks[0].taskId).toBe('high');
});

// ─── 7. No overlap between tasks on the same day ─────────────────────────────

test('no two blocks overlap on the same day', () => {
  const t1 = makeTask({ taskId: 't1', priorityScore: 90, estimatedHours: 3, deadline: '2026-07-10' });
  const t2 = makeTask({ taskId: 't2', priorityScore: 80, estimatedHours: 3, deadline: '2026-07-10' });

  const { blocks } = generateSchedule([t1, t2], avail, opts);

  const byDate = {};
  for (const block of blocks) {
    (byDate[block.date] = byDate[block.date] || []).push(block);
  }

  for (const dayBlocks of Object.values(byDate)) {
    dayBlocks.sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 0; i < dayBlocks.length - 1; i++) {
      expect(dayBlocks[i].endTime <= dayBlocks[i + 1].startTime).toBe(true);
    }
  }
});

// ─── 8. Blocks never exceed deadline date ────────────────────────────────────

test('no block date exceeds task deadline', () => {
  const deadline = '2026-07-10';
  const task = makeTask({ estimatedHours: 30, deadline });
  const { blocks } = generateSchedule([task], avail, opts);

  for (const block of blocks) {
    expect(block.date <= deadline).toBe(true);
  }
});

// ─── 9. Every task appears in taskStatuses ───────────────────────────────────

test('every input task appears in taskStatuses', () => {
  const tasks = [
    makeTask({ taskId: 'a', estimatedHours: 4, deadline: '2026-07-10' }),
    makeTask({ taskId: 'b', estimatedHours: 150, deadline: '2030-01-01' }),   // REVIEW_REQUIRED
    makeTask({ taskId: 'c', estimatedHours: 5000 }),                           // INVALID_ESTIMATE
    makeTask({ taskId: 'd', estimatedHours: 20, deadline: '2026-06-23' }),     // OVERDUE_RISK
  ];

  const { taskStatuses } = generateSchedule(tasks, avail, opts);

  const ids = taskStatuses.map((s) => s.taskId);
  expect(ids).toContain('a');
  expect(ids).toContain('b');
  expect(ids).toContain('c');
  expect(ids).toContain('d');
  expect(taskStatuses).toHaveLength(tasks.length);
});

// ─── 10. Summary reviewRequiredTasks count ───────────────────────────────────

test('summary.reviewRequiredTasks counts REVIEW_REQUIRED tasks', () => {
  const tasks = [
    makeTask({ taskId: 'r1', estimatedHours: 150, deadline: '2030-01-01' }),
    makeTask({ taskId: 'r2', estimatedHours: 200, deadline: '2030-01-01' }),
    makeTask({ taskId: 'ok', estimatedHours: 5, deadline: '2030-01-01' }),
  ];

  const { summary } = generateSchedule(tasks, avail, opts);
  expect(summary.reviewRequiredTasks).toBe(2);
});

// ─── 11. reviewRequiredTasks counted even when task is also OVERDUE_RISK ──────

test('REVIEW_REQUIRED + OVERDUE_RISK increments both counters', () => {
  // 150h estimate (REVIEW_REQUIRED tier), deadline tomorrow → not enough capacity
  const task = makeTask({ estimatedHours: 150, deadline: '2026-06-24' });
  const { taskStatuses, summary } = generateSchedule([task], avail, opts);

  expect(taskStatuses[0].reviewRequired).toBe(true);
  expect(taskStatuses[0].scheduleStatus).toBe('OVERDUE_RISK');
  expect(summary.overdueRiskTasks).toBe(1);
  expect(summary.reviewRequiredTasks).toBe(1); // must not be 0
});

// ─── 12. reviewRequiredTasks === 1 for a single 150h task ────────────────────

test('single REVIEW_REQUIRED task yields summary.reviewRequiredTasks === 1', () => {
  const task = makeTask({ estimatedHours: 150, deadline: '2030-01-01' });
  const { summary } = generateSchedule([task], avail, opts);

  expect(summary.reviewRequiredTasks).toBe(1);
});

// ─── 13. Summary totals match block data ─────────────────────────────────────

test('summary totals match block data', () => {
  const t1 = makeTask({ taskId: 't1', estimatedHours: 4, deadline: '2026-07-10' });
  const t2 = makeTask({ taskId: 't2', estimatedHours: 5000 }); // invalid

  const { blocks, summary } = generateSchedule([t1, t2], avail, opts);

  const blockTotal = blocks.reduce((s, b) => s + b.durationHours, 0);
  expect(summary.totalScheduledHours).toBe(Math.round(blockTotal * 100) / 100);
  expect(summary.invalidTasks).toBe(1);
});
