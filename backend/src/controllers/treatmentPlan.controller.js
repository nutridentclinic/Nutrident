const TreatmentPlan = require('../models/TreatmentPlan');
const Dentist = require('../models/Dentist');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');
const { notify } = require('../services/notification.service');

// @route POST /api/treatment-plans  (dentist)
exports.createPlan = catchAsync(async (req, res, next) => {
  const dentist = await Dentist.findOne({ user: req.user._id });
  if (!dentist) return next(new AppError('Dentist profile not found.', 404));

  const { patientId, title, notes, steps, followUpRequired, followUpDate } = req.body;
  const totalEstimatedCost = (steps || []).reduce((sum, s) => sum + (s.cost || 0), 0);

  const plan = await TreatmentPlan.create({
    patient: patientId,
    dentist: dentist._id,
    title,
    notes,
    steps,
    totalEstimatedCost,
    followUpRequired,
    followUpDate,
  });

  await notify({
    userId: patientId,
    title: 'Treatment Plan Created',
    message: `Your dentist has created a treatment plan: "${title}".`,
    type: 'treatment_plan_created',
    relatedId: plan._id,
  });

  success(res, 201, 'Treatment plan created.', plan);
});

// @route GET /api/treatment-plans/me  (patient)
exports.getMyPlans = catchAsync(async (req, res) => {
  const plans = await TreatmentPlan.find({ patient: req.user._id })
    .populate({ path: 'dentist', populate: { path: 'user', select: 'name' } })
    .populate('steps.treatment')
    .sort('-createdAt');
  success(res, 200, 'Treatment plans fetched.', plans);
});

// @route GET /api/treatment-plans/patient/:patientId  (dentist/receptionist)
exports.getPatientPlans = catchAsync(async (req, res) => {
  const plans = await TreatmentPlan.find({ patient: req.params.patientId }).populate('steps.treatment').sort('-createdAt');
  success(res, 200, 'Treatment plans fetched.', plans);
});

// @route PATCH /api/treatment-plans/:id/steps/:stepId  (dentist updates a step's status)
exports.updateStep = catchAsync(async (req, res, next) => {
  const { status, appointmentId } = req.body;
  const plan = await TreatmentPlan.findById(req.params.id);
  if (!plan) return next(new AppError('Treatment plan not found.', 404));

  const step = plan.steps.id(req.params.stepId);
  if (!step) return next(new AppError('Step not found.', 404));

  step.status = status;
  if (appointmentId) step.appointment = appointmentId;
  if (status === 'completed') step.completedAt = new Date();

  if (plan.steps.every((s) => s.status === 'completed')) plan.status = 'completed';
  await plan.save();

  await notify({
    userId: plan.patient,
    title: 'Treatment Updated',
    message: `A step in your treatment plan "${plan.title}" is now ${status}.`,
    type: 'treatment_updated',
    relatedId: plan._id,
  });

  success(res, 200, 'Step updated.', plan);
});