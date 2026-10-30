const Appointment = require('../models/Appointment');
const Dentist = require('../models/Dentist');
const User = require('../models/User');
const { createInvoiceForAppointment } = require('./invoice.service');
const { notifyUser, notifyRoles } = require('./notification.service');
const { sendTransactionalEmail } = require('./email.service');
const logger = require('../utils/logger');

function getClientUrl(req) {
  const origin = req?.get?.('origin') || req?.headers?.origin;
  if (origin && !origin.includes('localhost:3000') && !origin.includes('localhost:5000')) {
    return origin.replace(/\/$/, '');
  }
  const referer = req?.get?.('referer') || req?.headers?.referer;
  if (referer) {
    try {
      const parsed = new URL(referer);
      if (!parsed.host.includes('localhost:3000') && !parsed.host.includes('localhost:5000')) {
        return parsed.origin;
      }
    } catch (_) {}
  }
  if (process.env.CLIENT_URL && !process.env.CLIENT_URL.includes('localhost:3000')) {
    return process.env.CLIENT_URL.replace(/\/$/, '');
  }
  if (process.env.FRONTEND_URL) {
    return process.env.FRONTEND_URL.replace(/\/$/, '');
  }
  return 'https://nutrident-three.vercel.app';
}

/**
 * Handles the full completion lifecycle when a dentist or receptionist marks a visit done:
 * 1. Sets status = 'completed', completedBy, completedAt
 * 2. Generates auto-invoice if needed
 * 3. Emits real-time socket events
 * 4. Notifies patient in-app and sends transactional email with review link
 * 5. Notifies receptionist of invoice generation
 */
async function processAppointmentCompletion(appointment, completedByRole = 'dentist', req = null) {
  if (appointment.status !== 'completed') {
    appointment.status = 'completed';
    appointment.completedBy = completedByRole;
    appointment.completedAt = new Date();
    await appointment.save();
  } else if (!appointment.completedAt) {
    appointment.completedAt = new Date();
    appointment.completedBy = completedByRole;
    await appointment.save();
  }

  let invoice = null;
  let invoiceError = null;
  try {
    invoice = await createInvoiceForAppointment(appointment);
  } catch (err) {
    invoiceError = err.message;
    logger.error(`Auto-invoice creation error for appointment ${appointment._id}: ${err.message}`);
  }

  try {
    const { getIO } = require('../sockets');
    const io = getIO();
    if (io) {
      if (invoice) io.emit('invoice:created', { invoiceId: invoice._id, appointmentId: appointment._id });
      io.emit('appointment:completed', { appointmentId: appointment._id });
    }
  } catch (socketErr) {
    // Sockets optional
  }

  const clientUrl = getClientUrl(req);
  const reviewUrl = `${clientUrl}/app/appointments?review=${appointment._id}`;

  // In-app notification to patient with direct review link
  await notifyUser(appointment.patient, {
    title: 'Visit Completed',
    message: 'Your appointment has been marked as completed. Please take a moment to leave a review and rate your care.',
    type: 'appointment_completed',
    relatedId: appointment._id,
    link: `/app/appointments?review=${appointment._id}`,
    skipEmail: true, // We send rich branded transactional email below
  });

  // If invoice generated, notify receptionist
  if (invoice) {
    await notifyRoles(['receptionist'], {
      title: 'Invoice Generated',
      message: `Invoice #${invoice.invoiceNumber} generated for completed appointment.`,
      type: 'invoice_ready',
      relatedId: invoice._id,
      link: `/reception/invoices?open=${invoice._id}`,
    });
  }

  // Send rich transactional email to patient with review request
  try {
    const patientUser = await User.findById(appointment.patient);
    const dentistDoc = await Dentist.findById(appointment.dentist).populate('user', 'name');
    const doctorName = dentistDoc?.user?.name || dentistDoc?.name || 'Your Doctor';

    if (patientUser?.email) {
      let formattedDate = appointment.date;
      try {
        const d = new Date(appointment.date);
        if (!isNaN(d.getTime())) {
          formattedDate = d.toLocaleDateString('en-IN', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          });
        }
      } catch (_) {}

      await sendTransactionalEmail({
        to: patientUser.email,
        template: 'appointmentCompleted',
        data: {
          patientName: patientUser.name,
          doctorName,
          date: formattedDate,
          reviewUrl,
          clinicName: 'Nutrident Dental & Diet Clinic',
          clinicPhone: '+91-9420080771',
          clinicAddress: 'Takli Rd, Godavari MIDC, Shankar Nagar, Dwarka, Nashik, Maharashtra 422011',
        },
        relatedId: appointment._id,
      });

      if (invoice) {
        sendTransactionalEmail({
          to: patientUser.email,
          template: 'invoiceReady',
          data: {
            patientName: patientUser.name,
            invoiceNumber: invoice.invoiceNumber,
            amount: invoice.totalAmount,
            date: new Date(invoice.createdAt).toDateString(),
            portalUrl: `${clientUrl}/app/billing?open=${invoice._id}`,
            clinicName: 'Nutrident Dental & Diet Clinic',
            clinicPhone: '+91-9420080771',
          },
          relatedId: invoice._id,
        }).catch((e) => logger.error(`Invoice email send failed: ${e.message}`));
      }
    }
  } catch (emailErr) {
    logger.error(`Error sending completion emails: ${emailErr.message}`);
  }

  return { appointment, invoice, invoiceError };
}

module.exports = {
  processAppointmentCompletion,
  getClientUrl,
};

