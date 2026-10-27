const cloudinary = require('cloudinary').v2;
const multer = require('multer');
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

function getNormalizedCloudinaryConfig(env = process.env) {
  const cloud_name = normalizeValue(env.CLOUDINARY_CLOUD_NAME);
  const api_key = normalizeValue(env.CLOUDINARY_API_KEY);
  const api_secret = normalizeValue(env.CLOUDINARY_API_SECRET);

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

function isCloudinaryConfigured() {
  return getNormalizedCloudinaryConfig().isConfigured;
}

function uploadToCloudinary(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const conf = applyCloudinaryConfig();
    if (!conf.isConfigured) {
      return reject(new Error('Cloudinary is not configured'));
    }

    const folder = options.folder ? `dental_clinic/${options.folder}` : 'dental_clinic';
    const uploadOptions = {
      folder,
      resource_type: options.resource_type || 'auto',
      ...options,
    };
    if (options.folder) {
      uploadOptions.folder = `dental_clinic/${options.folder}`;
    }

    const uploadStream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
      if (error) return reject(error);
      resolve({
        url: result.secure_url || result.url,
        publicId: result.public_id,
        bytes: result.bytes,
        format: result.format,
        resourceType: result.resource_type,
      });
    });

    uploadStream.end(buffer);
  });
}

async function pingCloudinary() {
  const conf = applyCloudinaryConfig();
  if (!conf.isConfigured) {
    return {
      configured: false,
      reachable: false,
      cloudName: conf.cloud_name || null,
      reason: `Missing configuration (${conf.missing.join(', ')})`,
    };
  }
  let timer;
  try {
    const res = await Promise.race([
      cloudinary.api.ping(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Cloudinary ping timed out')), 4000);
      }),
    ]);
    if (timer) clearTimeout(timer);
    if (res && (res.status === 'ok' || res.status === 200)) {
      return {
        configured: true,
        reachable: true,
        cloudName: conf.cloud_name,
        reason: null,
      };
    }
    return {
      configured: true,
      reachable: false,
      cloudName: conf.cloud_name,
      reason: `Unexpected ping response: ${JSON.stringify(res)}`,
    };
  } catch (err) {
    if (timer) clearTimeout(timer);
    return {
      configured: true,
      reachable: false,
      cloudName: conf.cloud_name,
      reason: err.message || 'Cloudinary unreachable',
    };
  }
}

let hasLoggedStartup = false;
async function logCloudinaryStartup() {
  if (hasLoggedStartup) return;
  hasLoggedStartup = true;
  const current = getNormalizedCloudinaryConfig();
  if (!current.isConfigured) {
    logger.warn(`Cloudinary: NOT configured (missing: ${current.missing.join(', ')})`);
    return;
  }
  try {
    const ping = await pingCloudinary();
    if (ping.reachable) {
      logger.info(`Cloudinary: reachable (cloud: ${ping.cloudName})`);
    } else {
      logger.warn(`Cloudinary: configured but unreachable: ${ping.reason} (cloud: ${ping.cloudName})`);
    }
  } catch (err) {
    logger.warn(`Cloudinary: startup ping failed: ${err.message}`);
  }
}

if (process.env.NODE_ENV !== 'test') {
  logCloudinaryStartup();
}

// Memory storage engine fallback
const makeStorage = () => multer.memoryStorage();

module.exports = {
  cloudinary,
  makeStorage,
  uploadToCloudinary,
  pingCloudinary,
  normalizeValue,
  getNormalizedCloudinaryConfig,
  applyCloudinaryConfig,
  isCloudinaryConfigured,
  logCloudinaryStartup,
};