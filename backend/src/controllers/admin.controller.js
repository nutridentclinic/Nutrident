const { pingCloudinary } = require('../config/cloudinary');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');

// @route GET /api/admin/system-status (admin only)
exports.getSystemStatus = catchAsync(async (req, res) => {
  const cloudinaryStatus = await pingCloudinary();

  const brevoKey = process.env.BREVO_API_KEY || '';
  const emailConfigured = !!(brevoKey && !brevoKey.includes('replace') && brevoKey.length > 5);

  const rzpKey = process.env.RAZORPAY_KEY_ID || '';
  const rzpSec = process.env.RAZORPAY_KEY_SECRET || '';
  const paymentsConfigured = !!(rzpKey && rzpSec && !rzpKey.includes('replace') && !rzpSec.includes('replace'));

  const agoraId = process.env.AGORA_APP_ID || '';
  const agoraCert = process.env.AGORA_APP_CERTIFICATE || '';
  const videoConfigured = !!(agoraId && agoraCert && !agoraId.includes('replace') && !agoraCert.includes('replace'));

  const firebaseConfigured = !!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  const cloudinaryPing = !cloudinaryStatus.configured
    ? 'not_configured'
    : cloudinaryStatus.reachable
      ? 'ok'
      : (cloudinaryStatus.reason?.includes('401') || cloudinaryStatus.reason?.includes('Invalid') || cloudinaryStatus.reason?.includes('Must supply'))
        ? 'unauthorized'
        : 'unreachable';

  success(res, 200, 'System status fetched.', {
    uploads: cloudinaryStatus.configured && cloudinaryStatus.reachable,
    email: emailConfigured,
    payments: paymentsConfigured,
    video: videoConfigured,
    firebase: firebaseConfigured,
    cloudinaryPing,
    cloudinary: {
      configured: cloudinaryStatus.configured,
      reachable: cloudinaryStatus.reachable,
      cloudName: cloudinaryStatus.cloudName,
      reason: cloudinaryStatus.reason,
    },
    providers: {
      cloudinary: cloudinaryStatus,
      email: {
        configured: emailConfigured,
        reason: emailConfigured ? null : 'BREVO_API_KEY is not set or placeholder',
      },
      payments: {
        configured: paymentsConfigured,
        reason: paymentsConfigured ? null : 'RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET missing or placeholder',
      },
      video: {
        configured: videoConfigured,
        reason: videoConfigured ? null : 'AGORA_APP_ID or AGORA_APP_CERTIFICATE missing or placeholder',
      },
      firebase: {
        configured: firebaseConfigured,
        reason: firebaseConfigured ? null : 'FIREBASE_SERVICE_ACCOUNT_BASE64 missing',
      },
    },
  });
});
