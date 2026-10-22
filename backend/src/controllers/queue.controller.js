const Queue = require('../models/Queue');
const Dentist = require('../models/Dentist');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');
const { notify } = require('../services/notification.service');
const canAccessDentistQueue = require('../utils/queueAccess');
const { getClinicDateTime } = require('../utils/appointmentAccess');

const startOfDay = (date) => {
  const dateKey = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? date
    : getClinicDateTime(date || new Date()).date;
  return new Date(`${dateKey}T00:00:00.000Z`);
};

// @route POST /api/queue/check-in  (receptionist checks in a walk-in or arriving patient)
exports.checkIn = catchAsync(async (req, res, next) => {
  const { dentistId, patientId, walkInName, appointmentId, date } = req.body;
  if (!patientId && !String(walkInName || '').trim()) {
    return next(new AppError('patientId or walkInName is required.', 400));
  }
  const dentist = await Dentist.findById(dentistId);
  if (!dentist) return next(new AppError('Dentist not found.', 404));
  const day = startOfDay(date || new Date());
  const avgConsultMinutes = dentist?.slotDurationMinutes || 15;
  const waitingCount = await Queue.countDocuments({ dentist: dentistId, date: day, status: 'waiting' });
  let entry;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const lastEntry = await Queue.findOne({ dentist: dentistId, date: day }).sort('-tokenNumber');
    const tokenNumber = lastEntry ? lastEntry.tokenNumber + 1 : 1;
    try {
      entry = await Queue.create({
        dentist: dentistId,
        patient: patientId || null,
        walkInName: walkInName?.trim() || null,
        appointment: appointmentId || null,
        tokenNumber,
        date: day,
        estimatedWaitMinutes: waitingCount * avgConsultMinutes,
      });
      break;
    } catch (error) {
      if (error.code !== 11000 || attempt === 2) throw error;
    }
  }

  req.app.get('io')?.to(`queue_${dentistId}`).emit('queue:updated', { action: 'check-in', entry });

  if (patientId) {
    await notify({
      userId: patientId,
      title: 'Checked In',
      message: `You're checked in. Your token number is ${tokenNumber}. Estimated wait: ${entry.estimatedWaitMinutes} min.`,
      type: 'queue_update',
      relatedId: entry._id,
    });
  }

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