const crypto = require('crypto');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Dentist = require('../models/Dentist');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/generateToken');
const { generateOTP, compareOTP } = require('../utils/otp');
const { sendEmail } = require('../config/email');
const { auth: firebaseAuth, isConfigured } = require('../config/firebase');
const logger = require('../utils/logger');
const { deleteCloudinaryFile } = require('../utils/cloudinaryCleanup');

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

const issueTokens = async (user, sidToReuse = null) => {
  const sessionId = sidToReuse || crypto.randomUUID();
  const payload = {
    id: user._id,
    role: user.role,
    tv: user.tokenVersion || 0,
    sid: sessionId,
  };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken({
    ...payload,
    jti: crypto.randomUUID(),
  });
  const tokenHash = hashToken(refreshToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  let sessions = user.refreshSessions;
  if (!sessions) {
    const fresh = await User.findById(user._id).select('+refreshSessions');
    sessions = fresh?.refreshSessions || [];
  }

  sessions = sessions.filter((s) => s.sessionId !== sessionId && s.expiresAt > now);
  if (sessions.length >= 10) {
    sessions.shift();
  }
  sessions.push({
    sessionId,
    tokenHash,
    createdAt: now,
    expiresAt,
  });

  await User.findByIdAndUpdate(user._id, { refreshSessions: sessions });
  user.refreshSessions = sessions;

  return { accessToken, refreshToken };
};

const sanitizeUser = (user) => {
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.password;
  delete obj.otpHash;
  delete obj.otpExpires;
  delete obj.otpPurpose;
  delete obj.otpAttempts;
  delete obj.otpLockedUntil;
  delete obj.otpLockUntil;
  delete obj.otpSentAt;
  delete obj.otpSendCount;
  delete obj.otpSendWindowStart;
  delete obj.resendOtpCooldown;
  delete obj.resetTokenHash;
  delete obj.resetTokenExpires;
  return obj;
};

// @route POST /api/auth/register
exports.register = catchAsync(async (req, res, next) => {
  const { name, email, phone, password } = req.body;

  const existingEmailUser = await User.findOne({ email }).select('+password +isEmailVerified');
  if (existingEmailUser && existingEmailUser.isEmailVerified) {
    return next(new AppError('An account with this email already exists.', 409));
  }

  const existingPhoneUser = await User.findOne({ phone }).select('+isEmailVerified');
  if (
    existingPhoneUser &&
    existingPhoneUser.isEmailVerified &&
    (!existingEmailUser || existingPhoneUser._id.toString() !== existingEmailUser._id.toString())
  ) {
    return next(new AppError('An account with this phone number already exists.', 409));
  }

  // If unverified account with this phone belongs to someone else, clean it up so unique index won't conflict
  if (
    existingPhoneUser &&
    !existingPhoneUser.isEmailVerified &&
    (!existingEmailUser || existingPhoneUser._id.toString() !== existingEmailUser._id.toString())
  ) {
    await Patient.deleteOne({ user: existingPhoneUser._id });
    await User.deleteOne({ _id: existingPhoneUser._id });
  }

  let user;
  if (existingEmailUser && !existingEmailUser.isEmailVerified) {
    // Overwrite unverified record
    existingEmailUser.name = name;
    existingEmailUser.phone = phone;
    existingEmailUser.password = password;
    existingEmailUser.role = 'patient';
    existingEmailUser.isEmailVerified = false;
    user = existingEmailUser;
    await user.save();
    await Patient.findOneAndUpdate({ user: user._id }, { user: user._id }, { upsert: true, new: true });
  } else {
    user = await User.create({ name, email, phone, password, role: 'patient', isEmailVerified: false });
    await Patient.create({ user: user._id });
  }

  const { otp, hash } = generateOTP(user._id, 'verify');
  user.otpHash = hash;
  user.otpPurpose = 'verify';
  user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
  user.otpAttempts = 0;
  user.otpLockedUntil = undefined;
  user.otpLockUntil = undefined;
  user.otpSentAt = new Date();
  user.otpSendCount = 1;
  user.otpSendWindowStart = new Date();
  await user.save({ validateBeforeSave: false });

  let otpSent = false;
  try {
    await Promise.race([
      sendEmail({
        to: user.email,
        subject: 'Verify your email',
        html: `<p>Hi ${user.name},</p><p>Your 6-digit verification code is <b>${otp}</b>.</p><p>It expires in 10 minutes.</p><p>If you did not create this account, ignore this email.</p>`,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Email timeout')), 10000)),
    ]);
    otpSent = true;
  } catch (err) {
    logger.error(`Failed to send registration OTP email to ${email}: ${err.message}`);
    otpSent = false;
  }

  const resendAvailableAt = new Date(Date.now() + 60 * 1000).toISOString();
  return res.status(201).json({
    success: true,
    message: otpSent
      ? 'Registered successfully. Please verify your email with the OTP sent.'
      : 'We could not send the code. Tap Resend.',
    data: {
      email: user.email,
      userId: user._id,
      requiresVerification: true,
      otpSent,
      resendAvailableAt,
    },
  });
});

// @route POST /api/auth/login
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) return next(new AppError('Please provide email and password.', 400));

  const user = await User.findOne({ email }).select(
    '+password +active +tokenVersion +isEmailVerified +otpSentAt +otpSendCount +otpSendWindowStart'
  );
  if (!user || !(await user.comparePassword(password))) {
    return next(new AppError('Incorrect email or password.', 401));
  }
  if (!user.active) return next(new AppError('This account has been deactivated.', 403));

  if (user.role === 'patient' && !user.isEmailVerified) {
    const now = Date.now();
    let resendAvailableAt = user.otpSentAt
      ? new Date(user.otpSentAt.getTime() + 60 * 1000).toISOString()
      : new Date().toISOString();

    if (!user.otpSentAt || now - user.otpSentAt.getTime() >= 60 * 1000) {
      const { otp, hash } = generateOTP(user._id, 'verify');
      user.otpHash = hash;
      user.otpPurpose = 'verify';
      user.otpExpires = new Date(now + 10 * 60 * 1000);
      user.otpAttempts = 0;
      user.otpLockedUntil = undefined;
      user.otpLockUntil = undefined;
      user.otpSentAt = new Date(now);

      if (!user.otpSendWindowStart || now - user.otpSendWindowStart.getTime() > 3600000) {
        user.otpSendWindowStart = new Date(now);
        user.otpSendCount = 1;
      } else {
        user.otpSendCount = (user.otpSendCount || 0) + 1;
      }
      await user.save({ validateBeforeSave: false });

      sendEmail({
        to: user.email,
        subject: 'Verify your email',
        html: `<p>Hi ${user.name},</p><p>Your 6-digit verification code is <b>${otp}</b>.</p><p>It expires in 10 minutes.</p><p>If you did not create this account, ignore this email.</p>`,
      }).catch((err) => logger.error(`Failed to send login verification email to ${user.email}: ${err.message}`));

      resendAvailableAt = new Date(now + 60 * 1000).toISOString();
    }

    return res.status(403).json({
      success: false,
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Please verify your email to continue.',
      email: user.email,
      resendAvailableAt,
    });
  }

  const tokens = await issueTokens(user);
  success(res, 200, 'Logged in successfully.', { user: sanitizeUser(user), ...tokens });
});

