/**
 * Schedule Service — Firestore I/O for schedule blocks.
 * Delegates all scheduling logic to scheduler.service.js.
 */

const { FieldValue } = require("firebase-admin/firestore");
const { v4: uuidv4 } = require("uuid");
const db = require("../config/firebase");
const logger = require("../config/logger");
const AppError = require("../utils/AppError");
const firestoreService = require("./firestore.service");
const { generateSchedule } = require("./scheduler.service");

const COLLECTION = "schedules";
const META_COLLECTION = "schedule_meta";
const META_DOC_ID = "latest";

const DEFAULT_START_HOUR = parseInt(process.env.DEFAULT_START_HOUR, 10) || 16;
const DEFAULT_END_HOUR = parseInt(process.env.DEFAULT_END_HOUR, 10) || 22;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Converts a Firestore Timestamp field to an ISO string, passthrough if already string. */
const toISO = (val) => val?.toDate?.()?.toISOString() ?? val ?? null;

/** Serializes a schedule block for JSON response. */
const serializeBlock = (data, id) => ({
  ...data,
  scheduleId: id,
  generatedAt: toISO(data.generatedAt),
  createdAt: toISO(data.createdAt),
});

/**
 * Empty summary returned when no schedule has been generated yet.
 */
const emptySummary = () => ({
  totalScheduledHours: 0,
  overdueRiskTasks: 0,
  unscheduledTasks: 0,
  invalidTasks: 0,
  reviewRequiredTasks: 0,
});

// ─── Clear ────────────────────────────────────────────────────────────────────

const clearSchedules = async () => {
  const snapshot = await db.collection(COLLECTION).get();
  if (!snapshot.empty) {
    for (let i = 0; i < snapshot.docs.length; i += 500) {
      const batch = db.batch();
      snapshot.docs.slice(i, i + 500).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  }
};

// ─── Generate & Save ──────────────────────────────────────────────────────────

/**
 * Fetches tasks, generates schedule, purges old data, persists new blocks + metadata.
 * @param {{ startHour?: number, endHour?: number }} options
 * @param {string} requestId
 * @returns {Promise<{ schedule: object[], summary: object, taskStatuses: object[] }>}
 */
const generateAndSaveSchedule = async (
  { startHour, endHour } = {},
  requestId,
) => {
  logger.info("Schedule generation started", { requestId });

  const tasks = await firestoreService.getAllTasks();
  logger.info("Tasks loaded", { requestId, count: tasks.length });

  if (!tasks.length) {
    throw new AppError("No tasks found", 404);
  }

  const availability = {
    startHour: startHour ?? DEFAULT_START_HOUR,
    endHour: endHour ?? DEFAULT_END_HOUR,
  };

  const { blocks, summary, taskStatuses } = generateSchedule(
    tasks,
    availability,
  );
  logger.info("Schedule generated", {
    requestId,
    blocks: blocks.length,
    summary,
  });

  await clearSchedules();

  const generationId = uuidv4();
  const generatedAtISO = new Date().toISOString();
  const generatedAtSentinel = FieldValue.serverTimestamp();

  // Persist schedule blocks
  const savedBlocks = [];
  for (let i = 0; i < blocks.length; i += 500) {
    const chunk = blocks.slice(i, i + 500);
    const batch = db.batch();
    for (const block of chunk) {
      const docRef = db.collection(COLLECTION).doc();
      batch.set(docRef, {
        ...block,
        scheduleId: docRef.id,
        generationId,
        generatedAt: generatedAtSentinel,
        createdAt: generatedAtSentinel,
      });
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

  // Persist summary + taskStatuses in a single metadata document
  await db.collection(META_COLLECTION).doc(META_DOC_ID).set({
    summary,
    taskStatuses,
    generationId,
    generatedAt: generatedAtSentinel,
  });

  logger.info("Schedule saved", {
    requestId,
    generationId,
    blocks: savedBlocks.length,
  });

  return { schedule: savedBlocks, summary, taskStatuses };
};

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Returns all schedule blocks + summary + taskStatuses.
 * summary/taskStatuses come from the stored metadata document.
 */
const getAllSchedules = async () => {
  const [snapshot, metaDoc] = await Promise.all([
    db
      .collection(COLLECTION)
      .orderBy("date", "asc")
      .orderBy("startTime", "asc")
      .get(),
    db.collection(META_COLLECTION).doc(META_DOC_ID).get(),
  ]);

  const schedule = snapshot.docs.map((doc) =>
    serializeBlock(doc.data(), doc.id),
  );
  const meta = metaDoc.exists ? metaDoc.data() : {};

  return {
    schedule,
    summary: meta.summary ?? emptySummary(),
    taskStatuses: meta.taskStatuses ?? [],
  };
};

/**
 * Returns schedule blocks for a specific task + the stored metadata.
 */
const getScheduleByTask = async (taskId) => {
  const [snapshot, metaDoc] = await Promise.all([
    db
      .collection(COLLECTION)
      .where("taskId", "==", taskId)
      .orderBy("date", "asc")
      .orderBy("startTime", "asc")
      .get(),
    db.collection(META_COLLECTION).doc(META_DOC_ID).get(),
  ]);

  const schedule = snapshot.docs.map((doc) =>
    serializeBlock(doc.data(), doc.id),
  );
  const meta = metaDoc.exists ? metaDoc.data() : {};

  // Filter taskStatuses to only the requested task
  const allStatuses = meta.taskStatuses ?? [];
  const taskStatuses = allStatuses.filter((s) => s.taskId === taskId);

  return {
    schedule,
    summary: meta.summary ?? emptySummary(),
    taskStatuses,
  };
};

module.exports = {
  generateAndSaveSchedule,
  getAllSchedules,
  getScheduleByTask,
  clearSchedules,
};
