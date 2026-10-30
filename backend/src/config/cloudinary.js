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
  let str = String(val).replace(/[\r\n]/g, '').trim();
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
    missing.push('CLOUDINARY_CLOUD_NAME');
  } else if (!/^[A-Za-z0-9_-]+$/.test(cloud_name)) {
    missing.push('CLOUDINARY_CLOUD_NAME (invalid format, must match /^[A-Za-z0-9_-]+$/)');
  }

  if (!api_key || isPlaceholder(api_key)) {
    missing.push('CLOUDINARY_API_KEY');
  }

  if (!api_secret || isPlaceholder(api_secret)) {
    missing.push('CLOUDINARY_API_SECRET');
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

    if (uploadStream && typeof uploadStream.on === 'function') {
      uploadStream.on('error', () => {});
    }

    if (uploadStream && typeof uploadStream.end === 'function') {
      uploadStream.end(buffer);
    }
  });
}

async function pingCloudinary() {
  const conf = applyCloudinaryConfig();
  if (!conf.isConfigured) {
    return {
      configured: false,
      reachable: false,
      cloudName: conf.cloud_name || null,
      missing: conf.missing,
      pingStatus: 'not_configured',
      reason: `Missing configuration (${conf.missing.join(', ')})`,
    };
  }

  const attemptPing = () =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Cloudinary ping timed out')), 10000);
      cloudinary.api
        .ping()
        .then((res) => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });

  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await attemptPing();
      if (res && (res.status === 'ok' || res.status === 200)) {
        return {
          configured: true,
          reachable: true,
          cloudName: conf.cloud_name,
          missing: [],
          pingStatus: 'ok',
          reason: null,
        };
      }
      return {
        configured: true,
        reachable: false,
        cloudName: conf.cloud_name,
        missing: [],
        pingStatus: 'unauthorized',
        reason: `Unexpected ping response: ${JSON.stringify(res)}`,
      };
    } catch (err) {
      lastErr = err;
      const errMsg = String(err.message || '');
      const httpCode = err.http_code;
      if (httpCode === 401 || httpCode === 403 || /unauthorized|invalid api_key|must supply/i.test(errMsg)) {
        return {
          configured: true,
          reachable: false,
          cloudName: conf.cloud_name,
          missing: [],
          pingStatus: 'unauthorized',
          reason: errMsg || 'Cloudinary credentials rejected (check cloud name, key or secret)',
        };
      }
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  return {
    configured: true,
    reachable: false,
    cloudName: conf.cloud_name,
    missing: [],
    pingStatus: 'unreachable',
    reason: lastErr?.message || 'Cloudinary unreachable after retry',
  };
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