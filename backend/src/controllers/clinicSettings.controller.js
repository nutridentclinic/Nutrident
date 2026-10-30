const ClinicSettings = require('../models/ClinicSettings');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');

exports.getSettings = catchAsync(async (req, res) => {
  let settings = await ClinicSettings.findById('default');
  if (!settings) settings = await ClinicSettings.create({ _id: 'default' });
  success(res, 200, 'Settings fetched.', settings);
});

exports.updateSettings = catchAsync(async (req, res) => {
  const payload = { ...req.body };
  delete payload.platformFee;
  const settings = await ClinicSettings.findByIdAndUpdate('default', payload, {
    new: true,
    upsert: true,
    runValidators: true,
  });
  success(res, 200, 'Settings updated.', settings);
});