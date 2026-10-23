const crypto = require('crypto');

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;
const MAX_HOURLY_SENDS = 5;
const HOURLY_WINDOW_MS = 60 * 60 * 1000;

function getSecret() {
  return process.env.OTP_SECRET || process.env.JWT_SECRET || 'fallback-otp-secret-must-be-at-least-32-chars-long';
}

function hashHmacOTP(userId, purpose, otp) {
  const secret = getSecret();
  return crypto
    .createHmac('sha256', secret)
    .update(`${String(userId)}:${String(purpose)}:${String(otp)}`)
    .digest('hex');
}

function hashLegacyOTP(otp) {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

function hashOTP(a, b, c) {
  if (c !== undefined) {
    return hashHmacOTP(a, b, c);
  }
  // legacy: hashOTP(otp)
  return hashLegacyOTP(a);
}

function generateOTP(userId, purpose = 'verify') {
  const otp = crypto.randomInt(100000, 1000000).toString();
  if (userId) {
    const hash = hashHmacOTP(userId, purpose, otp);
    return {
      otp,
      hash,
      expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
    };
  }
  const hash = hashLegacyOTP(otp);
  return {
    otp,
    hash,
    expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
  };
}

function compareLegacyOTP(candidateOtp, storedHash) {
  if (!candidateOtp || !storedHash) return false;
  try {
    const candidateHash = hashLegacyOTP(candidateOtp);
    const a = Buffer.from(candidateHash, 'hex');
    const b = Buffer.from(storedHash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function compareOTP({ userId, purpose, candidateOtp, storedHash, storedPurpose }) {
  if (!candidateOtp || !storedHash) return false;
  try {
    // A code issued for one purpose must never validate for the other
    if (storedPurpose && storedPurpose !== purpose) {
      return false;
    }

    if (userId && purpose) {
      const candidateHash = hashHmacOTP(userId, purpose, candidateOtp);
      const a = Buffer.from(candidateHash, 'hex');
      const b = Buffer.from(storedHash, 'hex');
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        return true;
      }
    }

    // Keep reading the old otpHash/otpExpires fields only for in-flight codes during transition
    if (!storedPurpose) {
      return compareLegacyOTP(candidateOtp, storedHash);
    }

    return false;
  } catch {
    return false;
  }
}

module.exports = {
  OTP_EXPIRY_MS,
  RESEND_COOLDOWN_MS,
  LOCKOUT_MS,
  MAX_ATTEMPTS,
  MAX_HOURLY_SENDS,
  HOURLY_WINDOW_MS,
  generateOTP,
  hashOTP,
  hashHmacOTP,
  hashLegacyOTP,
  compareOTP,
  compareLegacyOTP,
};
