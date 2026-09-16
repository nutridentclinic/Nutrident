const jwt = require('jsonwebtoken');

const signAccessToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const signRefreshToken = (payload) =>
  jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  });

const verifyRefreshToken = (token) => jwt.verify(token, process.env.JWT_REFRESH_SECRET);

module.exports = { signAccessToken, signRefreshToken, verifyRefreshToken };