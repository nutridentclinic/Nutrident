const User = require('../models/User');
const Patient = require('../models/Patient');
const Dentist = require('../models/Dentist');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/generateToken');
const { generateOTP, hashOTP, compareOTP } = require('../utils/generateOTP');
const { sendEmail } = require('../config/email');
const { auth: firebaseAuth, isConfigured } = require('../config/firebase');
const logger = require('../utils/logger');
const { deleteCloudinaryFile } = require('../utils/cloudinaryCleanup');

const issueTokens = (user) => {
  const payload = {
    id: user._id,
    role: user.role,
    tv: user.tokenVersion || 0,
  };
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
};

const sanitizeUser = (user) => {
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.password;
  delete obj.otpHash;
  delete obj.otpExpires;
  delete obj.otpAttempts;
  delete obj.otpLockUntil;
  delete obj.resendOtpCooldown;
  return obj;
};

// @route POST /api/auth/register
exports.register = catchAsync(async (req, res, next) => {
  const { name, email, phone, password } = req.body;

  const existing = await User.findOne({ $or: [{ email }, { phone }] });
  if (existing) return next(new AppError('An account with this email or phone already exists.', 409));

  const user = await User.create({ name, email, phone, password, role: 'patient' });
  await Patient.create({ user: user._id });

  const { otp, hash } = generateOTP();
  user.otpHash = hash;
  user.otpExpires = Date.now() + 10 * 60 * 1000;
  await user.save({ validateBeforeSave: false });

  sendEmail({
    to: email,
    subject: 'Verify your account',
    html: `<p>Hi ${name},</p><p>Your verification OTP is <b>${otp}</b>. It expires in 10 minutes.</p>`,
  }).catch((err) => logger.error(`Failed to send registration OTP email to ${email}: ${err.message}`));

  const tokens = issueTokens(user);
  success(res, 201, 'Registered successfully. Please verify your email with the OTP sent.', {
    user: sanitizeUser(user),
    ...tokens,
  });
});

// @route POST /api/auth/verify-otp
exports.verifyOTP = catchAsync(async (req, res, next) => {
  const { userId, otp } = req.body;
  const user = await User.findById(userId).select('+otpHash +otpExpires +otpAttempts +otpLockUntil');
  if (!user) return next(new AppError('User not found', 404));

  if (user.otpLockUntil && user.otpLockUntil > Date.now()) {
    const minutesRemaining = Math.ceil((user.otpLockUntil - Date.now()) / (60 * 1000));
    return next(new AppError(`Too many failed attempts. Account locked for ${minutesRemaining} minutes.`, 429));
  }

  if (!user.otpHash || user.otpExpires < Date.now()) {
    return next(new AppError('OTP has expired. Please request a new one.', 400));
  }

  if (!compareOTP(otp, user.otpHash)) {
    user.otpAttempts = (user.otpAttempts || 0) + 1;
    if (user.otpAttempts >= 5) {
      user.otpLockUntil = Date.now() + 15 * 60 * 1000;
    }
    await user.save({ validateBeforeSave: false });
    return next(new AppError('Invalid OTP.', 400));
  }

  user.isEmailVerified = true;
  user.otpHash = undefined;
  user.otpExpires = undefined;
  user.otpAttempts = 0;
  user.otpLockUntil = undefined;
  await user.save({ validateBeforeSave: false });

  success(res, 200, 'Account verified successfully.');
});

