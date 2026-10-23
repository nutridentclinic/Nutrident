const { cloudinary, isCloudinaryConfigured } = require('../config/cloudinary');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');

// @route GET /api/admin/system-status (admin only)
exports.getSystemStatus = catchAsync(async (req, res) => {
  let cloudinaryPing = 'not_configured';

  if (isCloudinaryConfigured()) {
    try {
      const pingResult = await Promise.race([
        cloudinary.api.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
      ]);
      if (pingResult && pingResult.status === 'ok') {
        cloudinaryPing = 'ok';
      } else {
        cloudinaryPing = 'unauthorized';
      }
    } catch (err) {
      const msg = String(err?.message || '');
      const httpCode = err?.http_code;
      if (httpCode === 401 || httpCode === 403 || msg.includes('Invalid') || msg.includes('Must supply')) {
        cloudinaryPing = 'unauthorized';
      } else {
        cloudinaryPing = 'unreachable';
      }
    }
  }

  const brevoKey = process.env.BREVO_API_KEY || '';
  const emailConfigured = !!(brevoKey && !brevoKey.includes('replace') && brevoKey.length > 5);

  const rzpKey = process.env.RAZORPAY_KEY_ID || '';
  const rzpSec = process.env.RAZORPAY_KEY_SECRET || '';
  const paymentsConfigured = !!(rzpKey && rzpSec && !rzpKey.includes('replace') && !rzpSec.includes('replace'));

  const agoraId = process.env.AGORA_APP_ID || '';
  const agoraCert = process.env.AGORA_APP_CERTIFICATE || '';
  const videoConfigured = !!(agoraId && agoraCert && !agoraId.includes('replace') && !agoraCert.includes('replace'));

  const uploads = isCloudinaryConfigured() && cloudinaryPing === 'ok';

  success(res, 200, 'System status fetched.', {
    uploads,
    email: emailConfigured,
    payments: paymentsConfigured,
    video: videoConfigured,
    cloudinaryPing,
  });
});
