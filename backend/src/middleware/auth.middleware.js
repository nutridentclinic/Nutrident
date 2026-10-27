const jwt = require('jsonwebtoken');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const User = require('../models/User');

// Verifies JWT access token and attaches req.user
exports.protect = catchAsync(async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('You are not logged in. Please log in to continue.', 401));
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return next(new AppError('Invalid or expired token. Please log in again.', 401));
  }

  const currentUser = await User.findById(decoded.id).select('+active +tokenVersion +passwordChangedAt +isEmailVerified +refreshSessions');
  if (!currentUser || currentUser.active === false) {
    return next(new AppError('The user belonging to this token no longer exists or has been deactivated.', 401));
  }

  // Reject tokens whose tokenVersion differs from current user value
  const userTv = currentUser.tokenVersion || 0;
  if (decoded.tv !== undefined && decoded.tv !== userTv) {
    return next(new AppError('Session invalidated. Please log in again.', 401));
  }

  // If token carries a session ID, verify the session has not been revoked
  if (decoded.sid && currentUser.refreshSessions && !currentUser.refreshSessions.some((s) => s.sessionId === decoded.sid)) {
    return next(new AppError('Session invalidated. Please log in again.', 401));
  }

  if (currentUser.changedPasswordAfter && currentUser.changedPasswordAfter(decoded.iat)) {
    return next(new AppError('User recently changed password. Please log in again.', 401));
  }

  if (currentUser.role === 'patient' && !currentUser.isEmailVerified) {
    return next(new AppError('Please verify your email to continue.', 403, {
      code: 'EMAIL_NOT_VERIFIED',
      email: currentUser.email,
    }));
  }

  currentUser.sid = decoded.sid;
  req.user = currentUser;
  next();
});

// Best-effort auth middleware (e.g. for logout when access token might have expired)
exports.optionalProtect = catchAsync(async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const currentUser = await User.findById(decoded.id).select('+active +tokenVersion');
    if (currentUser && currentUser.active !== false) {
      const userTv = currentUser.tokenVersion || 0;
      if (decoded.tv === undefined || decoded.tv === userTv) {
        req.user = currentUser;
      }
    }
  } catch {
    // expired or invalid access token; proceed so controller can evaluate refreshToken if provided
  }
  next();
});