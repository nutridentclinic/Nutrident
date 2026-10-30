const Appointment = require('../models/Appointment');
const Dentist = require('../models/Dentist');
const User = require('../models/User');
const ClinicSettings = require('../models/ClinicSettings');
const Payment = require('../models/Payment');
const Invoice = require('../models/Invoice');
const escapeRegex = require('../utils/escapeRegex');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const logger = require('../utils/logger');
const { success } = require('../utils/response');
const { assertSlotIsFree, getAvailableSlots } = require('../services/availability.service');
const { notify, notifyUser, notifyRoles } = require('../services/notification.service');
const { createInvoiceForAppointment } = require('../services/invoice.service');
const { parseDateOnly, dayRange, todayInClinic } = require('../utils/clinicDate');
const { processRefund } = require('../services/payment.service');
const { isAppointmentParticipant } = require('../utils/appointmentAccess');
const { resolvePrimaryDentist } = require('../utils/clinicDentist');
const { computeBookableChecklist } = require('./dentist.controller');

// Wraps Appointment.create() so a race-condition duplicate (caught by the DB's
// partial unique index, not just the application-level assertSlotIsFree check)
// comes back as a clean 409 instead of a raw MongoDB E11000 error.
const createAppointmentSafe = async (data) => {
  try {
    return await Appointment.create(data);
  } catch (err) {
    if (err.code === 11000) {
      throw new AppError('This slot was just booked by someone else. Please choose another slot.', 409);
    }
    throw err;
  }
};

