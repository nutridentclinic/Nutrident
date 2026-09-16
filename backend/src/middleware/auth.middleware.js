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

  const currentUser = await User.findById(decoded.id).select('+active');
  if (!currentUser || currentUser.active === false) {
    return next(new AppError('The user belonging to this token no longer exists.', 401));
  }

  req.user = currentUser;
  next();
});