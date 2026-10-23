const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const logger = require('../utils/logger');

const EXACT_PLACEHOLDERS = new Set([
  'replace-me',
  'replace_me',
  'replaceme',
  'your_cloud_name',
  'your-cloud-name',
  'your_api_key',
  'your-api-key',
  'your_api_secret',
  'your-api-secret',
  'replace-with-cloudinary-secret',
]);

function normalizeValue(val) {
  if (val === undefined || val === null) return '';
  let str = String(val).trim();
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1).trim();
  }
  return str;
}

function isPlaceholder(val) {
  if (!val) return true;
  return EXACT_PLACEHOLDERS.has(val.toLowerCase());
}

function getNormalizedCloudinaryConfig() {
  const cloud_name = normalizeValue(process.env.CLOUDINARY_CLOUD_NAME);
  const api_key = normalizeValue(process.env.CLOUDINARY_API_KEY);
  const api_secret = normalizeValue(process.env.CLOUDINARY_API_SECRET);

  const missing = [];
  if (!cloud_name || isPlaceholder(cloud_name)) {
    missing.push('NAME');
  } else if (!/^[A-Za-z0-9_-]+$/.test(cloud_name)) {
    missing.push('NAME_FORMAT');
  }

  if (!api_key || isPlaceholder(api_key)) {
    missing.push('KEY');
  }

  if (!api_secret || isPlaceholder(api_secret)) {
    missing.push('SECRET');
  }

  const isConfigured = missing.length === 0;

  return {
    cloud_name,
    api_key,
    api_secret,
    missing,
    isConfigured,
  };
}

function applyCloudinaryConfig() {
  const conf = getNormalizedCloudinaryConfig();
  if (conf.isConfigured) {
    cloudinary.config({
      cloud_name: conf.cloud_name,
      api_key: conf.api_key,
      api_secret: conf.api_secret,
      secure: true,
    });
  }
  return conf;
}

// Initial configuration
applyCloudinaryConfig();

let hasLoggedStartup = false;
function logCloudinaryStartup() {
  if (hasLoggedStartup) return;
  hasLoggedStartup = true;
  const current = getNormalizedCloudinaryConfig();
  if (current.isConfigured) {
    logger.info('Cloudinary: configured');
  } else {
    logger.warn(`Cloudinary: NOT configured (missing: ${current.missing.join(', ')})`);
  }
}

logCloudinaryStartup();

function isCloudinaryConfigured() {
  return getNormalizedCloudinaryConfig().isConfigured;
}

const makeStorage = (folder) => {
  const current = applyCloudinaryConfig();
  if (!current.isConfigured) {
    throw new Error('Cloudinary is not configured');
  }

  return new CloudinaryStorage({
    cloudinary,
    params: {
      folder: `dental_clinic/${folder}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'webp'],
      resource_type: 'auto',
    },
  });
};

module.exports = {
  cloudinary,
  makeStorage,
  normalizeValue,
  getNormalizedCloudinaryConfig,
  applyCloudinaryConfig,
  isCloudinaryConfigured,
  logCloudinaryStartup,
};