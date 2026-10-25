const Queue = require('../models/Queue');
const Dentist = require('../models/Dentist');
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');
const { notify, notifyUser, notifyRoles } = require('../services/notification.service');
const canAccessDentistQueue = require('../utils/queueAccess');
const { todayInClinic, parseDateOnly } = require('../utils/clinicDate');

const startOfDay = (date) => {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return parseDateOnly(date);
  }
  return parseDateOnly(todayInClinic());
};

// @route POST /api/queue/check-in  (receptionist checks in an arriving registered patient)
exports.checkIn = catchAsync(async (req, res, next) => {
  const { dentistId, patientId, walkInName, appointmentId, date } = req.body;

  if (walkInName !== undefined && String(walkInName).trim() !== '') {
    return next(new AppError('Walk-in registration is disabled. Check-in works only for registered patients.', 400));
  }

  let resolvedPatientId = patientId;
  let resolvedAppointmentId = appointmentId || null;

  if (!resolvedPatientId && appointmentId) {
    const appt = await Appointment.findById(appointmentId);
    if (!appt) return next(new AppError('Appointment not found.', 404));
    resolvedPatientId = appt.patient;
    resolvedAppointmentId = appt._id;
  }

  if (!resolvedPatientId) {
    return next(new AppError('patientId or appointmentId is required for check-in.', 400));
  }

  const patientUser = await User.findById(resolvedPatientId);
  if (!patientUser) {
    return next(new AppError('Patient account not found.', 404));
  }

  const primaryDentist = await Dentist.findOne().populate('user');
  if (!primaryDentist) {
    return next(new AppError('No dentist is configured for this clinic.', 404));
  }
  if (dentistId && String(primaryDentist._id) !== String(dentistId)) {
    return next(new AppError('The specified dentist is not the clinic doctor.', 400));
  }
  const resolvedDentistId = primaryDentist._id;
  const dentist = primaryDentist;

  const day = startOfDay(date);
  const avgConsultMinutes = dentist?.slotDurationMinutes || 15;
  const waitingCount = await Queue.countDocuments({ dentist: resolvedDentistId, date: day, status: 'waiting' });
  let entry;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const lastEntry = await Queue.findOne({ dentist: resolvedDentistId, date: day }).sort('-tokenNumber');
    const tokenNumber = lastEntry ? lastEntry.tokenNumber + 1 : 1;
    try {
      entry = await Queue.create({
        dentist: resolvedDentistId,
        patient: resolvedPatientId,
        walkInName: null,
        appointment: resolvedAppointmentId,
        tokenNumber,
        date: day,
        estimatedWaitMinutes: waitingCount * avgConsultMinutes,
      });
      break;
    } catch (error) {
      if (error.code !== 11000 || attempt === 2) throw error;
    }
  }

  req.app.get('io')?.to(`queue_${resolvedDentistId}`).emit('queue:updated', { action: 'check-in', entry });

  await notifyUser(resolvedPatientId, {
    title: 'Checked In',
    message: `You're checked in. Your token number is ${entry.tokenNumber}. Estimated wait: ${entry.estimatedWaitMinutes} min.`,
    type: 'queue_update',
    relatedId: entry._id,
  });

  if (dentist?.user) {
    const dentistUserId = dentist.user._id || dentist.user;
    await notifyUser(dentistUserId, {
      title: 'Patient Checked In',
      message: `${patientUser.name || 'Patient'} has checked in (Token ${entry.tokenNumber}).`,
      type: 'patient_checked_in',
      relatedId: entry._id,
    });
  }

  await notifyRoles(['receptionist'], {
    title: 'Patient Checked In',
    message: `${patientUser.name || 'Patient'} checked in (Token ${entry.tokenNumber}).`,
    type: 'patient_checked_in',
    relatedId: entry._id,
  });

  success(res, 201, 'Checked in successfully.', entry);
});

// @route GET /api/queue/dentist/:dentistId?date=YYYY-MM-DD
exports.getQueueForDentist = catchAsync(async (req, res, next) => {
  const dentistProfile = req.user.role === 'dentist' ? await Dentist.findOne({ user: req.user._id }) : null;
  if (!canAccessDentistQueue(req.user, req.params.dentistId, dentistProfile)) {
    return next(new AppError('You do not have access to this dentist queue.', 403));
  }
  const day = startOfDay(req.query.date || new Date());
  const queue = await Queue.find({ dentist: req.params.dentistId, date: day })
    .populate('patient', 'name phone')
    .sort('tokenNumber');
  success(res, 200, 'Queue fetched.', queue);
});

// @route PATCH /api/queue/:id/call  (receptionist/dentist calls next patient in)
exports.callNext = catchAsync(async (req, res, next) => {
  const entry = await Queue.findByIdAndUpdate(
    req.params.id,
    { status: 'in-progress', calledAt: new Date() },
    { new: true }
  );
  if (!entry) return next(new AppError('Queue entry not found.', 404));

  req.app.get('io')?.to(`queue_${entry.dentist}`).emit('queue:updated', { action: 'called', entry });

  if (entry.patient) {
    await notify({
      userId: entry.patient,
      title: "It's your turn",
      message: `Token ${entry.tokenNumber}, please proceed to the consultation room.`,
      type: 'queue_update',
      relatedId: entry._id,
    });
  }

  success(res, 200, 'Patient called in.', entry);
});

// @route PATCH /api/queue/:id/complete
exports.completeEntry = catchAsync(async (req, res, next) => {
  const entry = await Queue.findByIdAndUpdate(
    req.params.id,
    { status: 'completed', completedAt: new Date() },
    { new: true }
  );
  if (!entry) return next(new AppError('Queue entry not found.', 404));
  req.app.get('io')?.to(`queue_${entry.dentist}`).emit('queue:updated', { action: 'completed', entry });
  success(res, 200, 'Marked as completed.', entry);
});

// @route PATCH /api/queue/:id/skip
exports.skipEntry = catchAsync(async (req, res, next) => {
  const entry = await Queue.findByIdAndUpdate(req.params.id, { status: 'skipped' }, { new: true });
  if (!entry) return next(new AppError('Queue entry not found.', 404));
  req.app.get('io')?.to(`queue_${entry.dentist}`).emit('queue:updated', { action: 'skipped', entry });
  success(res, 200, 'Patient skipped.', entry);
});