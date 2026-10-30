
const cron = require('node-cron');
const Appointment = require('../models/Appointment');
const Dentist = require('../models/Dentist');
const ClinicSettings = require('../models/ClinicSettings');
const { notify } = require('../services/notification.service');
const logger = require('../utils/logger');
const getPendingExpiry = require('../utils/pendingExpiry');
const { toClinicDate } = require('../utils/appointmentAccess');

// Process appointment reminders
const processDueReminders = async (now = new Date()) => {
  const settings =
    (await ClinicSettings.findById('default')) ||
    { reminderHoursBefore: 24 };

  const reminderHours = Number(settings.reminderHoursBefore) || 24;
  const nowMs = now.getTime();
  const windowEndMs = nowMs + reminderHours * 60 * 60 * 1000;

  const searchStart = new Date(nowMs - 24 * 60 * 60 * 1000);
  const searchEnd = new Date(
    nowMs + (reminderHours + 48) * 60 * 60 * 1000
  );

  const candidateAppointments = await Appointment.find({
    status: 'confirmed',
    reminderSent: false,
    date: { $gte: searchStart, $lte: searchEnd },
  });

  const dueAppointments = [];

  for (const appt of candidateAppointments) {
    if (!appt.startTime) continue;

    try {
      const apptStartMs = toClinicDate(
        appt.date,
        appt.startTime
      ).getTime();

      if (apptStartMs >= nowMs && apptStartMs <= windowEndMs) {
        dueAppointments.push(appt);
      }
    } catch (err) {
      logger.error(
        `Error calculating appointment start date for ${appt._id}: ${err.message}`
      );
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

// Process review reminders
// IMPORTANT: Declared outside startReminderJob so it can be exported.
const processReviewReminders = async (now = new Date()) => {
  const nowMs = now.getTime();

  const twoDaysAgo = new Date(nowMs - 48 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(nowMs - 72 * 60 * 60 * 1000);

  const completedAppts = await Appointment.find({
    status: 'completed',
    reviewReminderSent: false,
    $or: [
      { completedAt: { $gte: threeDaysAgo, $lte: twoDaysAgo } },
      { date: { $gte: threeDaysAgo, $lte: twoDaysAgo } },
    ],
  })
    .populate('patient', 'name email')
    .populate({
      path: 'dentist',
      populate: { path: 'user', select: 'name' },
    });

  const Review = require('../models/Review');
  const { sendTransactionalEmail } = require('../services/email.service');

  const clientUrl =
    process.env.CLIENT_URL || 'http://localhost:5173';

  for (const appt of completedAppts) {
    const existing = await Review.findOne({
      appointment: appt._id,
    });

    if (!existing) {
      const doctorName =
        appt.dentist?.user?.name ||
        appt.dentist?.name ||
        'Your Doctor';

      if (appt.patient?.email) {
        await sendTransactionalEmail({
          to: appt.patient.email,
          template: 'reviewRequest',
          data: {
            patientName: appt.patient.name,
            doctorName,
            reviewUrl: `${clientUrl}/app/appointments?review=${appt._id}`,
          },
          relatedId: appt._id,
        }).catch((err) =>
          logger.error(
            `Review reminder email failed: ${err.message}`
          )
        );
      }

      if (appt.patient?._id || appt.patient) {
        await notify({
          userId: appt.patient._id || appt.patient,
          title: 'How was your dental visit?',
          message: `Please rate your consultation with Dr. ${doctorName}.`,
          type: 'appointment_completed',
          relatedId: appt._id,
          link: `/app/appointments?review=${appt._id}`,
        });
      }
    }

    appt.reviewReminderSent = true;
    await appt.save();
  }

  return completedAppts;
};

// Start all scheduled jobs
const startReminderJob = () => {

  // Check expired slot holds, pending appointments and resume dentists every minute
  cron.schedule('* * * * *', async () => {
    try {
      const SlotHold = require('../models/SlotHold');
      const expiredHolds = await SlotHold.deleteMany({ expiresAt: { $lt: new Date() } });
      if (expiredHolds.deletedCount) {
        logger.info(`Cleaned up ${expiredHolds.deletedCount} expired slot hold(s).`);
      }

      const { filter, update } = getPendingExpiry();

      const result = await Appointment.updateMany(filter, update);

      if (result.modifiedCount) {
        logger.info(
          `Expired ${result.modifiedCount} unpaid appointment(s).`
        );
      }

      const now = new Date();

      const resumed = await Dentist.updateMany(
        {
          isActive: false,
          pausedUntil: { $ne: null, $lte: now },
        },
        {
          $set: {
            isActive: true,
            pausedReason: '',
            pausedUntil: null,
          },
        }
      );

      if (resumed.modifiedCount) {
        logger.info(
          `Auto-resumed ${resumed.modifiedCount} dentist(s) past pausedUntil.`
        );
      }
    } catch (err) {
      logger.error(
        `Pending appointment expiry or auto-resume job failed: ${err.message}`
      );
    }
  });

  // Process review reminders every hour
  cron.schedule('0 * * * *', async () => {
    try {
      await processReviewReminders();
    } catch (err) {
      logger.error(
        `Review reminder job failed: ${err.message}`
      );
    }
  });

  // Process appointment reminders every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    try {
      const dueAppointments = await processDueReminders();

      if (dueAppointments.length) {
        logger.info(
          `Sent ${dueAppointments.length} appointment reminder(s).`
        );
      }
    } catch (err) {
      logger.error(`Reminder job failed: ${err.message}`);
    }
  });
};

// Exports
module.exports = startReminderJob;
module.exports.processDueReminders = processDueReminders;
module.exports.processReviewReminders = processReviewReminders;