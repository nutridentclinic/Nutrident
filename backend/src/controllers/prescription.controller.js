const Prescription = require('../models/Prescription');
const Dentist = require('../models/Dentist');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');
const { notify } = require('../services/notification.service');
const { generatePrescriptionPDF } = require('../services/pdf.service');

// @route POST /api/prescriptions  (dentist creates)
exports.createPrescription = catchAsync(async (req, res, next) => {
  const dentist = await Dentist.findOne({ user: req.user._id });
  if (!dentist) return next(new AppError('Dentist profile not found.', 404));

  const { patientId, appointmentId, diagnosis, medicines, additionalNotes, followUpDate } = req.body;

  const patient = await User.findById(patientId);
  if (!patient || patient.role !== 'patient') {
    return next(new AppError('Patient not found.', 404));
  }

  if (appointmentId) {
    const appt = await Appointment.findById(appointmentId);
    if (!appt) return next(new AppError('Appointment not found.', 404));
  }

  const prescription = await Prescription.create({
    patient: patientId,
    dentist: dentist._id,
    appointment: appointmentId || null,
    diagnosis: diagnosis || '',
    medicines,
    additionalNotes: additionalNotes || '',
    followUpDate: followUpDate || null,
    status: 'active',
  });

  await notify({
    userId: patientId,
    title: 'Prescription Ready',
    message: 'Your dentist has issued a new prescription. View it in your medical records.',
    type: 'prescription_ready',
    relatedId: prescription._id,
    link: '/app/prescriptions',
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
  const prescriptions = await Prescription.find({ patient: req.params.patientId })
    .populate({ path: 'dentist', populate: { path: 'user', select: 'name' } })
    .sort('-createdAt');
  success(res, 200, 'Prescriptions fetched.', prescriptions);
});

// @route GET /api/prescriptions/:id
exports.getPrescriptionById = catchAsync(async (req, res, next) => {
  const prescription = await Prescription.findById(req.params.id)
    .populate('patient', 'name phone email')
    .populate({ path: 'dentist', populate: { path: 'user', select: 'name email phone' } });
  if (!prescription) return next(new AppError('Prescription not found.', 404));

  const patientId = prescription.patient?._id ? prescription.patient._id.toString() : prescription.patient.toString();
  if (req.user.role === 'patient' && patientId !== req.user._id.toString()) {
    return next(new AppError('You do not have access to this prescription.', 403));
  }

  success(res, 200, 'Prescription fetched.', prescription);
});

// @route PATCH /api/prescriptions/:id/void  (dentist or admin voids)
exports.voidPrescription = catchAsync(async (req, res, next) => {
  const { reason } = req.body;
  const prescription = await Prescription.findById(req.params.id);
  if (!prescription) return next(new AppError('Prescription not found.', 404));

  if (prescription.status === 'voided') {
    return next(new AppError('Prescription is already voided.', 400));
  }

  if (req.user.role === 'dentist') {
    const dentist = await Dentist.findOne({ user: req.user._id });
    if (!dentist || !prescription.dentist.equals(dentist._id)) {
      return next(new AppError('You can only void your own prescriptions.', 403));
    }
  }

  prescription.status = 'voided';
  prescription.voidReason = reason || 'Voided by prescriber';
  prescription.voidedAt = new Date();
  prescription.voidedBy = req.user._id;
  await prescription.save();

  success(res, 200, 'Prescription voided.', prescription);
});

// @route GET /api/prescriptions/:id/pdf  - streams a PDF download of the prescription
exports.downloadPrescriptionPDF = catchAsync(async (req, res, next) => {
  const prescription = await Prescription.findById(req.params.id)
    .populate('patient', 'name phone email')
    .populate({ path: 'dentist', populate: { path: 'user', select: 'name email phone' } });
  if (!prescription) return next(new AppError('Prescription not found.', 404));

  if (req.user.role === 'patient' && !prescription.patient._id.equals(req.user._id)) {
    return next(new AppError('You do not have access to this prescription.', 403));
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="prescription-${prescription._id}.pdf"`);
  await generatePrescriptionPDF(prescription, res);
});
