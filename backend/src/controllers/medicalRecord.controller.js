const MedicalRecord = require('../models/MedicalRecord');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');
const { deleteCloudinaryFile } = require('../utils/cloudinaryCleanup');
const { cloudinary, isCloudinaryConfigured } = require('../config/cloudinary');
const logger = require('../utils/logger');

function detectMimeFromBuffer(buffer, fallbackMime) {
  if (buffer && buffer.length >= 4) {
    // PDF: %PDF
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      return 'application/pdf';
    }
    // PNG
    if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return 'image/png';
    }
    // JPEG
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }
    // WEBP
    if (
      buffer.length >= 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
    ) {
      return 'image/webp';
    }
  }
  return fallbackMime || 'application/octet-stream';
}

// @route POST /api/medical-records  (dentist/patient uploads a file - multipart/form-data, field "file")
exports.uploadRecord = catchAsync(async (req, res, next) => {
  if (!req.file) return next(new AppError('A file is required.', 400));

  const { patientId, type, title, description, appointmentId } = req.body;
  const targetPatient = req.user.role === 'patient' ? req.user._id : patientId;
  if (!targetPatient) {
    if (req.file.filename) await deleteCloudinaryFile(req.file.filename);
    return next(new AppError('patientId is required.', 400));
  }

  try {
    const ext = req.file.format || (req.file.detectedMime === 'application/pdf' ? 'pdf' : '');
    const mimeType = req.file.detectedMime || req.file.mimetype || (ext === 'pdf' ? 'application/pdf' : 'application/octet-stream');

    const record = await MedicalRecord.create({
      patient: targetPatient,
      uploadedBy: req.user._id,
      type: type || 'other',
      title,
      description,
      file: {
        url: req.file.path || req.file.url,
        publicId: req.file.filename || req.file.publicId,
        resourceType: req.file.resourceType || 'image',
        format: ext,
        mimeType: mimeType,
        bytes: req.file.bytes || req.file.size || 0,
        originalName: req.file.originalName || req.file.originalname || '',
      },
      relatedAppointment: appointmentId || null,
    });

    success(res, 201, 'Medical record uploaded.', record);
  } catch (err) {
    if (req.file.filename) await deleteCloudinaryFile(req.file.filename);
    throw err;
  }
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

// @route GET /api/medical-records/:id/file
exports.getRecordFile = catchAsync(async (req, res, next) => {
  const record = await MedicalRecord.findById(req.params.id);
  if (!record) return next(new AppError('Record not found.', 404));

  const isPatientOwner = req.user.role === 'patient' && record.patient.toString() === req.user._id.toString();
  const isStaff = ['dentist', 'receptionist', 'admin'].includes(req.user.role);
  if (!isPatientOwner && !isStaff) {
    return next(new AppError('You do not have access to this medical record.', 403));
  }

  if (!record.file?.url) {
    return next(new AppError('File URL not found.', 404));
  }

  if (req.query.format === 'json') {
    return success(res, 200, 'File details fetched.', {
      url: record.file.url,
      publicId: record.file.publicId,
      title: record.title,
      type: record.type,
      resourceType: record.file.resourceType || 'image',
      format: record.file.format || '',
      mimeType: record.file.mimeType || '',
      bytes: record.file.bytes || 0,
      originalName: record.file.originalName || '',
    });
  }

  let targetUrl = record.file.url;
  // If Cloudinary is configured and we have a publicId, build a signed URL
  if (isCloudinaryConfigured() && record.file.publicId) {
    try {
      const signed = cloudinary.url(record.file.publicId, {
        sign_url: true,
        secure: true,
        resource_type: record.file.resourceType || 'image',
        format: record.file.format || undefined,
      });
      if (signed) targetUrl = signed;
    } catch {
      targetUrl = record.file.url;
    }
  }

  let upstreamRes;
  try {
    upstreamRes = await fetch(targetUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    // If signed URL failed and differed from stored URL, fallback to stored URL
    if (!upstreamRes.ok && targetUrl !== record.file.url) {
      const fallbackRes = await fetch(record.file.url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });
      if (fallbackRes.ok) {
        upstreamRes = fallbackRes;
      }
    }
  } catch (err) {
    logger.error(`Upstream file fetch failed or timed out: ${err.message}`);
    return res.status(502).json({
      success: false,
      message: 'Storage provider connection timed out or is unreachable.',
    });
  }

  if (!upstreamRes || !upstreamRes.ok) {
    logger.error(`Upstream storage returned error ${upstreamRes?.status} for record ${record._id}`);
    return res.status(502).json({
      success: false,
      message: 'Unable to retrieve file from storage provider. Upstream returned an error.',
      upstreamStatus: upstreamRes?.status || 502,
    });
  }

  const arrayBuffer = await upstreamRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Check magic bytes / content-type validation
  let mimeType = record.file?.mimeType;
  if (!mimeType || mimeType === 'application/octet-stream') {
    mimeType = detectMimeFromBuffer(buffer, record.file?.mimeType);
  }
  // If buffer has PDF magic bytes '%PDF' (0x25, 0x50, 0x44, 0x46), ensure it's application/pdf
  if (buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    mimeType = 'application/pdf';
  }

  // Reject if expected PDF but returned HTML error page
  if (
    (mimeType === 'application/pdf' || record.file?.format === 'pdf') &&
    buffer.slice(0, 100).toString().toLowerCase().includes('<html')
  ) {
    logger.error(`Upstream storage returned HTML error page instead of PDF for record ${record._id}`);
    return res.status(502).json({
      success: false,
      message: 'Storage provider returned an invalid HTML response instead of the requested PDF.',
    });
  }

  const isDownload = req.query.download === '1' || req.query.download === 'true';
  const extension = record.file?.format || (mimeType === 'application/pdf' ? 'pdf' : 'bin');
  const fallbackName = `${(record.title || 'medical-record').replace(/[^a-zA-Z0-9_-]/g, '_')}.${extension}`;
  const rawFileName = record.file?.originalName || fallbackName;
  const safeFileName = rawFileName.replace(/["\r\n\\]/g, '_');
  const disposition = isDownload ? 'attachment' : 'inline';

  res.setHeader('Content-Type', mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${disposition}; filename="${safeFileName}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Content-Length', buffer.length);

  return res.status(200).send(buffer);
});

// @route DELETE /api/medical-records/:id
exports.deleteRecord = catchAsync(async (req, res, next) => {
  const record = await MedicalRecord.findById(req.params.id);
  if (!record) return next(new AppError('Record not found.', 404));

  const isOwnerOrUploader = record.patient.equals(req.user._id) || record.uploadedBy.equals(req.user._id);
  if (!isOwnerOrUploader && !['admin'].includes(req.user.role)) {
    return next(new AppError('You do not have permission to delete this record.', 403));
  }

  await record.deleteOne();
  if (record.file?.publicId) {
    await deleteCloudinaryFile(record.file.publicId);
  }
  success(res, 200, 'Medical record deleted.');
});
