class AppError extends Error {
  constructor(message, statusCode, extra = {}) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    if (typeof extra === 'object' && extra !== null) {
      Object.assign(this, extra);
    }
    Error.captureStackTrace(this, this.constructor);
  }
}
module.exports = AppError;