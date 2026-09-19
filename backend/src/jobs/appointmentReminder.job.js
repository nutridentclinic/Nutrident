const cron = require('node-cron');
const Appointment = require('../models/Appointment');
const ClinicSettings = require('../models/ClinicSettings');
const { notify } = require('../services/notification.service');
const logger = require('../utils/logger');

// Runs every 30 minutes, sends a reminder for appointments starting
// within the configured reminder window (default 24h) that haven't been reminded yet.
const startReminderJob = () => {
  cron.schedule('*/30 * * * *', async () => {
    try {
      const settings = (await ClinicSettings.findById('default')) || { reminderHoursBefore: 24 };
      const windowStart = new Date();
      const windowEnd = new Date(Date.now() + settings.reminderHoursBefore * 60 * 60 * 1000);

      const dueAppointments = await Appointment.find({
        status: 'confirmed',
        reminderSent: false,
        date: { $gte: windowStart, $lte: windowEnd },
      });

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

      if (dueAppointments.length) logger.info(`Sent ${dueAppointments.length} appointment reminder(s).`);
    } catch (err) {
      logger.error(`Reminder job failed: ${err.message}`);
    }
  });
};




module.exports = startReminderJob;