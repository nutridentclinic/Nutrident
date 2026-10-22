const multer = require('multer');
const { makeStorage } = require('../config/cloudinary');
const AppError = require('../utils/appError');

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new AppError('Unsupported file type. Only JPG, PNG, WEBP, PDF allowed.', 400), false);
};

const isCloudinaryConfigured = () => {
  const name = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!name || !key || !secret) return false;
  if (name.includes('replace') || key.includes('replace') || secret.includes('replace')) return false;
  // Cloudinary cloud_name must be lowercase alphanumeric, underscores, hyphens
  if (!/^[a-z0-9_-]+$/.test(name)) return false;
  return true;
};

// folder: 'profile-photos' | 'xrays' | 'prescriptions' | 'medical-records' | 'reports'
const upload = (folder) => ({
  single: (fieldName) => (req, res, next) => {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return next();
    }

    if (!isCloudinaryConfigured()) {
      return next(new AppError('File upload service is not configured on the server yet.', 503));
    }

    let storage;
    try {
      storage = makeStorage(folder);
    } catch {
      return next(new AppError('File upload service is not configured on the server yet.', 503));
    }

    const multerHandler = multer({
      storage,
      fileFilter,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }).single(fieldName);

    multerHandler(req, res, (err) => {
      if (err) {
        if (err.name === 'MulterError') {
          return next(new AppError(`Upload error: ${err.message}`, 400));
        }
        if (err.message && (err.message.includes('cloud_name') || err.message.includes('Cloudinary') || err.http_code === 500)) {
          return next(new AppError('File upload service is currently unavailable. Please verify cloud storage configuration.', 503));
        }
        return next(err instanceof AppError ? err : new AppError(err.message || 'File upload failed.', 400));
      }
      next();
    });
  },
});

module.exports = upload;