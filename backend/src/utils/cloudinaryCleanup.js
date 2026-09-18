const cloudinary = require('cloudinary').v2;
const logger = require('./logger');

/**
 * Deletes a file from Cloudinary given its publicId. Cloudinary requires the correct
 * resource_type to delete something - 'image' covers photos AND PDFs (Cloudinary treats
 * PDFs as image-type resources so it can render page previews), 'raw' covers everything
 * else. We try 'image' first since that covers the vast majority of what this app
 * uploads (photos, X-rays, PDFs), then fall back to 'raw'.
 * Never throws - a failed Cloudinary cleanup should never block the DB operation that
 * triggered it, so this just logs a warning on failure.
 */
const deleteCloudinaryFile = async (publicId) => {
  if (!publicId) return;
  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    if (result.result === 'not found') {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
    }
  } catch (err) {
    logger.warn(`Cloudinary cleanup failed for ${publicId}: ${err.message}`);
  }
};

module.exports = { deleteCloudinaryFile };