/**
 * Schedule Service — Firestore I/O for schedule blocks.
 * Delegates all scheduling logic to scheduler.service.js.
 */

const { FieldValue } = require('firebase-admin/firestore');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/firebase');
const logger = require('../config/logger');
const AppError = require('../utils/AppError');
const firestoreService = require('./firestore.service');
const { generateSchedule } = require('./scheduler.service');

const COLLECTION = 'schedules';

const DEFAULT_START_HOUR = parseInt(process.env.DEFAULT_START_HOUR, 10) || 16;
const DEFAULT_END_HOUR = parseInt(process.env.DEFAULT_END_HOUR, 10) || 22;

/**
 * Deletes all documents in the schedules collection in batches of 500.
 */
const clearSchedules = async () => {
  const snapshot = await db.collection(COLLECTION).get();
  if (snapshot.empty) return;

  for (let i = 0; i < snapshot.docs.length; i += 500) {
    const batch = db.batch();
    snapshot.docs.slice(i, i + 500).forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
};

/**
 * Fetches tasks, generates a schedule, purges previous data, persists new blocks.
 * @param {{ startHour?: number, endHour?: number }} options
 * @param {string} requestId
 * @returns {Promise<{ schedule: object[], summary: object, taskStatuses: object[] }>}
 */
const generateAndSaveSchedule = async ({ startHour, endHour } = {}, requestId) => {
  logger.info('Schedule generation started', { requestId });

  const tasks = await firestoreService.getAllTasks();
  logger.info('Tasks loaded', { requestId, count: tasks.length });

  if (!tasks.length) {
    throw new AppError('No tasks found', 404);
  }

  const availability = {
    startHour: startHour ?? DEFAULT_START_HOUR,
    endHour: endHour ?? DEFAULT_END_HOUR,
  };

  const { blocks, summary, taskStatuses } = generateSchedule(tasks, availability);
  logger.info('Schedule generated', { requestId, blocks: blocks.length, summary });

  // Purge previous schedule before writing new one
  await clearSchedules();

  const generationId = uuidv4();
  // Capture ISO string for response serialization; use FieldValue sentinel for Firestore storage
  const generatedAtISO = new Date().toISOString();
  const generatedAtSentinel = FieldValue.serverTimestamp();

  const savedBlocks = [];

  for (let i = 0; i < blocks.length; i += 500) {
    const chunk = blocks.slice(i, i + 500);
    const batch = db.batch();

    for (const block of chunk) {
      const docRef = db.collection(COLLECTION).doc();
      // Stored in Firestore with server timestamp
      batch.set(docRef, {
        ...block,
        scheduleId: docRef.id,
        generationId,
        generatedAt: generatedAtSentinel,
        createdAt: generatedAtSentinel,
      });
      // Returned to API caller with serializable ISO string
      savedBlocks.push({
        ...block,
        scheduleId: docRef.id,
        generationId,
        generatedAt: generatedAtISO,
        createdAt: generatedAtISO,
      });
    }

    await batch.commit();
  }

  logger.info('Schedule saved', { requestId, generationId, blocks: savedBlocks.length });

  return { schedule: savedBlocks, summary, taskStatuses };
};

/**
 * Returns all schedule blocks ordered by date ASC, startTime ASC.
 * @returns {Promise<object[]>}
 */
const getAllSchedules = async () => {
  const snapshot = await db
    .collection(COLLECTION)
    .orderBy('date', 'asc')
    .orderBy('startTime', 'asc')
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      scheduleId: doc.id,
      // Firestore Timestamps → ISO strings for JSON serialization
      generatedAt: data.generatedAt?.toDate?.()?.toISOString() ?? data.generatedAt ?? null,
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? data.createdAt ?? null,
    };
  });
};

/**
 * Returns schedule blocks for a specific task.
 * @param {string} taskId
 * @returns {Promise<object[]>}
 */
const getScheduleByTask = async (taskId) => {
  const snapshot = await db
    .collection(COLLECTION)
    .where('taskId', '==', taskId)
    .orderBy('date', 'asc')
    .orderBy('startTime', 'asc')
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      scheduleId: doc.id,
      generatedAt: data.generatedAt?.toDate?.()?.toISOString() ?? data.generatedAt ?? null,
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? data.createdAt ?? null,
    };
  });
};

module.exports = { generateAndSaveSchedule, getAllSchedules, getScheduleByTask, clearSchedules };