// @route POST /api/auth/resend-otp
exports.resendOTP = catchAsync(async (req, res, next) => {
  const { userId } = req.body;
  if (!userId) return next(new AppError('userId is required.', 400));

  const user = await User.findById(userId).select('+resendOtpCooldown');
  if (!user) return next(new AppError('User not found', 404));

  if (user.resendOtpCooldown && user.resendOtpCooldown > Date.now()) {
    const secondsRemaining = Math.ceil((user.resendOtpCooldown - Date.now()) / 1000);
    return next(new AppError(`Please wait ${secondsRemaining}s before requesting a new OTP.`, 429));
  }

  const { otp, hash } = generateOTP();
  user.otpHash = hash;
  user.otpExpires = Date.now() + 10 * 60 * 1000;
  user.otpAttempts = 0;
  user.resendOtpCooldown = Date.now() + 60 * 1000; // 60s cooldown per user
  await user.save({ validateBeforeSave: false });

  sendEmail({
    to: user.email,
    subject: 'Your new OTP',
    html: `<p>Your new verification OTP is <b>${otp}</b>. It expires in 10 minutes.</p>`,
  }).catch((err) => logger.error(`Failed to send resend-OTP email to ${user.email}: ${err.message}`));

  success(res, 200, 'A new OTP has been sent.');
});

// @route POST /api/auth/login
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) return next(new AppError('Please provide email and password.', 400));

  const user = await User.findOne({ email }).select('+password +active +tokenVersion');
  if (!user || !(await user.comparePassword(password))) {
    return next(new AppError('Incorrect email or password.', 401));
  }
  if (!user.active) return next(new AppError('This account has been deactivated.', 403));

  const tokens = issueTokens(user);
  success(res, 200, 'Logged in successfully.', { user: sanitizeUser(user), ...tokens });
});

// @route POST /api/auth/refresh-token
exports.refreshToken = catchAsync(async (req, res, next) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return next(new AppError('Refresh token is required.', 400));

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (err) {
    return next(new AppError('Invalid or expired refresh token. Please log in again.', 401));
  }

  const user = await User.findById(decoded.id).select('+active +tokenVersion');
  if (!user || user.active === false) {
    return next(new AppError('User no longer exists or account has been deactivated.', 401));
  }

  const userTv = user.tokenVersion || 0;
  if (decoded.tv !== undefined && decoded.tv !== userTv) {
    return next(new AppError('Session has been revoked. Please log in again.', 401));
  }

  // Rotate refresh token on every refresh (old one is invalidated)
  const tokens = issueTokens(user);
  success(res, 200, 'Token refreshed.', tokens);
});

// @route POST /api/auth/logout
// Authenticated or best-effort with valid refresh token; increments tokenVersion
exports.logout = catchAsync(async (req, res, next) => {
  let userId = req.user?._id;

  if (!userId && req.body?.refreshToken) {
    try {
      const decoded = verifyRefreshToken(req.body.refreshToken);
      const user = await User.findById(decoded.id).select('+active +tokenVersion');
      if (user && user.active !== false) {
        const userTv = user.tokenVersion || 0;
        if (decoded.tv === undefined || decoded.tv === userTv) {
          userId = user._id;
        }
      }
    } catch {
      // Ignore invalid refresh token in logout
    }
  }

  if (userId) {
    await User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } });
  }

  success(res, 200, 'Logged out successfully.');
});

// @route POST /api/auth/forgot-password
exports.forgotPassword = catchAsync(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email }).select('+resendOtpCooldown');
  if (!user) return success(res, 200, 'If that email exists, an OTP has been sent.');

  if (user.resendOtpCooldown && user.resendOtpCooldown > Date.now()) {
    return success(res, 200, 'If that email exists, an OTP has been sent.');
  }

  const { otp, hash } = generateOTP();
  user.otpHash = hash;
  user.otpExpires = Date.now() + 10 * 60 * 1000;
  user.otpAttempts = 0;
  user.resendOtpCooldown = Date.now() + 60 * 1000;
  await user.save({ validateBeforeSave: false });

  sendEmail({
    to: user.email,
    subject: 'Password reset OTP',
    html: `<p>Your password reset OTP is <b>${otp}</b>. It expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>`,
  }).catch((err) => logger.error(`Failed to send password-reset OTP email to ${user.email}: ${err.message}`));

  success(res, 200, 'If that email exists, an OTP has been sent.');
});

