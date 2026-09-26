const User = require('../models/User');
const Patient = require('../models/Patient');
const Dentist = require('../models/Dentist');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/generateToken');
const { generateOTP, hashOTP } = require('../utils/generateOTP');
const { sendEmail } = require('../config/email');
const { auth: firebaseAuth, isConfigured } = require('../config/firebase');
const logger = require('../utils/logger');

const issueTokens = (user) => {
  const payload = { id: user._id, role: user.role };
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
};

const sanitizeUser = (user) => {
  const obj = user.toObject();
  delete obj.password;
  delete obj.otpHash;
  delete obj.otpExpires;
  return obj;
};

// @route POST /api/auth/register
// role defaults to 'patient'. Dentist accounts should be created by admin (dentist.controller) so they can be verified.
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
  const user = await User.findById(userId).select('+otpHash +otpExpires');
  if (!user) return next(new AppError('User not found', 404));

  if (!user.otpHash || user.otpExpires < Date.now()) {
    return next(new AppError('OTP has expired. Please request a new one.', 400));
  }
  if (hashOTP(otp) !== user.otpHash) {
    return next(new AppError('Invalid OTP.', 400));
  }

  user.isEmailVerified = true;
  user.otpHash = undefined;
  user.otpExpires = undefined;
  await user.save({ validateBeforeSave: false });

  success(res, 200, 'Account verified successfully.');
});

// @route POST /api/auth/resend-otp
exports.resendOTP = catchAsync(async (req, res, next) => {
  const { userId } = req.body;
  const user = await User.findById(userId);
  if (!user) return next(new AppError('User not found', 404));

  const { otp, hash } = generateOTP();
  user.otpHash = hash;
  user.otpExpires = Date.now() + 10 * 60 * 1000;
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

  const user = await User.findOne({ email }).select('+password +active');
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

  const user = await User.findById(decoded.id);
  if (!user) return next(new AppError('User no longer exists.', 401));

  const tokens = issueTokens(user);
  success(res, 200, 'Token refreshed.', tokens);
});

// @route POST /api/auth/forgot-password
// Body: { email }
exports.forgotPassword = catchAsync(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email });
  // Always respond the same way to avoid leaking which emails are registered
  if (!user) return success(res, 200, 'If that email exists, an OTP has been sent.');

  const { otp, hash } = generateOTP();
  user.otpHash = hash;
  user.otpExpires = Date.now() + 10 * 60 * 1000;
  await user.save({ validateBeforeSave: false });

  sendEmail({
    to: user.email,
    subject: 'Password reset OTP',
    html: `<p>Your password reset OTP is <b>${otp}</b>. It expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>`,
  }).catch((err) => logger.error(`Failed to send password-reset OTP email to ${user.email}: ${err.message}`));

  success(res, 200, 'If that email exists, an OTP has been sent.');
});

// @route POST /api/auth/reset-password
// Body: { email, otp, password }
exports.resetPassword = catchAsync(async (req, res, next) => {
  const { email, otp, password } = req.body;

  const user = await User.findOne({ email }).select('+otpHash +otpExpires');
  // Generic message so this endpoint can't be used to check which emails exist
  if (!user) return next(new AppError('Invalid or expired OTP.', 400));

  if (!user.otpHash || user.otpExpires < Date.now()) {
    return next(new AppError('OTP has expired. Please request a new one.', 400));
  }
  if (hashOTP(otp) !== user.otpHash) {
    return next(new AppError('Invalid OTP.', 400));
  }

  user.password = password;
  user.otpHash = undefined;
  user.otpExpires = undefined;
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
// Body: { idToken }
// The mobile app verifies the user's phone number itself using the Firebase Phone Auth
// SDK (Google sends and checks the SMS OTP - no backend involvement in sending it).
// Once verified client-side, the app gets a Firebase ID token and sends it here so we
// can confirm it server-side and mark the account as phone-verified.
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
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(req.body.currentPassword))) {
    return next(new AppError('Current password is incorrect.', 401));
  }
  user.password = req.body.newPassword;
  await user.save();

  const tokens = issueTokens(user);
  success(res, 200, 'Password updated successfully.', tokens);
});