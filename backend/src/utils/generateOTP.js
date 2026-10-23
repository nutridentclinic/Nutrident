const crypto = require('crypto');

// 6-digit numeric OTP, plus a hashed version to store in DB (never store raw OTP)
const generateOTP = () => {
  const otp = crypto.randomInt(100000, 999999).toString();
  const hash = crypto.createHash('sha256').update(otp).digest('hex');
  return { otp, hash };
};

const hashOTP = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');

const compareOTP = (candidateOtp, storedHash) => {
  if (!candidateOtp || !storedHash) return false;
  try {
    const candidateHash = hashOTP(candidateOtp);
    const a = Buffer.from(candidateHash, 'hex');
    const b = Buffer.from(storedHash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
};

module.exports = { generateOTP, hashOTP, compareOTP };