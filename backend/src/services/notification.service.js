const Notification = require('../models/Notification');
const User = require('../models/User');
const logger = require('../utils/logger');
const { admin, isConfigured } = require('../config/firebase');

/**
 * Central notification service.
 *
 * Channels:
 *  - IN-APP (always active) -> saved to DB, fetched via /api/notifications
 *  - PUSH (Firebase Cloud Messaging) -> active once FIREBASE_* env vars are set;
 *    automatically looks up the user's saved fcmToken (set via PUT /api/notifications/fcm-token)
 *  - SMS -> intentionally NOT a separate channel here. OTP-by-SMS and phone verification
 *           are handled by Firebase Phone Authentication client-side (the mobile app talks
 *           to Firebase directly and Google sends the SMS); the backend only verifies the
 *           resulting Firebase ID token via verifyFirebaseIdToken() in auth.controller.js.
 */

const createInApp = async ({ userId, title, message, type, relatedId = null }) => {
  return Notification.create({ user: userId, title, message, type, relatedId });
};

const sendPush = async ({ fcmToken, title, message }) => {
  if (!isConfigured() || !fcmToken) return null;
  try {
    return await admin.messaging().send({
      token: fcmToken,
      notification: { title, body: message },
    });
  } catch (err) {
    logger.error(`FCM push failed: ${err.message}`);
    return null;
  }
};

/**
 * Main entry point used by controllers/services throughout the app.
 * Always creates the in-app record; also sends a Firebase push automatically
 * if the user has a saved device token and Firebase is configured.
 */
const notify = async ({ userId, title, message, type, relatedId = null }) => {
  const inApp = await createInApp({ userId, title, message, type, relatedId });

  // Fire and forget - don't block the main request on this
  if (isConfigured()) {
    User.findById(userId)
      .select('fcmToken notificationPreferences')
      .then((user) => {
        if (user?.fcmToken && user.notificationPreferences?.push !== false) {
          sendPush({ fcmToken: user.fcmToken, title, message });
        }
      })
      .catch((e) => logger.error(e.message));
  }

  return inApp;
};

module.exports = { notify, sendPush };