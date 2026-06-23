const admin = require('firebase-admin');
const path = require('path');

// Singleton guard — only initialize once
if (!admin.apps.length) {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (!serviceAccountPath) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_PATH environment variable is not set');
  }

  const serviceAccount = require(path.resolve(serviceAccountPath));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

module.exports = db;
