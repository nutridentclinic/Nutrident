const AppError = require('../utils/appError');
const logger = require('../utils/logger');

const handleCastErrorDB = (err) => new AppError(`Invalid ${err.path}: ${err.value}`, 400);

const handleDuplicateFieldsDB = (err) => {
  const field = Object.keys(err.keyValue || {})[0];
  const value = err.keyValue ? err.keyValue[field] : '';
  return new AppError(`Duplicate value for '${field}': ${value}. Please use another value.`, 400);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  return new AppError(`Invalid input data. ${errors.join('. ')}`, 400);
};

const handleJWTError = () => new AppError('Invalid token. Please log in again.', 401);
const handleJWTExpired = () => new AppError('Your token has expired. Please log in again.', 401);

module.exports = (err, req, res, next) => {
  let error = { ...err, message: err.message };
  error.statusCode = err.statusCode || 500;
  error.status = err.status || 'error';

  if (err.name === 'CastError') error = handleCastErrorDB(err);
  if (err.code === 11000) error = handleDuplicateFieldsDB(err);
  if (err.name === 'ValidationError') error = handleValidationErrorDB(err);
  if (err.name === 'JsonWebTokenError') error = handleJWTError();
  if (err.name === 'TokenExpiredError') error = handleJWTExpired();

  if (!error.isOperational) {
    logger.error(err.stack || err.message);
  }

  res.status(error.statusCode).json({
    success: false,
    message: error.isOperational ? error.message : 'Something went wrong. Please try again later.',
  });
};