const multer = require('multer');
const { makeStorage } = require('../config/cloudinary');

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Unsupported file type. Only JPG, PNG, WEBP, PDF allowed.'), false);
};

// folder: 'profile-photos' | 'xrays' | 'prescriptions' | 'medical-records' | 'reports'
const upload = (folder) =>
  multer({
    storage: makeStorage(folder),
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  });

module.exports = upload;