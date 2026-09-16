const crypto = require('crypto');

// 6-digit numeric OTP, plus a hashed version to store in DB (never store raw OTP)
const generateOTP = () => {
  const otp = crypto.randomInt(100000, 999999).toString();
  const hash = crypto.createHash('sha256').update(otp).digest('hex');
  return { otp, hash };
};

const hashOTP = (otp) => crypto.createHash('sha256').update(otp).digest('hex');

module.exports = { generateOTP, hashOTP };