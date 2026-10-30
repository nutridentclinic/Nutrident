const Notification = require('../models/Notification');
const User = require('../models/User');
const logger = require('../utils/logger');
const { messaging, isConfigured } = require('../config/firebase');
const { sendEmail } = require('../config/email');

function resolveNotificationLink(type, relatedId, role = 'receptionist') {
  const defaultPath = role === 'patient' ? '/app/notifications' : (role === 'receptionist' ? '/reception/notifications' : `/${role}/notifications`);
  if (!relatedId) {
    return defaultPath;
  }
  const idStr = String(relatedId);
  if (role === 'receptionist') {
    if (type.startsWith('appointment_') || type === 'new_booking' || type === 'patient_checked_in') {
      return `/reception/appointments?open=${idStr}`;
    }
    if (type.startsWith('payment_') || type.startsWith('invoice_')) {
      return `/reception/invoices?open=${idStr}`;
    }
    if (type === 'queue_update') {
      return '/reception/queue';
    }
    if (type === 'new_patient_registered') {
      return `/reception/patients/${idStr}`;
    }
    return '/reception/notifications';
  }
  if (role === 'dentist') {
    if (type.startsWith('appointment_') || type === 'new_booking') return `/dentist/appointments?open=${idStr}`;
    if (type === 'queue_update' || type === 'patient_checked_in') return '/dentist/queue';
    return '/dentist/notifications';
  }
  if (role === 'admin') {
    if (type.startsWith('appointment_') || type === 'new_booking') return `/admin/appointments?open=${idStr}`;
    if (type.startsWith('payment_') || type.startsWith('invoice_')) return `/admin/payments?open=${idStr}`;
    return '/admin/notifications';
  }
  if (type.startsWith('appointment_') || type === 'new_booking') return `/app/appointments?open=${idStr}`;
  if (type.startsWith('payment_') || type.startsWith('invoice_')) return `/app/billing?open=${idStr}`;
  if (type === 'queue_update') return '/app';
  return '/app/notifications';
}

const createInApp = async ({ userId, title, message, type, relatedId = null, link = null }) => {
  return Notification.create({ user: userId, title, message, type, relatedId, link });
};

const sendPush = async ({ fcmToken, title, message, url = null }) => {
  if (!isConfigured() || !fcmToken) return null;
  try {
    const payload = {
      token: fcmToken,
      notification: { title, body: message },
    };
    if (url) {
      payload.data = { url };
      payload.webpush = { fcmOptions: { link: url } };
    }
    return await messaging().send(payload);
  } catch (err) {
    logger.error(`FCM push failed: ${err.message}`);
    return null;
  }
};

const notify = async ({ userId, title, message, type, relatedId = null, link = null, skipEmail = false }) => {
  let resolvedLink = link;
  const user = await User.findById(userId).select('email name role fcmToken notificationPreferences');
  if (user && !resolvedLink) {
    resolvedLink = resolveNotificationLink(type, relatedId, user.role);
  }

  const inApp = await createInApp({ userId, title, message, type, relatedId, link: resolvedLink });

  if (!user) return inApp;

  // 1. Firebase push
  if (isConfigured() && user.fcmToken && user.notificationPreferences?.push !== false) {
    sendPush({ fcmToken: user.fcmToken, title, message, url: resolvedLink });
  }

  // 2. Email notification (skip if caller handles dedicated transactional email)
  if (!skipEmail && process.env.BREVO_API_KEY && user.email && user.notificationPreferences?.email !== false) {
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

  return inApp;
};

const notifyUser = async (userId, payload) => {
  return notify({ userId, ...payload });
};

const notifyRoles = async (roles, payload) => {
  const roleList = Array.isArray(roles) ? roles : [roles];
  const users = await User.find({ role: { $in: roleList } }).select('_id role');
  return Promise.all(
    users.map((u) => {
      const link = payload.link || resolveNotificationLink(payload.type, payload.relatedId, u.role);
      return notify({ userId: u._id, ...payload, link });
    })
  );
};

module.exports = { notify, sendPush, notifyUser, notifyRoles, resolveNotificationLink };
