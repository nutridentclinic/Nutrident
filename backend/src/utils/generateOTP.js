const otpModule = require('./otp');

module.exports = {
  ...otpModule,
  generateOTP: otpModule.generateOTP,
  hashOTP: otpModule.hashOTP,
  compareOTP: (candidateOtp, storedHash) => otpModule.compareLegacyOTP(candidateOtp, storedHash),
};