const MedicalRecord = require('../models/MedicalRecord');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');

// @route POST /api/medical-records  (dentist/patient uploads a file - multipart/form-data, field "file")
exports.uploadRecord = catchAsync(async (req, res, next) => {
  if (!req.file) return next(new AppError('A file is required.', 400));

  const { patientId, type, title, description, appointmentId } = req.body;
  const targetPatient = req.user.role === 'patient' ? req.user._id : patientId;
  if (!targetPatient) return next(new AppError('patientId is required.', 400));

  const record = await MedicalRecord.create({
    patient: targetPatient,
    uploadedBy: req.user._id,
    type: type || 'other',
    title,
    description,
    file: { url: req.file.path, publicId: req.file.filename },
    relatedAppointment: appointmentId || null,
  });

  success(res, 201, 'Medical record uploaded.', record);
});

// @route GET /api/medical-records/me  (patient)
exports.getMyRecords = catchAsync(async (req, res) => {
  const { type } = req.query;
  const filter = { patient: req.user._id };
  if (type) filter.type = type;
  const records = await MedicalRecord.find(filter).sort('-createdAt');
  success(res, 200, 'Medical records fetched.', records);
});

// @route GET /api/medical-records/patient/:patientId  (dentist/receptionist/admin)
exports.getPatientRecords = catchAsync(async (req, res) => {
  const records = await MedicalRecord.find({ patient: req.params.patientId }).sort('-createdAt');
  success(res, 200, 'Medical records fetched.', records);
});

// @route DELETE /api/medical-records/:id
exports.deleteRecord = catchAsync(async (req, res, next) => {
  const record = await MedicalRecord.findById(req.params.id);
  if (!record) return next(new AppError('Record not found.', 404));

  const isOwnerOrUploader = record.patient.equals(req.user._id) || record.uploadedBy.equals(req.user._id);
  if (!isOwnerOrUploader && !['admin'].includes(req.user.role)) {
    return next(new AppError('You do not have permission to delete this record.', 403));
  }

  // NOTE: also delete from Cloudinary using record.file.publicId via cloudinary.uploader.destroy()
  await record.deleteOne();
  success(res, 200, 'Medical record deleted.');
});