const { FieldValue } = require('firebase-admin/firestore');
const db = require('../config/firebase');
const logger = require('../config/logger');

/**
 * Persists a task document to Firestore.
 * Uses Firestore auto-ID as the taskId.
 * @param {object} taskData
 * @param {string} [requestId]
 * @returns {Promise<object>} Saved task with taskId
 */
const saveTask = async (taskData, requestId) => {
  const docRef = db.collection('tasks').doc();
  const taskId = docRef.id;

  logger.info('Firestore write start', { requestId, taskId });

  const doc = {
    ...taskData,
    taskId,
    status: 'PENDING',
    createdAt: FieldValue.serverTimestamp(),
  };

  await docRef.set(doc);

  logger.info('Firestore write success', { requestId, taskId });

  return { ...doc, taskId };
};

/**
 * Retrieves all tasks ordered by createdAt descending.
 * @returns {Promise<object[]>}
 */
const getAllTasks = async () => {
  const snapshot = await db.collection('tasks').orderBy('createdAt', 'desc').get();

  return snapshot.docs.map((doc) => ({
    ...doc.data(),
    taskId: doc.id,
  }));
};

/**
 * Updates an existing task document with the given fields.
 * Always sets updatedAt to the current server timestamp.
 * @param {string} taskId
 * @param {object} fields
 * @param {string} [requestId]
 * @returns {Promise<object>} Updated fields with taskId
 */
const updateTask = async (taskId, fields, requestId) => {
  logger.info('Firestore update start', { requestId, taskId });

  await db.collection('tasks').doc(taskId).update({
    ...fields,
    updatedAt: FieldValue.serverTimestamp(),
  });

  logger.info('Firestore update success', { requestId, taskId });

  return { ...fields, taskId };
};

/**
 * Retrieves up to `limit` recently completed tasks for a given category,
 * ordered by createdAt descending.
 * @param {string} category
 * @param {number} limit
 * @returns {Promise<object[]>}
 */
const getRecentCompletedByCategory = async (category, limit) => {
  const snapshot = await db
    .collection('tasks')
    .where('status', '==', 'COMPLETED')
    .where('category', '==', category)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => ({
    ...doc.data(),
    taskId: doc.id,
  }));
};

/**
 * Stores the actual hours spent on a task after completion.
 * @param {string} taskId
 * @param {number} actualHours
 * @param {string} [requestId]
 * @returns {Promise<void>}
 */
const saveActualHours = async (taskId, actualHours, requestId) => {
  logger.info('Firestore saveActualHours start', { requestId, taskId, actualHours });

  await db.collection('tasks').doc(taskId).update({
    actualHours,
    updatedAt: FieldValue.serverTimestamp(),
  });

  logger.info('Firestore saveActualHours success', { requestId, taskId });
};

module.exports = { saveTask, getAllTasks, updateTask, getRecentCompletedByCategory, saveActualHours };