// @route POST /api/auth/verify-otp
exports.verifyOTP = catchAsync(async (req, res, next) => {
  const { userId, email, otp } = req.body;
  let query = null;
  if (email) query = { email };
  else if (userId) query = { _id: userId };
  else return next(new AppError('Please provide an email or userId.', 400));

  const user = await User.findOne(query).select(
    '+otpHash +otpExpires +otpPurpose +otpAttempts +otpLockedUntil +otpLockUntil +tokenVersion'
  );
  if (!user) return next(new AppError('User not found', 404));

  const lockUntil = user.otpLockedUntil || user.otpLockUntil;
  if (lockUntil && lockUntil.getTime() > Date.now()) {
    const retryAfterSeconds = Math.ceil((lockUntil.getTime() - Date.now()) / 1000);
    return res.status(429).json({
      success: false,
      code: 'OTP_LOCKED',
      message: `Account locked due to too many failed attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
      retryAfterSeconds,
    });
  }

  if (!user.otpHash || !user.otpExpires || user.otpExpires.getTime() < Date.now()) {
    return next(new AppError('OTP has expired. Please request a new one.', 400));
  }

  const isValid = compareOTP({
    userId: user._id,
    purpose: 'verify',
    candidateOtp: otp,
    storedHash: user.otpHash,
    storedPurpose: user.otpPurpose,
  });

  if (!isValid) {
    user.otpAttempts = (user.otpAttempts || 0) + 1;
    const attemptsLeft = Math.max(0, 5 - user.otpAttempts);
    if (user.otpAttempts >= 5) {
      user.otpLockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      user.otpLockUntil = user.otpLockedUntil;
    }
    await user.save({ validateBeforeSave: false });
    return res.status(400).json({
      success: false,
      message: 'Invalid code.',
      attemptsLeft,
    });
  }

  user.isEmailVerified = true;
  user.otpHash = undefined;
  user.otpExpires = undefined;
  user.otpPurpose = undefined;
  user.otpAttempts = 0;
  user.otpLockedUntil = undefined;
  user.otpLockUntil = undefined;
  await user.save({ validateBeforeSave: false });

  const tokens = await issueTokens(user);
  success(res, 200, 'Account verified successfully.', {
    user: sanitizeUser(user),
    ...tokens,
  });
});

// @route POST /api/auth/resend-otp
exports.resendOTP = catchAsync(async (req, res, next) => {
  const { userId, email } = req.body;
  let query = null;
  if (email) query = { email };
  else if (userId) query = { _id: userId };

  const neutralResponse = (resendAt) => {
    return success(res, 200, 'If an unverified account exists, a new code has been sent.', {
      resendAvailableAt: resendAt || new Date(Date.now() + 60 * 1000).toISOString(),
    });
  };

  if (!query) return neutralResponse();

  const user = await User.findOne(query).select(
    '+otpLockedUntil +otpLockUntil +otpSentAt +otpSendCount +otpSendWindowStart +isEmailVerified +name'
  );
  if (!user || user.isEmailVerified) {
    return neutralResponse();
  }

  const now = Date.now();
  const lockUntil = user.otpLockedUntil || user.otpLockUntil;
  if (lockUntil && lockUntil.getTime() > now) {
    const retryAfterSeconds = Math.ceil((lockUntil.getTime() - now) / 1000);
    return res.status(429).json({
      success: false,
      code: 'OTP_LOCKED',
      message: `Account locked. Try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
      retryAfterSeconds,
    });
  }

  if (user.otpSentAt && now - user.otpSentAt.getTime() < 60 * 1000) {
    const retryAfterSeconds = Math.ceil((60 * 1000 - (now - user.otpSentAt.getTime())) / 1000);
    return res.status(429).json({
      success: false,
      message: `Please wait ${retryAfterSeconds}s before requesting a new OTP.`,
      retryAfterSeconds,
      resendAvailableAt: new Date(user.otpSentAt.getTime() + 60 * 1000).toISOString(),
    });
  }

  if (user.otpSendWindowStart && now - user.otpSendWindowStart.getTime() <= 3600000 && user.otpSendCount >= 5) {
    const retryAfterSeconds = Math.ceil((3600000 - (now - user.otpSendWindowStart.getTime())) / 1000);
    return res.status(429).json({
      success: false,
      message: 'Maximum OTP requests reached for this hour. Please try again later.',
      retryAfterSeconds,
    });
  }

  const { otp, hash } = generateOTP(user._id, 'verify');
  user.otpHash = hash;
  user.otpPurpose = 'verify';
  user.otpExpires = new Date(now + 10 * 60 * 1000);
  user.otpAttempts = 0;
  user.otpSentAt = new Date(now);

  if (!user.otpSendWindowStart || now - user.otpSendWindowStart.getTime() > 3600000) {
    user.otpSendWindowStart = new Date(now);
    user.otpSendCount = 1;
  } else {
    user.otpSendCount = (user.otpSendCount || 0) + 1;
  }
  await user.save({ validateBeforeSave: false });

  sendEmail({
    to: user.email,
    subject: 'Verify your email',
    html: `<p>Hi ${user.name},</p><p>Your new verification code is <b>${otp}</b>. It expires in 10 minutes.</p><p>If you did not create this account, ignore this email.</p>`,
  }).catch((err) => logger.error(`Failed to send resend-OTP email to ${user.email}: ${err.message}`));

  return neutralResponse(new Date(now + 60 * 1000).toISOString());
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

  const user = await User.findById(decoded.id).select(
    '+active +tokenVersion +isEmailVerified +passwordChangedAt +refreshSessions'
  );
  if (!user || user.active === false) {
    return next(new AppError('User no longer exists or account has been deactivated.', 401));
  }

  const userTv = user.tokenVersion || 0;
  if (decoded.tv !== undefined && decoded.tv !== userTv) {
    return next(new AppError('Session has been revoked. Please log in again.', 401));
  }

  // Real refresh token rotation check:
  // If sid is present, token hash must match the stored active session hash
  const tokenHash = hashToken(refreshToken);
  const currentSession = (user.refreshSessions || []).find((s) => s.sessionId === decoded.sid);
  if (decoded.sid && (!currentSession || currentSession.tokenHash !== tokenHash)) {
    return next(new AppError('Invalid or expired refresh token. Please log in again.', 401));
  }

  if (user.changedPasswordAfter && user.changedPasswordAfter(decoded.iat)) {
    return next(new AppError('User recently changed password. Please log in again.', 401));
  }

  if (user.role === 'patient' && !user.isEmailVerified) {
    return res.status(403).json({
      success: false,
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Please verify your email to continue.',
      email: user.email,
    });
  }

  // Rotate refresh token on every refresh (old token hash replaced, old one invalidated)
  const tokens = await issueTokens(user, decoded.sid);
  success(res, 200, 'Token refreshed.', tokens);
});

