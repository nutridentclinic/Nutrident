const multer = require('multer');
const { makeStorage, isCloudinaryConfigured, getNormalizedCloudinaryConfig } = require('../config/cloudinary');
const AppError = require('../utils/appError');
const logger = require('../utils/logger');

const FRIENDLY_UPLOAD_ERROR = 'Uploads are temporarily unavailable. Please try again later or contact the clinic.';

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Unsupported file type. Only JPG, PNG, WEBP, PDF allowed.', 400), false);
  }
};

// folder: 'profile-photos' | 'xrays' | 'prescriptions' | 'medical-records' | 'reports'
const upload = (folder) => ({
  single: (fieldName) => (req, res, next) => {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return next();
    }

    if (!isCloudinaryConfigured()) {
      const conf = getNormalizedCloudinaryConfig();
      logger.warn(`Upload rejected: Cloudinary is not configured on the server (missing: ${conf.missing.join(', ')})`);
      return next(new AppError(FRIENDLY_UPLOAD_ERROR, 503));
    }

    let storage;
    try {
      storage = makeStorage(folder);
    } catch (err) {
      logger.error(`Failed to initialize storage: ${err.message}`);
      return next(new AppError(FRIENDLY_UPLOAD_ERROR, 503));
    }

    const multerHandler = multer({
      storage,
      fileFilter,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }).single(fieldName);

    multerHandler(req, res, (err) => {
      if (!err) return next();

      if (err instanceof AppError) {
        return next(err);
      }

      if (err.name === 'MulterError') {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('File size exceeds the 10 MB limit.', 400));
        }
        return next(new AppError(`Upload error: ${err.message}`, 400));
      }

      const msg = String(err.message || '');
      const code = String(err.code || '');
      const httpCode = err.http_code;

      // Case 1: Cloudinary rejected credentials
      const isAuthError =
        httpCode === 401 ||
        httpCode === 403 ||
        msg.includes('Invalid cloud_name') ||
        msg.includes('Invalid Signature') ||
        msg.includes('Must supply api_key') ||
        msg.includes('Invalid API key') ||
        msg.includes('disabled');

      if (isAuthError) {
        logger.error(`Cloudinary authentication failed: ${msg} (status: ${httpCode || 'unknown'})`);
        return next(new AppError(FRIENDLY_UPLOAD_ERROR, 503));
      }

      // Case 2: Cloudinary unreachable or timed out
      const isNetworkError =
        code === 'ENOTFOUND' ||
        code === 'ECONNREFUSED' ||
        code === 'ETIMEDOUT' ||
        code === 'ESOCKETTIMEDOUT' ||
        msg.includes('timeout') ||
        msg.includes('Network Error');

      if (isNetworkError) {
        logger.error(`Cloudinary network connection failed: ${msg} (code: ${code})`);
        return next(new AppError(FRIENDLY_UPLOAD_ERROR, 503));
      }

      // Other Cloudinary / server upload failure
      logger.error(`Cloudinary upload failed: ${msg}`);
      return next(new AppError(FRIENDLY_UPLOAD_ERROR, 503));
    });
  },
});

module.exports = upload;