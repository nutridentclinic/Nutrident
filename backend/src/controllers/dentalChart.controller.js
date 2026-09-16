const DentalChart = require('../models/DentalChart');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');

// @route GET /api/dental-charts/:patientId
exports.getChart = catchAsync(async (req, res) => {
  let chart = await DentalChart.findOne({ patient: req.params.patientId });
  if (!chart) {
    chart = await DentalChart.create({ patient: req.params.patientId, teeth: [] });
  }
  success(res, 200, 'Dental chart fetched.', chart);
});

// @route PATCH /api/dental-charts/:patientId/tooth/:toothNumber  (dentist updates one tooth)
exports.updateTooth = catchAsync(async (req, res) => {
  const { patientId, toothNumber } = req.params;
  const { condition, notes } = req.body;

  let chart = await DentalChart.findOne({ patient: patientId });
  if (!chart) chart = await DentalChart.create({ patient: patientId, teeth: [] });

  const toothIndex = chart.teeth.findIndex((t) => t.toothNumber === Number(toothNumber));
  const toothData = { toothNumber: Number(toothNumber), condition, notes, updatedAt: new Date(), updatedBy: req.user._id };

  if (toothIndex > -1) chart.teeth[toothIndex] = toothData;
  else chart.teeth.push(toothData);

  await chart.save();
  success(res, 200, 'Tooth condition updated.', chart);
});