// @route POST /api/auth/logout
exports.logout = catchAsync(async (req, res, next) => {
  let userId = req.user?._id;
  let targetSid = req.user?.sid;

  if (req.body?.refreshToken) {
    try {
      const decoded = verifyRefreshToken(req.body.refreshToken);
      userId = userId || decoded.id;
      targetSid = targetSid || decoded.sid;
    } catch {
      // Ignore invalid refresh token in logout
    }
  }

  if (userId) {
    if (targetSid) {
      // Per-session logout: revoke only this session/device
      await User.findByIdAndUpdate(userId, {
        $pull: { refreshSessions: { sessionId: targetSid } },
      });
    } else {
      // Global fallback logout if session ID not present
      await User.findByIdAndUpdate(userId, {
        $inc: { tokenVersion: 1 },
        $set: { refreshSessions: [] },
      });
    }
  }

  success(res, 200, 'Logged out successfully.');
});

// @route POST /api/auth/forgot-password
exports.forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  const neutralMessage = 'If an account matches that email, a password reset code has been sent.';
  const resendAvailableAt = new Date(Date.now() + 60 * 1000).toISOString();

  if (!email) {
    return success(res, 200, neutralMessage, { resendAvailableAt });
  }

  const user = await User.findOne({ email }).select(
    '+otpLockedUntil +otpLockUntil +otpSentAt +otpSendCount +otpSendWindowStart +name'
  );

  if (!user) {
    // Constant-time mitigation
    await new Promise((resolve) => setTimeout(resolve, 200));
    return success(res, 200, neutralMessage, { email, resendAvailableAt });
  }

  const now = Date.now();
  const lockUntil = user.otpLockedUntil || user.otpLockUntil;
  if (lockUntil && lockUntil.getTime() > now) {
    return success(res, 200, neutralMessage, { email, resendAvailableAt });
  }

  if (user.otpSentAt && now - user.otpSentAt.getTime() < 60 * 1000) {
    return success(res, 200, neutralMessage, {
      email,
      resendAvailableAt: new Date(user.otpSentAt.getTime() + 60 * 1000).toISOString(),
    });
  }

  if (user.otpSendWindowStart && now - user.otpSendWindowStart.getTime() <= 3600000 && user.otpSendCount >= 5) {
    return success(res, 200, neutralMessage, { email, resendAvailableAt });
  }

  const { otp, hash } = generateOTP(user._id, 'reset');
  user.otpHash = hash;
  user.otpPurpose = 'reset';
  user.otpExpires = new Date(now + 10 * 60 * 1000);
  user.otpAttempts = 0;
  user.otpSentAt = new Date(now);

  if (!user.otpSendWindowStart || now - user.otpSendWindowStart.getTime() > 3600000) {
    user.otpSendWindowStart = new Date(now);
    user.otpSendCount = 1;
  } else {
    user.otpSendCount = (user.otpSendCount || 0) + 1;
  }
  await user.save({ validateBeforeSave: false });

  sendEmail({
    to: user.email,
    subject: 'Password reset code',
    html: `<p>Hi ${user.name},</p><p>Your password reset code is <b>${otp}</b>. It expires in 10 minutes. If you did not request this, you can safely ignore this email.</p>`,
  }).catch((err) => logger.error(`Failed to send password-reset OTP email to ${user.email}: ${err.message}`));

  return success(res, 200, neutralMessage, { email, resendAvailableAt });
});

