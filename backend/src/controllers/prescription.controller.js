const Prescription = require('../models/Prescription');
const Dentist = require('../models/Dentist');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');
const { notify } = require('../services/notification.service');
const { generatePrescriptionPDF } = require('../services/pdf.service');

// @route POST /api/prescriptions  (dentist creates)
exports.createPrescription = catchAsync(async (req, res, next) => {
  const dentist = await Dentist.findOne({ user: req.user._id });
  if (!dentist) return next(new AppError('Dentist profile not found.', 404));

  const { patientId, appointmentId, diagnosis, medicines, additionalNotes } = req.body;

  const prescription = await Prescription.create({
    patient: patientId,
    dentist: dentist._id,
    appointment: appointmentId || null,
    diagnosis,
    medicines,
    additionalNotes,
  });

  await notify({
    userId: patientId,
    title: 'Prescription Ready',
    message: 'Your dentist has issued a new prescription. View it in your medical records.',
    type: 'prescription_ready',
    relatedId: prescription._id,
  });

  success(res, 201, 'Prescription created.', prescription);
});

// @route GET /api/prescriptions/me  (patient)
exports.getMyPrescriptions = catchAsync(async (req, res) => {
  const prescriptions = await Prescription.find({ patient: req.user._id })
    .populate({ path: 'dentist', populate: { path: 'user', select: 'name' } })
    .sort('-createdAt');
  success(res, 200, 'Prescriptions fetched.', prescriptions);
});

// @route GET /api/prescriptions/patient/:patientId  (dentist/receptionist)
exports.getPatientPrescriptions = catchAsync(async (req, res) => {
  const prescriptions = await Prescription.find({ patient: req.params.patientId }).sort('-createdAt');
  success(res, 200, 'Prescriptions fetched.', prescriptions);
});

// @route GET /api/prescriptions/:id
exports.getPrescriptionById = catchAsync(async (req, res, next) => {
  const prescription = await Prescription.findById(req.params.id)
    .populate('patient', 'name phone')
    .populate({ path: 'dentist', populate: { path: 'user', select: 'name' } });
  if (!prescription) return next(new AppError('Prescription not found.', 404));
  success(res, 200, 'Prescription fetched.', prescription);
});

// @route GET /api/prescriptions/:id/pdf  - streams a PDF download of the prescription
exports.downloadPrescriptionPDF = catchAsync(async (req, res, next) => {
  const prescription = await Prescription.findById(req.params.id)
    .populate('patient', 'name phone')
    .populate({ path: 'dentist', populate: { path: 'user', select: 'name' } });
  if (!prescription) return next(new AppError('Prescription not found.', 404));

  if (req.user.role === 'patient' && !prescription.patient._id.equals(req.user._id)) {
    return next(new AppError('You do not have access to this prescription.', 403));
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="prescription-${prescription._id}.pdf"`);
  await generatePrescriptionPDF(prescription, res);
});