// @route POST /api/auth/reset-password
exports.resetPassword = catchAsync(async (req, res, next) => {
  const { email, otp, password } = req.body;

  const user = await User.findOne({ email }).select('+otpHash +otpExpires +otpAttempts +otpLockUntil +tokenVersion');
  if (!user) return next(new AppError('Invalid or expired OTP.', 400));

  if (user.otpLockUntil && user.otpLockUntil > Date.now()) {
    const minutesRemaining = Math.ceil((user.otpLockUntil - Date.now()) / (60 * 1000));
    return next(new AppError(`Too many failed attempts. Account locked for ${minutesRemaining} minutes.`, 429));
  }

  if (!user.otpHash || user.otpExpires < Date.now()) {
    return next(new AppError('OTP has expired. Please request a new one.', 400));
  }

  if (!compareOTP(otp, user.otpHash)) {
    user.otpAttempts = (user.otpAttempts || 0) + 1;
    if (user.otpAttempts >= 5) {
      user.otpLockUntil = Date.now() + 15 * 60 * 1000;
    }
    await user.save({ validateBeforeSave: false });
    return next(new AppError('Invalid OTP.', 400));
  }

  user.password = password;
  user.otpHash = undefined;
  user.otpExpires = undefined;
  user.otpAttempts = 0;
  user.otpLockUntil = undefined;
  user.tokenVersion = (user.tokenVersion || 0) + 1; // Revoke all previous sessions
  await user.save();

  const tokens = issueTokens(user);
  success(res, 200, 'Password reset successfully.', tokens);
});

// @route GET /api/auth/me
exports.getMe = catchAsync(async (req, res) => {
  let profile = null;
  if (req.user.role === 'patient') profile = await Patient.findOne({ user: req.user._id });
  if (req.user.role === 'dentist') profile = await Dentist.findOne({ user: req.user._id });

  success(res, 200, 'Profile fetched.', { user: sanitizeUser(req.user), profile });
});

// @route POST /api/auth/verify-phone
exports.verifyPhone = catchAsync(async (req, res, next) => {
  if (!isConfigured()) {
    return next(new AppError('Phone verification is not configured on the server yet.', 503));
  }
  const { idToken } = req.body;
  if (!idToken) return next(new AppError('idToken is required.', 400));

  let decoded;
  try {
    decoded = await firebaseAuth().verifyIdToken(idToken);
  } catch (err) {
    return next(new AppError('Invalid or expired Firebase token.', 401));
  }

  if (!decoded.phone_number) {
    return next(new AppError('This token does not contain a verified phone number.', 400));
  }

  const user = await User.findById(req.user._id);
  if (!user) return next(new AppError('User not found.', 404));

  const normalize = (p) => p.replace(/\D/g, '').slice(-10);
  if (normalize(decoded.phone_number) !== normalize(user.phone)) {
    return next(new AppError('Verified phone number does not match the number on your account.', 400));
  }

  user.isPhoneVerified = true;
  await user.save({ validateBeforeSave: false });

  success(res, 200, 'Phone number verified successfully.', { isPhoneVerified: true });
});

// @route PATCH /api/auth/update-password
exports.updatePassword = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id).select('+password +tokenVersion');
  if (!(await user.comparePassword(req.body.currentPassword))) {
    return next(new AppError('Current password is incorrect.', 401));
  }
  user.password = req.body.newPassword;
  user.tokenVersion = (user.tokenVersion || 0) + 1; // Invalidate other sessions
  await user.save();

  const tokens = issueTokens(user);
  success(res, 200, 'Password updated successfully.', tokens);
});

// @route PATCH /api/auth/me/photo (upload profile photo for any role - multipart/form-data, field "photo")
exports.updateProfilePhoto = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('A photo file is required.', 400));
  }

  const oldPhotoPublicId = req.user.profilePhoto?.publicId || null;
  const updates = {
    profilePhoto: { url: req.file.path, publicId: req.file.filename },
  };

  const updatedUser = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
  if (oldPhotoPublicId) {
    await deleteCloudinaryFile(oldPhotoPublicId);
  }

  success(res, 200, 'Profile photo updated.', sanitizeUser(updatedUser));
});