function validateDentistBookability(dentist) {
  const checklist = computeBookableChecklist(dentist);
  if (!checklist.bookable) {
    let code = 'DOCTOR_NOT_BOOKABLE';
    let message = checklist.reasons[0] || 'This doctor is currently not accepting appointments.';

    if (!checklist.checks.verified) {
      code = 'DOCTOR_NOT_VERIFIED';
      message = 'Credentials not verified';
    } else if (!checklist.checks.accepting) {
      code = 'DOCTOR_PAUSED';
      if (dentist.pausedUntil && new Date(dentist.pausedUntil) > new Date()) {
        const dateStr = new Date(dentist.pausedUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        message = dentist.pausedReason
          ? `Appointments paused until ${dateStr}: ${dentist.pausedReason}`
          : `Appointments paused until ${dateStr}`;
      } else {
        message = dentist.pausedReason ? `Appointments paused: ${dentist.pausedReason}` : 'Not accepting new appointments';
      }
    } else if (!checklist.checks.weeklyHoursSet) {
      code = 'NO_AVAILABILITY';
      message = 'Weekly hours not set';
    } else if (!checklist.checks.slotLengthSet) {
      code = 'NO_AVAILABILITY';
      message = 'Slot duration not set';
    } else if (!checklist.checks.feeSet) {
      code = 'NO_AVAILABILITY';
      message = 'Consultation fee not set';
    }

    return new AppError(message, 400, {
      code,
      reasons: checklist.reasons,
      checklist,
    });
  }
  return null;
}

// @route POST /api/appointments  (patient books an appointment)
exports.createAppointment = catchAsync(async (req, res, next) => {
  const { dentistId, date, startTime, mode, reasonForVisit, familyMemberName, payAtClinic, paymentOption } = req.body;

  const dentist = await resolvePrimaryDentist(dentistId);
  const bookableError = validateDentistBookability(dentist);
  if (bookableError) {
    return next(bookableError);
  }

  // Confirm the requested date/time is actually one of the dentist's published, still-open slots
  const publishedSlots = await getAvailableSlots(dentist._id, date);
  if (!publishedSlots.some((s) => s.startTime === startTime)) {
    return next(new AppError('This slot is not available for booking.', 400));
  }

  // Re-validate the slot is still free right before creating
  await assertSlotIsFree(dentist._id, date, startTime);

  const duration = dentist.slotDurationMinutes || 30;
  const [h, m] = startTime.split(':').map(Number);
  const endMinutes = h * 60 + m + duration;
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

  const settings = (await ClinicSettings.findById('default')) || { allowPayAtClinic: true };
  const consultationFee = dentist.consultationFee;

  const isPayAtClinic = Boolean(payAtClinic || paymentOption === 'clinic');
  if (isPayAtClinic && settings.allowPayAtClinic === false) {
    return next(new AppError('Pay at clinic is not currently available.', 400));
  }

  const appointment = await createAppointmentSafe({
    patient: req.user._id,
    familyMemberName: familyMemberName || null,
    dentist: dentist._id,
    clinic: dentist.clinic || null,
    date,
    startTime,
    endTime,
    mode: 'in-clinic',
    reasonForVisit,
    fees: {
      consultationFee,
      platformFee: 0,
      totalAmount: consultationFee,
    },
    status: isPayAtClinic ? 'confirmed' : 'pending',
    paymentStatus: 'pending',
    payAtClinic: Boolean(isPayAtClinic),
  });

  const doctorName = dentist.user?.name ? `Dr. ${dentist.user.name}` : 'the doctor';

  if (isPayAtClinic) {
    await notifyUser(req.user._id, {
      title: 'Appointment Confirmed',
      message: `Your appointment with ${doctorName} on ${date} at ${startTime} has been confirmed. Please settle payment at the clinic reception desk upon arrival.`,
      type: 'appointment_confirmed',
      relatedId: appointment._id,
    });

    if (dentist.user) {
      const dentistUserId = dentist.user._id || dentist.user;
      await notifyUser(dentistUserId, {
        title: 'New Appointment Booking',
        message: `A new appointment has been booked for ${date} at ${startTime} (Pay at clinic).`,
        type: 'new_booking',
        relatedId: appointment._id,
      });
    }

    await notifyRoles(['receptionist'], {
      title: 'New Booking (Pay at clinic)',
      message: `New appointment on ${date} at ${startTime} booked by patient. Payment pending at clinic desk.`,
      type: 'new_booking',
      relatedId: appointment._id,
    });

    return success(res, 201, 'Appointment confirmed with pay-at-clinic.', appointment);
  }

  await notifyUser(req.user._id, {
    title: 'Appointment Requested',
    message: `Your appointment with ${doctorName} on ${date} at ${startTime} is pending payment/confirmation.`,
    type: 'appointment_confirmed',
    relatedId: appointment._id,
  });

  if (dentist.user) {
    const dentistUserId = dentist.user._id || dentist.user;
    await notifyUser(dentistUserId, {
      title: 'New Appointment Booking',
      message: `A new appointment has been booked for ${date} at ${startTime}.`,
      type: 'new_booking',
      relatedId: appointment._id,
    });
  }

  success(res, 201, 'Appointment created. Proceed to payment to confirm.', appointment);
});

// @route POST /api/appointments/staff  (receptionist/admin books a confirmed walk-in or phone appointment)
exports.createStaffAppointment = catchAsync(async (req, res, next) => {
  const { patientId, dentistId, date, startTime, mode, reasonForVisit, familyMemberName } = req.body;

  const patientUser = await User.findOne({ _id: patientId, role: 'patient' });
  if (!patientUser) {
    return next(new AppError('Patient not found.', 404));
  }

  const dentist = await resolvePrimaryDentist(dentistId);
  const bookableError = validateDentistBookability(dentist);
  if (bookableError) {
    return next(bookableError);
  }

  const publishedSlots = await getAvailableSlots(dentist._id, date);
  if (!publishedSlots.some((s) => s.startTime === startTime)) {
    return next(new AppError('This slot is not available for booking.', 400));
  }

  await assertSlotIsFree(dentist._id, date, startTime);

  const duration = dentist.slotDurationMinutes || 30;
  const [h, m] = startTime.split(':').map(Number);
  const endMinutes = h * 60 + m + duration;
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

  const consultationFee = dentist.consultationFee;

  const appointment = await createAppointmentSafe({
    patient: patientId,
    familyMemberName: familyMemberName || null,
    dentist: dentist._id,
    clinic: dentist.clinic || null,
    date,
    startTime,
    endTime,
    mode: 'in-clinic',
    reasonForVisit,
    fees: {
      consultationFee,
      platformFee: 0,
      totalAmount: consultationFee,
    },
    status: 'confirmed',
    paymentStatus: 'pending',
  });

  await notify({
    userId: patientId,
    title: 'Appointment Confirmed',
    message: `Your appointment with Dr. ${dentist.user?.name || dentist.specialization} on ${date} at ${startTime} has been scheduled. Payment will be settled at the clinic.`,
    type: 'appointment_confirmed',
    relatedId: appointment._id,
  });

  if (dentist.user) {
    const dentistUserId = dentist.user._id || dentist.user;
    await notify({
      userId: dentistUserId,
      title: 'New Appointment Scheduled',
      message: `A staff-scheduled appointment for ${date} at ${startTime} has been confirmed.`,
      type: 'appointment_confirmed',
      relatedId: appointment._id,
    });
  }

  success(res, 201, 'Staff appointment created.', appointment);
});

// @route GET /api/appointments/me  (patient's own appointments)
exports.getMyAppointments = catchAsync(async (req, res) => {
  const { status, upcoming, page = 1, limit = 20 } = req.query;
  const filter = { patient: req.user._id };
  if (status) filter.status = status;
  if (upcoming === 'true') {
    const todayStr = todayInClinic();
    filter.date = { $gte: parseDateOnly(todayStr) };
  }

  const currentPage = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(limit) || 20));

  const [appointments, total] = await Promise.all([
    Appointment.find(filter)
      .populate({ path: 'dentist', populate: { path: 'user', select: 'name profilePhoto' } })
      .sort('-date startTime')
      .skip((currentPage - 1) * pageSize)
      .limit(pageSize),
    Appointment.countDocuments(filter),
  ]);

  success(res, 200, 'Appointments fetched.', appointments, { total, page: currentPage, limit: pageSize });
});

