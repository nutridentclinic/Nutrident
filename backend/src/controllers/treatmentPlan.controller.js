const TreatmentPlan = require('../models/TreatmentPlan');
const Treatment = require('../models/Treatment');
const Dentist = require('../models/Dentist');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');
const { notify } = require('../services/notification.service');

function serializeTreatmentPlan(planDoc) {
  if (!planDoc) return null;
  const plan = typeof planDoc.toObject === 'function' ? planDoc.toObject() : { ...planDoc };
  const steps = (plan.steps || []).map((step) => {
    const s = typeof step.toObject === 'function' ? step.toObject() : { ...step };
    const toothNumbers = s.toothNumbers || [];
    return {
      ...s,
      teeth: toothNumbers,
      toothNumbers,
    };
  });
  return {
    ...plan,
    requiresFollowUp: Boolean(plan.followUpRequired),
    followUpRequired: Boolean(plan.followUpRequired),
    steps,
  };
}

// @route POST /api/treatment-plans  (dentist)
exports.createPlan = catchAsync(async (req, res, next) => {
  const dentist = await Dentist.findOne({ user: req.user._id });
  if (!dentist) return next(new AppError('Dentist profile not found.', 404));

  const { patientId, title, notes, steps, followUpRequired, followUpDate } = req.body;

  const treatmentIds = (steps || []).map((s) => s.treatment).filter(Boolean);
  const treatments = treatmentIds.length > 0 ? await Treatment.find({ _id: { $in: treatmentIds } }) : [];
  const treatmentMap = new Map(treatments.map((t) => [String(t._id), t]));

  const enrichedSteps = (steps || []).map((s) => {
    const t = s.treatment ? treatmentMap.get(String(s.treatment)) : null;
    const cost = s.cost !== undefined ? Number(s.cost) : (t?.defaultCost || 0);
    return {
      ...s,
      name: s.name || t?.name || 'Dental Procedure',
      cost,
      defaultCost: s.defaultCost !== undefined ? Number(s.defaultCost) : (t?.defaultCost || cost),
      toothNumbers: Array.isArray(s.toothNumbers) ? s.toothNumbers.map(Number) : (Array.isArray(s.teeth) ? s.teeth.map(Number) : []),
    };
  });

  const totalEstimatedCost = enrichedSteps.reduce((sum, s) => sum + (s.cost || 0), 0);

  const plan = await TreatmentPlan.create({
    patient: patientId,
    dentist: dentist._id,
    title,
    notes,
    steps: enrichedSteps,
    totalEstimatedCost,
    followUpRequired: Boolean(followUpRequired),
    followUpDate: followUpDate || null,
  });

  const populated = await TreatmentPlan.findById(plan._id)
    .populate({ path: 'dentist', populate: { path: 'user', select: 'name profilePhoto' }, options: { strictPopulate: false } })
    .populate({ path: 'steps.treatment', options: { strictPopulate: false } });

  await notify({
    userId: patientId,
    title: 'Treatment Plan Created',
    message: `Your dentist has created a treatment plan: "${title}".`,
    type: 'treatment_plan_created',
    relatedId: plan._id,
  });

  success(res, 201, 'Treatment plan created.', serializeTreatmentPlan(populated || plan));
});

// @route GET /api/treatment-plans/me  (patient)
exports.getMyPlans = catchAsync(async (req, res) => {
  const plans = await TreatmentPlan.find({ patient: req.user._id })
    .populate({ path: 'dentist', populate: { path: 'user', select: 'name profilePhoto' }, options: { strictPopulate: false } })
    .populate({ path: 'steps.treatment', options: { strictPopulate: false } })
    .sort('-createdAt');
  success(res, 200, 'Treatment plans fetched.', plans.map(serializeTreatmentPlan));
});

// @route GET /api/treatment-plans/patient/:patientId  (dentist/receptionist)
exports.getPatientPlans = catchAsync(async (req, res) => {
  const plans = await TreatmentPlan.find({ patient: req.params.patientId })
    .populate({ path: 'dentist', populate: { path: 'user', select: 'name profilePhoto' }, options: { strictPopulate: false } })
    .populate({ path: 'steps.treatment', options: { strictPopulate: false } })
    .sort('-createdAt');
  success(res, 200, 'Treatment plans fetched.', plans.map(serializeTreatmentPlan));
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

  const refreshed = await TreatmentPlan.findById(plan._id)
    .populate({ path: 'dentist', populate: { path: 'user', select: 'name profilePhoto' }, options: { strictPopulate: false } })
    .populate({ path: 'steps.treatment', options: { strictPopulate: false } });

  await notify({
    userId: plan.patient,
    title: 'Treatment Updated',
    message: `A step in your treatment plan "${plan.title}" is now ${status}.`,
    type: 'treatment_updated',
    relatedId: plan._id,
  });

  success(res, 200, 'Step updated.', serializeTreatmentPlan(refreshed || plan));
});