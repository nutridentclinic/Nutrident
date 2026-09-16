const admin = require('firebase-admin');
const logger = require('../utils/logger');

// Uses a Firebase service account (Project Settings -> Service Accounts -> Generate new private key).
// Put the three values from that JSON file into .env as shown in .env.example.
// NOTE: FIREBASE_PRIVATE_KEY in .env must have its real newlines escaped as \n - we un-escape them below.
let firebaseApp = null;

const isConfigured = () =>
  !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);

if (isConfigured()) {
  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
  logger.info('Firebase Admin SDK initialized (push notifications + phone auth verification active).');
} else {
  logger.warn('Firebase env vars not set - push notifications and phone verification are disabled.');
}

module.exports = { admin, firebaseApp, isConfigured };