const multer = require('multer');
const { uploadToCloudinary, isCloudinaryConfigured, getNormalizedCloudinaryConfig } = require('../config/cloudinary');
const AppError = require('../utils/appError');
const logger = require('../utils/logger');

const FRIENDLY_UPLOAD_ERROR = 'Uploads are temporarily unavailable. Please try again later or contact the clinic.';

function detectMagicBytes(buffer) {
  if (!buffer || buffer.length < 4) return null;

  // PDF: %PDF- (25 50 44 46)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return { mime: 'application/pdf', ext: 'pdf' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }

  // WEBP: RIFF....WEBP (52 49 46 46 .... 57 45 42 50)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }

  return null;
}

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// folder: 'profile-photos' | 'xrays' | 'medical-records' | 'reports'
const upload = (folder) => ({
  single: (fieldName) => (req, res, next) => {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return next();
    }

    memoryUpload.single(fieldName)(req, res, async (err) => {
      if (err) {
        if (err.name === 'MulterError') {
          if (err.code === 'LIMIT_FILE_SIZE') {
            const sizeErr = new AppError('File size exceeds the 10 MB limit.', 400);
            sizeErr.code = 'UPLOAD_TOO_LARGE';
            return next(sizeErr);
          }
          const multerErr = new AppError(`Upload error: ${err.message}`, 400);
          multerErr.code = 'UPLOAD_FAILED';
          return next(multerErr);
        }
        return next(err);
      }

      // If no file was attached to this request
      if (!req.file) {
        return next();
      }

      // 1. Check Cloudinary configuration first
      if (!isCloudinaryConfigured()) {
        const conf = getNormalizedCloudinaryConfig();
        logger.warn(`Upload rejected: Cloudinary is not configured on the server (missing: ${conf.missing.join(', ')})`);
        const confErr = new AppError(FRIENDLY_UPLOAD_ERROR, 503);
        confErr.code = 'UPLOAD_NOT_CONFIGURED';
        return next(confErr);
      }

      // 2. Size verification
      if (req.file.size > 10 * 1024 * 1024) {
        const sizeErr = new AppError('File size exceeds the 10 MB limit.', 400);
        sizeErr.code = 'UPLOAD_TOO_LARGE';
        return next(sizeErr);
      }

      // 3. Real magic bytes validation (magic bytes must match JPG, PNG, WEBP, or PDF)
      const detected = detectMagicBytes(req.file.buffer);
      if (!detected) {
        const typeErr = new AppError('Unsupported file type. Only JPG, PNG, WEBP, PDF allowed.', 400);
        typeErr.code = 'UPLOAD_BAD_TYPE';
        return next(typeErr);
      }

      // 4. Upload buffer to Cloudinary
      try {
        const result = await uploadToCloudinary(req.file.buffer, {
          folder,
          resource_type: detected.mime === 'application/pdf' ? 'auto' : 'image',
        });

        // Set req.file properties so controllers need zero changes
        req.file.path = result.url;
        req.file.filename = result.publicId;
        req.file.url = result.url;
        req.file.publicId = result.publicId;
        req.file.bytes = result.bytes || req.file.size;
        req.file.format = result.format || detected.ext;
        req.file.detectedMime = detected.mime;
        req.file.resourceType = result.resourceType || (detected.mime === 'application/pdf' ? 'auto' : 'image');
        req.file.originalName = req.file.originalname || '';

        return next();
      } catch (uploadErr) {
        const msg = String(uploadErr.message || '');
        const code = String(uploadErr.code || '');
        const httpCode = uploadErr.http_code;
        const name = uploadErr.name || 'CloudinaryError';

        logger.error(`Cloudinary upload failed: [${name}] ${msg} (http_code: ${httpCode || 'none'}, code: ${code})`, {
          error: uploadErr.stack || uploadErr,
        });

        const appErr = new AppError(FRIENDLY_UPLOAD_ERROR, 503);
        if (httpCode === 401 || httpCode === 403 || /unauthorized|invalid api_key|must supply/i.test(msg)) {
          appErr.code = 'UPLOAD_AUTH_FAILED';
        } else if (/timeout|timed out|enotfound|econnrefused|unreachable/i.test(msg)) {
          appErr.code = 'UPLOAD_UNREACHABLE';
        } else {
          appErr.code = 'UPLOAD_FAILED';
        }
        return next(appErr);
      }
    });
  },
});

module.exports = upload;