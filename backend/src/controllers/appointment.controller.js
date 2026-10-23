const Appointment = require('../models/Appointment');
const Dentist = require('../models/Dentist');
const User = require('../models/User');
const ClinicSettings = require('../models/ClinicSettings');
const Payment = require('../models/Payment');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const logger = require('../utils/logger');
const { success } = require('../utils/response');
const { assertSlotIsFree, getAvailableSlots } = require('../services/availability.service');
const { notify } = require('../services/notification.service');
const { processRefund } = require('../services/payment.service');
const { generateAgoraToken, mongoIdToAgoraUid, isConfigured } = require('../config/agora');
const { isAppointmentParticipant, isWithinVideoWindow } = require('../utils/appointmentAccess');

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

// Helper to resolve the clinic's single dentist
const resolvePrimaryDentist = async (requestedDentistId) => {
  const primary = await Dentist.findOne().populate('user', 'name profilePhoto');
  if (!primary) {
    throw new AppError('No dentist is configured for this clinic.', 404);
  }
  if (requestedDentistId && String(primary._id) !== String(requestedDentistId)) {
    throw new AppError('The specified dentist is not the clinic doctor.', 400);
  }
  return primary;
};

// @route POST /api/appointments  (patient books an appointment)
exports.createAppointment = catchAsync(async (req, res, next) => {
  const { dentistId, date, startTime, mode, reasonForVisit, familyMemberName } = req.body;

  const dentist = await resolvePrimaryDentist(dentistId);
  if (!dentist.isActive || !dentist.isVerified) {
    return next(new AppError('This doctor is currently not accepting appointments.', 400));
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

  const settings = (await ClinicSettings.findById('default')) || { platformFee: 0 };
  const consultationFee = dentist.consultationFee;
  const platformFee = settings.platformFee || 0;

  const appointment = await createAppointmentSafe({
    patient: req.user._id,
    familyMemberName: familyMemberName || null,
    dentist: dentist._id,
    clinic: dentist.clinic || null,
    date,
    startTime,
    endTime,
    mode: mode || 'in-clinic',
    reasonForVisit,
    fees: {
      consultationFee,
      platformFee,
      totalAmount: consultationFee + platformFee,
    },
  });

  await notify({
    userId: req.user._id,
    title: 'Appointment Requested',
    message: `Your appointment with Dr. ${dentist.user?.name || dentist.specialization} on ${date} at ${startTime} is pending payment/confirmation.`,
    type: 'appointment_confirmed',
    relatedId: appointment._id,
  });

  if (dentist.user) {
    const dentistUserId = dentist.user._id || dentist.user;
    await notify({
      userId: dentistUserId,
      title: 'New Appointment Booking',
      message: `A new appointment has been booked for ${date} at ${startTime}.`,
      type: 'appointment_confirmed',
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
  if (!dentist.isActive || !dentist.isVerified) {
    return next(new AppError('This doctor is currently not accepting appointments.', 400));
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

  const settings = (await ClinicSettings.findById('default')) || { platformFee: 0 };
  const consultationFee = dentist.consultationFee;
  const platformFee = settings.platformFee || 0;

  const appointment = await createAppointmentSafe({
    patient: patientId,
    familyMemberName: familyMemberName || null,
    dentist: dentist._id,
    clinic: dentist.clinic || null,
    date,
    startTime,
    endTime,
    mode: mode || 'in-clinic',
    reasonForVisit,
    fees: {
      consultationFee,
      platformFee,
      totalAmount: consultationFee + platformFee,
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
  const { status, upcoming } = req.query;
  const filter = { patient: req.user._id };
  if (status) filter.status = status;
  if (upcoming === 'true') filter.date = { $gte: new Date() };

  const appointments = await Appointment.find(filter)
    .populate({ path: 'dentist', populate: { path: 'user', select: 'name profilePhoto' } })
    .sort('-date');

  success(res, 200, 'Appointments fetched.', appointments);
});

// @route GET /api/appointments/dentist/me  (dentist's own schedule)
exports.getDentistAppointments = catchAsync(async (req, res, next) => {
  const dentist = await Dentist.findOne({ user: req.user._id });
  if (!dentist) return next(new AppError('Dentist profile not found.', 404));

  const { date, status } = req.query;
  const filter = { dentist: dentist._id };
  if (status) filter.status = status;
  if (date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const nextDay = new Date(d);
    nextDay.setDate(nextDay.getDate() + 1);
    filter.date = { $gte: d, $lt: nextDay };
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
    .populate({ path: 'dentist', populate: { path: 'user', select: 'name phone email profilePhoto' } });

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
  appointment.cancelledBy = req.user.role === 'patient' ? 'patient' : req.user.role === 'dentist' ? 'dentist' : 'admin';
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
  const { date, startTime } = req.body;
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

  const publishedSlots = await getAvailableSlots(oldAppointment.dentist, date);
  if (!publishedSlots.some((s) => s.startTime === startTime)) {
    return next(new AppError('This slot is not available for booking.', 400));
  }

  await assertSlotIsFree(oldAppointment.dentist, date, startTime);

  const dentist = await Dentist.findById(oldAppointment.dentist);
  const duration = dentist.slotDurationMinutes || 30;
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
    mode: oldAppointment.mode,
    reasonForVisit: oldAppointment.reasonForVisit,
    fees: oldAppointment.fees,
    paymentStatus,
    payment: paymentId,
    status: newStatus,
    rescheduledFrom: oldAppointment._id,
  });

  try {
    oldAppointment.status = 'rescheduled';
    oldAppointment.rescheduledTo = newAppointment._id;
    await oldAppointment.save();
    if (paymentId) {
      await Payment.findByIdAndUpdate(paymentId, { appointment: newAppointment._id });
    }
  } catch (err) {
    await Appointment.findByIdAndDelete(newAppointment._id);
    throw err;
  }

  await notify({
    userId: oldAppointment.patient,
    title: 'Appointment Rescheduled',
    message: `Your appointment has been rescheduled to ${date} at ${startTime}.`,
    type: 'appointment_rescheduled',
    relatedId: newAppointment._id,
  });

  success(res, 200, 'Appointment rescheduled.', newAppointment);
});

// @route PATCH /api/appointments/:id/complete  (dentist marks visit done)
exports.completeAppointment = catchAsync(async (req, res, next) => {
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) return next(new AppError('Appointment not found.', 404));
  const dentist = await Dentist.findOne({ user: req.user._id });
  if (!dentist || !appointment.dentist.equals(dentist._id)) {
    return next(new AppError('You can only complete your own appointments.', 403));
  }
  if (appointment.status !== 'confirmed') {
    return next(new AppError('Only confirmed appointments can be completed.', 400));
  }
  appointment.status = 'completed';
  await appointment.save();

  await notify({
    userId: appointment.patient,
    title: 'Visit Completed',
    message: 'Your appointment has been marked as completed. You can now leave a review.',
    type: 'appointment_completed',
    relatedId: appointment._id,
  });

  success(res, 200, 'Appointment marked as completed.', appointment);
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

// @route POST /api/appointments/:id/video/join  (returns an Agora token to join the call)
exports.joinVideoCall = catchAsync(async (req, res, next) => {
  const appointment = await Appointment.findById(req.params.id).populate('dentist');
  if (!appointment) return next(new AppError('Appointment not found.', 404));
  if (!isAppointmentParticipant(appointment, req.user)) {
    return next(new AppError('Only the patient or dentist for this appointment can join.', 403));
  }
  if (!['video', 'audio'].includes(appointment.mode)) {
    return next(new AppError('This appointment is not a remote (video or audio) consultation.', 400));
  }
  if (appointment.status !== 'confirmed') return next(new AppError('Appointment is not confirmed yet.', 400));
  if (appointment.paymentStatus !== 'paid' && appointment.payment) {
    return next(new AppError('Payment is required before joining this consultation.', 400));
  }
  if (!isWithinVideoWindow(appointment)) {
    return next(new AppError('Consultation call access is available 15 minutes before the appointment until 30 minutes after it ends.', 403));
  }
  if (!isConfigured()) return next(new AppError('Video/audio calling is not configured on the server yet.', 503));

  // One Agora channel per appointment - both sides join the same channel name.
  const channelName = `appt_${appointment._id}`;
  const uid = mongoIdToAgoraUid(req.user._id);
  const token = generateAgoraToken(channelName, uid);
  if (!token) return next(new AppError('Could not generate a call token. Please try again.', 500));

  if (!appointment.videoCall.roomId) appointment.videoCall.roomId = channelName;
  if (req.user.role === 'patient') appointment.videoCall.joinedByPatientAt = new Date();
  if (req.user.role === 'dentist') appointment.videoCall.joinedByDentistAt = new Date();
  await appointment.save();

  success(res, 200, 'Call token issued.', {
    appId: process.env.AGORA_APP_ID,
    channelName,
    uid,
    token,
    mode: appointment.mode,
    expiresInSeconds: 7200,
  });
});

// @route GET /api/appointments (E3 - receptionist/admin appointment list)
exports.getAllAppointments = catchAsync(async (req, res) => {
  const { date, from, to, status, dentistId, patientId, search, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (dentistId) filter.dentist = dentistId;
  if (patientId) filter.patient = patientId;
  if (date) {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    filter.date = { $gte: start, $lt: end };
  } else if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(`${from}T00:00:00.000Z`);
    if (to) {
      const end = new Date(`${to}T00:00:00.000Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      filter.date.$lt = end;
    }
  }
  if (search) {
    const users = await User.find({
      role: 'patient',
      $or: [
        { name: new RegExp(escapeRegex(search), 'i') },
        { email: new RegExp(escapeRegex(search), 'i') },
        { phone: new RegExp(escapeRegex(search), 'i') },
      ],
    }).select('_id');
    filter.patient = { $in: users.map((user) => user._id) };
  }

  const currentPage = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(limit) || 20));
  const [appointments, total] = await Promise.all([
    Appointment.find(filter)
      .populate('patient', 'name phone email profilePhoto')
      .populate({ path: 'dentist', populate: { path: 'user', select: 'name profilePhoto' } })
      .sort('date startTime')
      .skip((currentPage - 1) * pageSize)
      .limit(pageSize),
    Appointment.countDocuments(filter),
  ]);
  success(res, 200, 'Appointments fetched.', appointments, { total, page: currentPage, limit: pageSize });
});