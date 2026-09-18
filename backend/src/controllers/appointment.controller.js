const Appointment = require('../models/Appointment');
const Dentist = require('../models/Dentist');
const ClinicSettings = require('../models/ClinicSettings');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');
const { assertSlotIsFree } = require('../services/availability.service');
const { notify } = require('../services/notification.service');
const { generateAgoraToken, mongoIdToAgoraUid, isConfigured } = require('../config/agora');

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

// @route POST /api/appointments  (patient books an appointment)
exports.createAppointment = catchAsync(async (req, res, next) => {
  const { dentistId, date, startTime, mode, reasonForVisit, familyMemberName } = req.body;

  const dentist = await Dentist.findById(dentistId);
  if (!dentist || !dentist.isActive || !dentist.isVerified) {
    return next(new AppError('This dentist is not available for booking.', 400));
  }

  // Re-validate the slot is still free right before creating (race-condition guard)
  await assertSlotIsFree(dentistId, date, startTime);

  const duration = dentist.slotDurationMinutes || 30;
  const [h, m] = startTime.split(':').map(Number);
  const endMinutes = h * 60 + m + duration;
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

  const settings = (await ClinicSettings.findById('default')) || { platformFee: 0 };
  const consultationFee = dentist.consultationFee;
  const platformFee = settings.platformFee || 0;

  const appointment = await Appointment.create({
    patient: req.user._id,
    familyMemberName: familyMemberName || null,
    dentist: dentistId,
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
    message: `Your appointment with Dr. ${dentist.specialization} on ${date} at ${startTime} is pending payment/confirmation.`,
    type: 'appointment_confirmed',
    relatedId: appointment._id,
  });

  success(res, 201, 'Appointment created. Proceed to payment to confirm.', appointment);
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
  const appointment = await Appointment.findByIdAndUpdate(
    req.params.id,
    { status: 'confirmed' },
    { new: true }
  );
  if (!appointment) return next(new AppError('Appointment not found.', 404));

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

  if (['completed', 'cancelled'].includes(appointment.status)) {
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

  await notify({
    userId: appointment.patient,
    title: 'Appointment Cancelled',
    message: `Your appointment on ${appointment.date.toDateString()} at ${appointment.startTime} has been cancelled.`,
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
  if (['completed', 'cancelled'].includes(oldAppointment.status)) {
    return next(new AppError(`Cannot reschedule an appointment that is ${oldAppointment.status}.`, 400));
  }

  await assertSlotIsFree(oldAppointment.dentist, date, startTime);

  const dentist = await Dentist.findById(oldAppointment.dentist);
  const duration = dentist.slotDurationMinutes || 30;
  const [h, m] = startTime.split(':').map(Number);
  const endMinutes = h * 60 + m + duration;
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

  const newAppointment = await Appointment.create({
    patient: oldAppointment.patient,
    familyMemberName: oldAppointment.familyMemberName,
    dentist: oldAppointment.dentist,
    date,
    startTime,
    endTime,
    mode: oldAppointment.mode,
    reasonForVisit: oldAppointment.reasonForVisit,
    fees: oldAppointment.fees,
    paymentStatus: oldAppointment.paymentStatus,
    payment: oldAppointment.payment,
    status: oldAppointment.paymentStatus === 'paid' ? 'confirmed' : 'pending',
    rescheduledFrom: oldAppointment._id,
  });

  oldAppointment.status = 'rescheduled';
  oldAppointment.rescheduledTo = newAppointment._id;
  await oldAppointment.save();

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
  const appointment = await Appointment.findByIdAndUpdate(
    req.params.id,
    { status: 'completed' },
    { new: true }
  );
  if (!appointment) return next(new AppError('Appointment not found.', 404));

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
  const appointment = await Appointment.findByIdAndUpdate(req.params.id, { status: 'no-show' }, { new: true });
  if (!appointment) return next(new AppError('Appointment not found.', 404));
  success(res, 200, 'Appointment marked as no-show.', appointment);
});

// @route POST /api/appointments/:id/video/join  (returns/creates a room id)
// @route POST /api/appointments/:id/video/join  (returns an Agora token to join the call)
exports.joinVideoCall = catchAsync(async (req, res, next) => {
  const appointment = await Appointment.findById(req.params.id).populate('dentist');
  if (!appointment) return next(new AppError('Appointment not found.', 404));
  if (appointment.mode !== 'video') return next(new AppError('This appointment is not a video consultation.', 400));
  if (appointment.status !== 'confirmed') return next(new AppError('Appointment is not confirmed yet.', 400));
  if (!isConfigured()) return next(new AppError('Video calling is not configured on the server yet.', 503));

  // One Agora channel per appointment - both sides join the same channel name.
  const channelName = `appt_${appointment._id}`;
  if (!appointment.videoCall.roomId) {
    appointment.videoCall.roomId = channelName;
  }
  if (req.user.role === 'patient') appointment.videoCall.joinedByPatientAt = new Date();
  if (req.user.role === 'dentist') appointment.videoCall.joinedByDentistAt = new Date();
  await appointment.save();

  const uid = mongoIdToAgoraUid(req.user._id);
  const token = generateAgoraToken(channelName, uid);
  if (!token) return next(new AppError('Could not generate a video call token. Please try again.', 500));

  success(res, 200, 'Video call token issued.', {
    appId: process.env.AGORA_APP_ID,
    channelName,
    uid,
    token,
    expiresInSeconds: 7200,
  });
});