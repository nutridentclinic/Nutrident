const Queue = require('../models/Queue');
const Dentist = require('../models/Dentist');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');
const { notify } = require('../services/notification.service');

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

// @route POST /api/queue/check-in  (receptionist checks in a walk-in or arriving patient)
exports.checkIn = catchAsync(async (req, res, next) => {
  const { dentistId, patientId, walkInName, appointmentId, date } = req.body;
  const day = startOfDay(date || new Date());

  const lastEntry = await Queue.findOne({ dentist: dentistId, date: day }).sort('-tokenNumber');
  const tokenNumber = lastEntry ? lastEntry.tokenNumber + 1 : 1;

  const dentist = await Dentist.findById(dentistId);
  const avgConsultMinutes = dentist?.slotDurationMinutes || 15;
  const waitingCount = await Queue.countDocuments({ dentist: dentistId, date: day, status: 'waiting' });

  const entry = await Queue.create({
    dentist: dentistId,
    patient: patientId || null,
    walkInName: walkInName || null,
    appointment: appointmentId || null,
    tokenNumber,
    date: day,
    estimatedWaitMinutes: waitingCount * avgConsultMinutes,
  });

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
exports.getQueueForDentist = catchAsync(async (req, res) => {
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