// @route POST /api/auth/verify-reset-otp
exports.verifyResetOtp = catchAsync(async (req, res, next) => {
  const { email, otp } = req.body;
  const user = await User.findOne({ email }).select(
    '+otpHash +otpExpires +otpPurpose +otpAttempts +otpLockedUntil +otpLockUntil'
  );

  if (!user) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return next(new AppError('Invalid or expired code.', 400));
  }

  const now = Date.now();
  const lockUntil = user.otpLockedUntil || user.otpLockUntil;
  if (lockUntil && lockUntil.getTime() > now) {
    const retryAfterSeconds = Math.ceil((lockUntil.getTime() - now) / 1000);
    return res.status(429).json({
      success: false,
      code: 'OTP_LOCKED',
      message: `Account locked due to too many failed attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
      retryAfterSeconds,
    });
  }

  if (!user.otpHash || !user.otpExpires || user.otpExpires.getTime() < now) {
    return next(new AppError('Invalid or expired code.', 400));
  }

  const isValid = compareOTP({
    userId: user._id,
    purpose: 'reset',
    candidateOtp: otp,
    storedHash: user.otpHash,
    storedPurpose: user.otpPurpose,
  });

  if (!isValid) {
    user.otpAttempts = (user.otpAttempts || 0) + 1;
    const attemptsLeft = Math.max(0, 5 - user.otpAttempts);
    if (user.otpAttempts >= 5) {
      user.otpLockedUntil = new Date(now + 15 * 60 * 1000);
      user.otpLockUntil = user.otpLockedUntil;
    }
    await user.save({ validateBeforeSave: false });
    return res.status(400).json({
      success: false,
      message: 'Invalid or expired code.',
      attemptsLeft,
    });
  }

  // Consume OTP and issue 32-byte reset token
  const resetToken = crypto.randomBytes(32).toString('base64url');
  const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

  user.otpHash = undefined;
  user.otpExpires = undefined;
  user.otpPurpose = undefined;
  user.otpAttempts = 0;
  user.resetTokenHash = resetTokenHash;
  user.resetTokenExpires = new Date(now + 10 * 60 * 1000);
  await user.save({ validateBeforeSave: false });

  success(res, 200, 'Code verified successfully.', {
    resetToken,
    expiresInSeconds: 600,
  });
});

// @route POST /api/auth/reset-password
exports.resetPassword = catchAsync(async (req, res, next) => {
  if (req.body?.otp || req.body?.email) {
    return next(new AppError('Please use the updated password reset flow.', 400));
  }

  const { resetToken, password } = req.body;
  if (!resetToken) {
    return next(new AppError('Reset token is required.', 400));
  }

  const tokenHash = crypto.createHash('sha256').update(String(resetToken)).digest('hex');
  const user = await User.findOne({
    resetTokenHash: tokenHash,
    resetTokenExpires: { $gt: new Date() },
  }).select('+resetTokenHash +resetTokenExpires +tokenVersion +password');

  if (!user) {
    return next(new AppError('Invalid or expired reset token. Please request a new code.', 400));
  }

  user.password = password;
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  user.otpHash = undefined;
  user.otpExpires = undefined;
  user.otpPurpose = undefined;
  user.otpAttempts = 0;
  user.passwordChangedAt = new Date();
  user.isEmailVerified = true;
  user.tokenVersion = (user.tokenVersion || 0) + 1; // Invalidate previous sessions
  await user.save();

  success(res, 200, 'Password reset successfully. Please sign in with your new password.');
});

// @route GET /api/auth/me
exports.getMe = catchAsync(async (req, res) => {
  let profile = null;
  if (req.user.role === 'patient') profile = await Patient.findOne({ user: req.user._id });
  if (req.user.role === 'dentist') profile = await Dentist.findOne({ user: req.user._id });

  success(res, 200, 'Profile fetched.', { user: sanitizeUser(req.user), profile });
});

// @route PATCH /api/auth/me
exports.updateMe = catchAsync(async (req, res, next) => {
  const { name, phone } = req.body;
  const updates = {};
  if (name !== undefined) {
    if (!name.trim()) return next(new AppError('Name is required.', 400));
    updates.name = name.trim();
  }
  if (phone !== undefined) {
    const cleanPhone = phone.trim();
    if (!cleanPhone) return next(new AppError('Phone is required.', 400));
    const existing = await User.findOne({ phone: cleanPhone, _id: { $ne: req.user._id } });
    if (existing) {
      return next(new AppError('Phone number is already in use by another account.', 400));
    }
    updates.phone = cleanPhone;
  }
  const user = await User.findByIdAndUpdate(req.user._id, updates, { returnDocument: 'after' }).select('-password');
  success(res, 200, 'Profile updated successfully.', sanitizeUser(user));
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
  user.passwordChangedAt = new Date();
  user.mustChangePassword = false;
  if (req.body.logoutOtherSessions !== false) { user.tokenVersion = (user.tokenVersion || 0) + 1; }
  await user.save();

  const tokens = await issueTokens(user);
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