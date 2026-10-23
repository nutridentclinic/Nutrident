const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const validate = require('../middleware/validate.middleware');
const { protect, optionalProtect } = require('../middleware/auth.middleware');
const { authLimiter } = require('../middleware/rateLimit.middleware');
const upload = require('../middleware/upload.middleware');
const { registerRules, loginRules, otpRules, resetPasswordRules } = require('../validators/auth.validator');

router.post('/register', authLimiter, registerRules, validate, ctrl.register);
router.post('/verify-otp', authLimiter, otpRules, validate, ctrl.verifyOTP);
router.post('/resend-otp', authLimiter, ctrl.resendOTP);
router.post('/login', authLimiter, loginRules, validate, ctrl.login);
router.post('/refresh-token', authLimiter, ctrl.refreshToken);
router.post('/logout', optionalProtect, ctrl.logout);
router.post('/verify-phone', protect, ctrl.verifyPhone);
router.post('/forgot-password', authLimiter, ctrl.forgotPassword);
router.post('/reset-password', authLimiter, resetPasswordRules, validate, ctrl.resetPassword);

router.get('/me', protect, ctrl.getMe);
router.patch('/me/photo', protect, upload('profile-photos').single('photo'), ctrl.updateProfilePhoto);
router.patch('/update-password', protect, ctrl.updatePassword);

module.exports = router;