// @route GET /api/appointments/dentist/me  (dentist's own schedule)
exports.getDentistAppointments = catchAsync(async (req, res, next) => {
  const dentist = await Dentist.findOne({ user: req.user._id });
  if (!dentist) return next(new AppError('Dentist profile not found.', 404));

  const { date, status } = req.query;
  const filter = { dentist: dentist._id };
  if (status) filter.status = status;
  if (date) {
    const { start, end } = dayRange(date);
    filter.date = { $gte: start, $lt: end };
  }

  const appointments = await Appointment.find(filter)
    .populate('patient', 'name profilePhoto phone')
    .sort('date startTime');

  success(res, 200, 'Appointments fetched.', appointments);
});

// @route GET /api/appointments/:id
exports.getAppointmentById = catchAsync(async (req, res, next) => {
  const appointment = await Appointment.findById(req.params.id)
    .populate('patient', 'name phone email profilePhoto')
    .populate({ path: 'dentist', populate: { path: 'user', select: 'name phone email profilePhoto' } })
    .populate('invoice', 'invoiceNumber status totalAmount paidAt items discount couponCode');

  if (!appointment) return next(new AppError('Appointment not found.', 404));

  const isOwner =
    appointment.patient._id.equals(req.user._id) ||
    (req.user.role === 'dentist' && appointment.dentist.user._id.equals(req.user._id));
  if (!isOwner && !['admin', 'receptionist'].includes(req.user.role)) {
    return next(new AppError('You do not have access to this appointment.', 403));
  }

  success(res, 200, 'Appointment fetched.', appointment);
});

