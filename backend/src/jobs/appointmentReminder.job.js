const cron = require('node-cron');
const Appointment = require('../models/Appointment');
const Dentist = require('../models/Dentist');
const ClinicSettings = require('../models/ClinicSettings');
const { notify } = require('../services/notification.service');
const logger = require('../utils/logger');
const getPendingExpiry = require('../utils/pendingExpiry');
const { toClinicDate } = require('../utils/appointmentAccess');

const processDueReminders = async (now = new Date()) => {
  const settings = (await ClinicSettings.findById('default')) || { reminderHoursBefore: 24 };
  const reminderHours = Number(settings.reminderHoursBefore) || 24;
  const nowMs = now.getTime();
  const windowEndMs = nowMs + reminderHours * 60 * 60 * 1000;

  // Search candidate appointments around the current date window (from 1 day ago to 2 days ahead)
  const searchStart = new Date(nowMs - 24 * 60 * 60 * 1000);
  const searchEnd = new Date(nowMs + (reminderHours + 48) * 60 * 60 * 1000);

  const candidateAppointments = await Appointment.find({
    status: 'confirmed',
    reminderSent: false,
    date: { $gte: searchStart, $lte: searchEnd },
  });

  const dueAppointments = [];
  for (const appt of candidateAppointments) {
    if (!appt.startTime) continue;
    try {
      const apptStartMs = toClinicDate(appt.date, appt.startTime).getTime();
      // Remind if start time is in the future and within the reminder window
      if (apptStartMs >= nowMs && apptStartMs <= windowEndMs) {
        dueAppointments.push(appt);
      }
    } catch (err) {
      logger.error(`Error calculating appointment start date for ${appt._id}: ${err.message}`);
    }
  }

  for (const appt of dueAppointments) {
    await notify({
      userId: appt.patient,
      title: 'Appointment Reminder',
      message: `Reminder: you have an appointment on ${appt.date.toDateString()} at ${appt.startTime}.`,
      type: 'appointment_reminder',
      relatedId: appt._id,
    });
    appt.reminderSent = true;
    await appt.save();
  }

  return dueAppointments;
};

// Runs every 30 minutes, sends a reminder for appointments starting
// within the configured reminder window (default 24h) that haven't been reminded yet.
const startReminderJob = () => {
  cron.schedule('* * * * *', async () => {
    try {
      const { filter, update } = getPendingExpiry();
      const result = await Appointment.updateMany(filter, update);
      if (result.modifiedCount) logger.info(`Expired ${result.modifiedCount} unpaid appointment(s).`);

      const now = new Date();
      const resumed = await Dentist.updateMany(
        { isActive: false, pausedUntil: { $ne: null, $lte: now } },
        { $set: { isActive: true, pausedReason: '', pausedUntil: null } }
      );
      if (resumed.modifiedCount) logger.info(`Auto-resumed ${resumed.modifiedCount} dentist(s) past pausedUntil.`);
    } catch (err) {
      logger.error(`Pending appointment expiry or auto-resume job failed: ${err.message}`);
    }
  });

  cron.schedule('*/30 * * * *', async () => {
    try {
      const dueAppointments = await processDueReminders();
      if (dueAppointments.length) logger.info(`Sent ${dueAppointments.length} appointment reminder(s).`);
    } catch (err) {
      logger.error(`Reminder job failed: ${err.message}`);
    }
  });
};

module.exports = startReminderJob;
module.exports.processDueReminders = processDueReminders;