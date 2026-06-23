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

module.exports = { saveTask, getAllTasks };