// @route PATCH /api/appointments/:id/confirm  (dentist/receptionist confirms - or auto-confirmed after payment)
exports.confirmAppointment = catchAsync(async (req, res, next) => {
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) return next(new AppError('Appointment not found.', 404));
  if (appointment.status !== 'pending') {
    return next(new AppError('Only pending appointments can be confirmed.', 400));
  }
  if (req.user.role === 'dentist') {
    const dentist = await Dentist.findOne({ user: req.user._id });
    if (!dentist || !appointment.dentist.equals(dentist._id)) {
      return next(new AppError('You can only confirm your own appointments.', 403));
    }
  }
  const staffOverride = ['admin', 'receptionist'].includes(req.user.role) && req.body.staffOverride === true;
  if (appointment.paymentStatus !== 'paid' && !staffOverride) {
    return next(new AppError('Payment is required before confirming this appointment.', 400));
  }
  appointment.status = 'confirmed';
  await appointment.save();

  await notify({
    userId: appointment.patient,
    title: 'Appointment Confirmed',
    message: `Your appointment on ${appointment.date.toDateString()} at ${appointment.startTime} is confirmed.`,
    type: 'appointment_confirmed',
    relatedId: appointment._id,
  });

  success(res, 200, 'Appointment confirmed.', appointment);
});

// @route PATCH /api/appointments/:id/cancel
exports.cancelAppointment = catchAsync(async (req, res, next) => {
  const { reason } = req.body;
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) return next(new AppError('Appointment not found.', 404));

  if (!['pending', 'confirmed'].includes(appointment.status)) {
    return next(new AppError(`Cannot cancel an appointment that is already ${appointment.status}.`, 400));
  }

  if (req.user.role === 'patient' && !appointment.patient.equals(req.user._id)) {
    return next(new AppError('You can only cancel your own appointments.', 403));
  }
  if (req.user.role === 'dentist') {
    const dentist = await Dentist.findOne({ user: req.user._id });
    if (!dentist || !appointment.dentist.equals(dentist._id)) {
      return next(new AppError('You can only cancel your own appointments.', 403));
    }
  }

  appointment.status = 'cancelled';
  appointment.cancelledBy = req.user.role === 'patient' ? 'patient' : req.user.role === 'dentist' ? 'dentist' : req.user.role === 'receptionist' ? 'receptionist' : 'admin';
  appointment.cancellationReason = reason || '';
  await appointment.save();

  // --- Auto-refund policy ---
  // If the appointment was already paid, and it's being cancelled far enough in
  // advance (per ClinicSettings.cancellationFullRefundHours, default 24h), refund
  // it automatically. Cancellations inside that window are left as 'paid' for
  // staff to review manually via POST /api/payments/:id/refund - e.g. a same-day
  // cancellation might still warrant a partial/no refund depending on clinic policy.
  let wasAutoRefunded = false;
  if (appointment.paymentStatus === 'paid' && appointment.payment) {
    const settings = (await ClinicSettings.findById('default')) || { cancellationFullRefundHours: 24 };
    const apptDateTime = new Date(appointment.date);
    const [h, m] = appointment.startTime.split(':').map(Number);
    apptDateTime.setHours(h, m, 0, 0);
    const hoursUntilAppointment = (apptDateTime.getTime() - Date.now()) / (1000 * 60 * 60);

    if (hoursUntilAppointment >= (settings.cancellationFullRefundHours ?? 24)) {
      try {
        const payment = await Payment.findById(appointment.payment);
        if (payment && payment.status === 'paid') {
          await processRefund(payment, null, `Auto-refund: cancelled by ${appointment.cancelledBy}`);
          appointment.paymentStatus = 'refunded';
          await appointment.save();
          wasAutoRefunded = true;
        }
      } catch (err) {
        // Don't fail the cancellation itself if the refund call errors out -
        // staff can still process it manually. Just log it clearly.
        logger.error(`Auto-refund failed for appointment ${appointment._id}: ${err.message}`);
      }
    }
  }

  await notify({
    userId: appointment.patient,
    title: 'Appointment Cancelled',
    message: wasAutoRefunded
      ? `Your appointment on ${appointment.date.toDateString()} at ${appointment.startTime} has been cancelled and refunded.`
      : `Your appointment on ${appointment.date.toDateString()} at ${appointment.startTime} has been cancelled.`,
    type: 'appointment_cancelled',
    relatedId: appointment._id,
  });

  success(res, 200, 'Appointment cancelled.', appointment);
});

