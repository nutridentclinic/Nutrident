/**
 * Validates critical environment configuration on server boot.
 * Enforces production security guarantees (e.g. min 32-character secrets, non-identical keys).
 */
function validateSecurityEnv() {
  const jwtSecret = process.env.JWT_SECRET || '';
  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || '';
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    if (jwtSecret.length < 32 || jwtRefreshSecret.length < 32) {
      throw new Error('FATAL: JWT_SECRET and JWT_REFRESH_SECRET must each be at least 32 characters in production.');
    }
    if (jwtSecret === jwtRefreshSecret) {
      throw new Error('FATAL: JWT_SECRET and JWT_REFRESH_SECRET must be distinct values in production.');
    }
    const otpSecret = process.env.OTP_SECRET || '';
    if (otpSecret && otpSecret.length < 32) {
      throw new Error('FATAL: OTP_SECRET must be at least 32 characters if set in production.');
    }
  }
}

module.exports = { validateSecurityEnv };
