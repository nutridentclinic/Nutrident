const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const validate = require('../middleware/validate.middleware');
const { protect } = require('../middleware/auth.middleware');
const { authLimiter } = require('../middleware/rateLimit.middleware');
const { registerRules, loginRules, otpRules, resetPasswordRules } = require('../validators/auth.validator');

router.post('/register', authLimiter, registerRules, validate, ctrl.register);
router.post('/verify-otp', authLimiter, otpRules, validate, ctrl.verifyOTP);
router.post('/resend-otp', authLimiter, ctrl.resendOTP);
router.post('/login', authLimiter, loginRules, validate, ctrl.login);
router.post('/refresh-token', ctrl.refreshToken);
router.post('/verify-phone', protect, ctrl.verifyPhone);
router.post('/forgot-password', authLimiter, ctrl.forgotPassword);
router.post('/reset-password/:token', authLimiter, resetPasswordRules, validate, ctrl.resetPassword);

router.get('/me', protect, ctrl.getMe);
router.patch('/update-password', protect, ctrl.updatePassword);

module.exports = router;