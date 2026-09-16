const Notification = require('../models/Notification');
const logger = require('../utils/logger');

/**
 * Central notification service.
 *
 * Currently active channel: IN-APP (saved to DB, fetched via /api/notifications).
 * This is enough for the dentist web panel and can be polled or shown via Socket.IO.
 *
 * NOT YET ACTIVE (stubbed on purpose - see chat before enabling):
 *  - sendPush()  -> requires Firebase Admin SDK + FCM token per user
 *  - sendSMS()   -> requires an SMS gateway (Twilio / MSG91 / etc.)
 * Both stubs log a warning instead of throwing, so the app keeps working
 * even before those providers are configured.
 */

const createInApp = async ({ userId, title, message, type, relatedId = null }) => {
  const notification = await Notification.create({
    user: userId,
    title,
    message,
    type,
    relatedId,
  });
  return notification;
};

const sendPush = async ({ fcmToken, title, message }) => {
  if (!process.env.FIREBASE_PROJECT_ID) {
    logger.warn('sendPush() called but Firebase is not configured yet - skipping push notification.');
    return null;
  }
  // Once Firebase Admin SDK is added:
  // const admin = require('../config/firebase');
  // return admin.messaging().send({ token: fcmToken, notification: { title, body: message } });
};

const sendSMS = async ({ phone, message }) => {
  if (!process.env.SMS_PROVIDER_API_KEY) {
    logger.warn('sendSMS() called but no SMS provider is configured yet - skipping SMS.');
    return null;
  }
  // Once an SMS provider is added, call its API here.
};

/**
 * Main entry point used by controllers/services throughout the app.
 * Always creates the in-app record; push/SMS only fire if configured.
 */
const notify = async ({ userId, title, message, type, relatedId = null, fcmToken = null, phone = null }) => {
  const inApp = await createInApp({ userId, title, message, type, relatedId });

  // Fire and forget - don't block the main request on these
  if (fcmToken) sendPush({ fcmToken, title, message }).catch((e) => logger.error(e.message));
  if (phone) sendSMS({ phone, message }).catch((e) => logger.error(e.message));

  return inApp;
};

module.exports = { notify, sendPush, sendSMS };