// @route PATCH /api/appointments/:id/reschedule
exports.rescheduleAppointment = catchAsync(async (req, res, next) => {
  const { date, startTime, reason } = req.body;
  const oldAppointment = await Appointment.findById(req.params.id);
  if (!oldAppointment) return next(new AppError('Appointment not found.', 404));
  const isPatientOwner = req.user.role === 'patient' && oldAppointment.patient.equals(req.user._id);
  const isAdmin = req.user.role === 'admin';
  let isDentistOwner = false;
  if (req.user.role === 'dentist') {
    const dentistProfile = await Dentist.findOne({ user: req.user._id });
    isDentistOwner = !!dentistProfile && oldAppointment.dentist.equals(dentistProfile._id);
  }
  if (!isPatientOwner && !isDentistOwner && !isAdmin) {
    return next(new AppError('You do not have permission to reschedule this appointment.', 403));
  }
  if (!['pending', 'confirmed'].includes(oldAppointment.status)) {
    return next(new AppError(`Cannot reschedule an appointment that is ${oldAppointment.status}.`, 400));
  }

  // Reject slot equal to current
  const oldDateStr = oldAppointment.date instanceof Date ? oldAppointment.date.toISOString().slice(0, 10) : String(oldAppointment.date);
  if (oldDateStr === date && oldAppointment.startTime === startTime) {
    return next(new AppError('New slot must be different from current slot.', 400));
  }

  // Reject past date or past time on current date
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (date < todayStr || (date === todayStr && startTime <= currentTimeStr)) {
    return next(new AppError('Cannot reschedule to a past date or time.', 400));
  }

  const publishedSlots = await getAvailableSlots(oldAppointment.dentist, date);
  if (!publishedSlots.some((s) => s.startTime === startTime)) {
    return next(new AppError('This slot is not available for booking.', 400));
  }

  await assertSlotIsFree(oldAppointment.dentist, date, startTime);

  const dentist = await Dentist.findById(oldAppointment.dentist);
  const duration = dentist?.slotDurationMinutes || 30;
  const [h, m] = startTime.split(':').map(Number);
  const endMinutes = h * 60 + m + duration;
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

  const isPaid = oldAppointment.paymentStatus === 'paid';
  const paymentId = isPaid ? oldAppointment.payment : null;
  const paymentStatus = isPaid ? 'paid' : 'pending';
  const newStatus = isPaid ? 'confirmed' : 'pending';

  const newAppointment = await createAppointmentSafe({
    patient: oldAppointment.patient,
    familyMemberName: oldAppointment.familyMemberName,
    dentist: oldAppointment.dentist,
    clinic: oldAppointment.clinic,
    date,
    startTime,
    endTime,
    mode: 'in-clinic',
    reasonForVisit: oldAppointment.reasonForVisit,
    fees: oldAppointment.fees,
    paymentStatus,
    payment: paymentId,
    status: newStatus,
    rescheduledFrom: oldAppointment._id,
    rescheduledBy: req.user.role,
    rescheduleReason: reason || '',
    rescheduledAt: new Date(),
  });

  try {
    oldAppointment.status = 'rescheduled';
    oldAppointment.rescheduledTo = newAppointment._id;
    oldAppointment.rescheduledBy = req.user.role;
    oldAppointment.rescheduleReason = reason || '';
    oldAppointment.rescheduledAt = new Date();
    await oldAppointment.save();

    if (paymentId) {
      const Payment = require('../models/Payment');
      await Payment.findByIdAndUpdate(paymentId, { appointment: newAppointment._id });
    }
    const Invoice = require('../models/Invoice');
    await Invoice.updateMany({ appointment: oldAppointment._id }, { appointment: newAppointment._id });

    const Queue = require('../models/Queue');
    await Queue.deleteMany({ appointment: oldAppointment._id });
  } catch (err) {
    await Appointment.findByIdAndDelete(newAppointment._id);
    throw err;
  }

  await newAppointment.populate('patient', 'name email phone avatar');
  await newAppointment.populate('dentist', 'name title user');

  const patientName = newAppointment.patient?.name || 'Patient';
  const reasonText = reason ? ` Reason: ${reason}` : '';

  // Notify Patient (in-app + email)
  await notify({
    userId: oldAppointment.patient,
    title: 'Appointment Rescheduled',
    message: `Your appointment has been rescheduled from ${oldAppointment.date} ${oldAppointment.startTime} to ${date} at ${startTime}.${reasonText}`,
    type: 'appointment_rescheduled',
    relatedId: newAppointment._id,
    link: `/app/appointments?search=${newAppointment._id}`,
  });

  // Notify Receptionist(s)
  await notifyRoles(['receptionist'], {
    title: 'Appointment Rescheduled',
    message: `Appointment for ${patientName} rescheduled to ${date} at ${startTime}.${reasonText}`,
    type: 'appointment_rescheduled',
    relatedId: newAppointment._id,
    link: `/reception/appointments?open=${newAppointment._id}`,
  });

  success(res, 200, 'Appointment rescheduled.', newAppointment);
});

