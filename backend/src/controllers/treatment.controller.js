const Treatment = require('../models/Treatment');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');

// Master catalog CRUD (admin) - used when building treatment plans / invoices
exports.createTreatment = catchAsync(async (req, res) => {
  const treatment = await Treatment.create(req.body);
  success(res, 201, 'Treatment added to catalog.', treatment);
});

exports.getTreatments = catchAsync(async (req, res) => {
  const treatments = await Treatment.find({ isActive: true }).sort('name');
  success(res, 200, 'Treatments fetched.', treatments);
});

exports.updateTreatment = catchAsync(async (req, res, next) => {
  const treatment = await Treatment.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!treatment) return next(new AppError('Treatment not found.', 404));
  success(res, 200, 'Treatment updated.', treatment);
});

exports.deleteTreatment = catchAsync(async (req, res, next) => {
  const treatment = await Treatment.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!treatment) return next(new AppError('Treatment not found.', 404));
  success(res, 200, 'Treatment removed from catalog.');
});