const Notification = require('../models/Notification');
const User = require('../models/User');
const logger = require('../utils/logger');
const { messaging, isConfigured } = require('../config/firebase');

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
    return await messaging().send({
      token: fcmToken,
      notification: { title, body: message },
    });
  } catch (err) {
    logger.error(`FCM push failed: ${err.message}`);
    return null;
  }
};

const { sendEmail } = require('../config/email');

/**
 * Main entry point used by controllers/services throughout the app.
 * Always creates the in-app record; also sends a Firebase push and Brevo email
 * if configured and enabled in user preferences.
 */
const notify = async ({ userId, title, message, type, relatedId = null }) => {
  const inApp = await createInApp({ userId, title, message, type, relatedId });

  // Fire and forget - don't block the main request on notification delivery
  User.findById(userId)
    .select('email name fcmToken notificationPreferences')
    .then(async (user) => {
      if (!user) return;

      // 1. Firebase push
      if (isConfigured() && user.fcmToken && user.notificationPreferences?.push !== false) {
        sendPush({ fcmToken: user.fcmToken, title, message });
      }

      // 2. Email notification (via Brevo)
      if (process.env.BREVO_API_KEY && user.email && user.notificationPreferences?.email !== false) {
        try {
          await sendEmail({
            to: user.email,
            subject: title,
            html: `<div style="font-family:sans-serif;line-height:1.5;"><h3>${title}</h3><p>${message}</p></div>`,
            text: `${title}\n\n${message}`,
          });
        } catch (emailErr) {
          logger.info(`Email sending failed or unconfigured: ${emailErr.message}`);
        }
      }
    })
    .catch((e) => logger.error(`Notification delivery error: ${e.message}`));

  return inApp;
};

module.exports = { notify, sendPush };