// @route PATCH /api/appointments/:id/complete  (dentist marks visit done)
exports.completeAppointment = catchAsync(async (req, res, next) => {
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) return next(new AppError('Appointment not found.', 404));

  if (req.user.role === 'dentist') {
    const dentist = await Dentist.findOne({ user: req.user._id });
    if (!dentist || !appointment.dentist.equals(dentist._id)) {
      return next(new AppError('You can only complete your own appointments.', 403));
    }
  } else if (req.user.role === 'receptionist' || req.user.role === 'admin') {
    const isCheckedIn = Boolean(appointment.checkedInAt || appointment.status === 'checked-in');
    const isConfirmedByDentist = req.body.completionConfirmedByDentist === true;
    if (!isCheckedIn && !isConfirmedByDentist) {
      return next(new AppError('Front desk completion requires dentist confirmation or an active check-in.', 400));
    }
  } else {
    return next(new AppError('You do not have permission to complete appointments.', 403));
  }

  if (!['confirmed', 'checked-in'].includes(appointment.status)) {
    return next(new AppError('Only confirmed or checked-in appointments can be completed.', 400));
  }

  appointment.status = 'completed';
  appointment.completedBy = req.user.role;
  appointment.completedAt = new Date();
  await appointment.save();

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

  await notifyUser(appointment.patient, {
    title: 'Visit Completed',
    message: 'Your appointment has been marked as completed. You can now leave a review.',
    type: 'appointment_completed',
    relatedId: appointment._id,
    link: `/app/appointments?review=${appointment._id}`,
  });

  if (invoice) {
    await notifyRoles(['receptionist'], {
      title: 'Invoice Generated',
      message: `Invoice #${invoice.invoiceNumber} generated for completed appointment.`,
      type: 'invoice_ready',
      relatedId: invoice._id,
      link: `/reception/invoices?open=${invoice._id}`,
    });
  }

  try {
    const patientUser = await User.findById(appointment.patient);
    const dentistDoc = await Dentist.findById(appointment.dentist).populate('user', 'name');
    const doctorName = dentistDoc?.user?.name || dentistDoc?.name || 'Your Doctor';
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

    if (patientUser?.email) {
      const { sendTransactionalEmail } = require('../services/email.service');
      sendTransactionalEmail({
        to: patientUser.email,
        template: 'appointmentCompleted',
        data: {
          patientName: patientUser.name,
          doctorName,
          date: typeof appointment.date === 'string' ? appointment.date : new Date(appointment.date).toDateString(),
          reviewUrl: `${clientUrl}/app/appointments?review=${appointment._id}`,
        },
        relatedId: appointment._id,
      }).catch((e) => logger.error(`Email send failed: ${e.message}`));

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
          },
          relatedId: invoice._id,
        }).catch((e) => logger.error(`Invoice email send failed: ${e.message}`));
      }
    }
  } catch (emailErr) {
    logger.error(`Error sending completion emails: ${emailErr.message}`);
  }

  success(res, 200, 'Appointment marked as completed.', { appointment, invoice, invoiceError });
});

