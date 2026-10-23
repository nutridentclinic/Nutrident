const DentalChart = require('../models/DentalChart');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');
const { FDI_TEETH, CONDITIONS } = require('../validators/dentalChart.validator');

// @route GET /api/dental-charts/:patientId
exports.getChart = catchAsync(async (req, res, next) => {
  // A patient can only view their own chart; staff roles can view any.
  if (req.user.role === 'patient' && req.params.patientId !== String(req.user._id)) {
    return next(new AppError('You do not have access to this dental chart.', 403));
  }

  const patientExists = await User.findOne({ _id: req.params.patientId, role: 'patient' });
  if (!patientExists) {
    return next(new AppError('Patient not found.', 404));
  }

  let chart = await DentalChart.findOne({ patient: req.params.patientId });
  if (!chart) {
    chart = await DentalChart.create({ patient: req.params.patientId, teeth: [] });
  }
  success(res, 200, 'Dental chart fetched.', chart);
});

// @route PATCH /api/dental-charts/:patientId/tooth/:toothNumber  (dentist updates one tooth)
exports.updateTooth = catchAsync(async (req, res, next) => {
  const { patientId, toothNumber } = req.params;
  const { condition, notes } = req.body;

  const patientExists = await User.findOne({ _id: patientId, role: 'patient' });
  if (!patientExists) {
    return next(new AppError('Patient not found.', 404));
  }

  const num = Number(toothNumber);
  if (!FDI_TEETH.includes(num)) {
    return next(new AppError('Invalid FDI tooth number. Must be one of 11-18, 21-28, 31-38, 41-48.', 400));
  }
  if (condition && !CONDITIONS.includes(condition)) {
    return next(new AppError(`Invalid condition. Must be one of: ${CONDITIONS.join(', ')}`, 400));
  }

  let chart = await DentalChart.findOne({ patient: patientId });
  if (!chart) chart = await DentalChart.create({ patient: patientId, teeth: [] });

  const toothIndex = chart.teeth.findIndex((t) => t.toothNumber === num);
  const toothData = { toothNumber: num, condition: condition || 'healthy', notes: notes || '', updatedAt: new Date(), updatedBy: req.user._id };

  if (toothIndex > -1) chart.teeth[toothIndex] = toothData;
  else chart.teeth.push(toothData);

  await chart.save();
  success(res, 200, 'Tooth condition updated.', chart);
});