// @route PATCH /api/appointments/:id/no-show
exports.markNoShow = catchAsync(async (req, res, next) => {
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) return next(new AppError('Appointment not found.', 404));
  if (req.user.role === 'dentist') {
    const dentist = await Dentist.findOne({ user: req.user._id });
    if (!dentist || !appointment.dentist.equals(dentist._id)) {
      return next(new AppError('You can only update your own appointments.', 403));
    }
  }
  if (appointment.status !== 'confirmed') {
    return next(new AppError('Only confirmed appointments can be marked as no-show.', 400));
  }
  appointment.status = 'no-show';
  await appointment.save();
  success(res, 200, 'Appointment marked as no-show.', appointment);
});

// @route GET /api/appointments (E3 - receptionist/admin appointment list)
exports.getAllAppointments = catchAsync(async (req, res, next) => {
  const { date, from, to, status, paymentStatus, mode, dentistId, patientId, search, sort, page = 1, limit = 20 } = req.query;

  if (from && to) {
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T00:00:00.000Z`);
    if (fromDate > toDate) {
      return next(new AppError('from date cannot be after to date', 400));
    }
  }

  const baseFilter = {};
  if (status) baseFilter.status = status;
  if (paymentStatus) baseFilter.paymentStatus = paymentStatus;
  if (mode) baseFilter.mode = mode;
  if (dentistId) baseFilter.dentist = dentistId;
  if (patientId) baseFilter.patient = patientId;

  if (date) {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    baseFilter.date = { $gte: start, $lt: end };
  } else if (from || to) {
    baseFilter.date = {};
    if (from) baseFilter.date.$gte = new Date(`${from}T00:00:00.000Z`);
    if (to) {
      const end = new Date(`${to}T00:00:00.000Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      baseFilter.date.$lt = end;
    }
  }

  const andConditions = [];
  if (Object.keys(baseFilter).length > 0) {
    andConditions.push(baseFilter);
  }

  if (search && search.trim()) {
    const term = search.trim();
    const regex = new RegExp(escapeRegex(term), 'i');
    const orSearch = [];

    if (/^[0-9a-fA-F]{24}$/.test(term)) {
      orSearch.push({ _id: term });
    }

    const matchingUsers = await User.find({
      role: 'patient',
      $or: [{ name: regex }, { email: regex }, { phone: regex }],
    }).select('_id');
    if (matchingUsers.length > 0) {
      orSearch.push({ patient: { $in: matchingUsers.map((u) => u._id) } });
    }

    const matchingDentists = await User.find({
      role: 'dentist',
      $or: [{ name: regex }, { email: regex }],
    }).select('_id');
    if (matchingDentists.length > 0) {
      const dentists = await Dentist.find({ user: { $in: matchingDentists.map((u) => u._id) } }).select('_id');
      if (dentists.length > 0) {
        orSearch.push({ dentist: { $in: dentists.map((d) => d._id) } });
      }
    }

    orSearch.push({ reasonForVisit: regex });
    orSearch.push({ mode: regex });

    const matchingInvoices = await Invoice.find({
      invoiceNumber: regex,
      appointment: { $ne: null },
    }).select('appointment');
    if (matchingInvoices.length > 0) {
      orSearch.push({ _id: { $in: matchingInvoices.map((inv) => inv.appointment) } });
    }

    andConditions.push({ $or: orSearch });
  }

  const finalFilter = andConditions.length > 1 ? { $and: andConditions } : (andConditions[0] || {});

  const currentPage = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(limit) || 20));
  const sortOption = sort || '-date -startTime';

  const [appointments, total] = await Promise.all([
    Appointment.find(finalFilter)
      .populate('patient', 'name phone email profilePhoto')
      .populate({ path: 'dentist', populate: { path: 'user', select: 'name profilePhoto' } })
      .populate('invoice', 'invoiceNumber status totalAmount paidAt items discount couponCode')
      .sort(sortOption)
      .skip((currentPage - 1) * pageSize)
      .limit(pageSize),
    Appointment.countDocuments(finalFilter),
  ]);

  success(res, 200, 'Appointments fetched.', appointments, { total, page: currentPage, limit: pageSize });
});
