const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
const logger = require('../utils/logger');

/**
 * Agora is used for the actual video/audio transport (WebRTC under the hood).
 * The backend never handles media itself - it only issues short-lived tokens that
 * let the React Native app and the dentist web panel join the same Agora "channel".
 *
 * Setup: create a project at https://console.agora.io -> enable "App Certificate"
 * (needed for secure/token-based auth) -> copy App ID + App Certificate into .env.
 */

const isConfigured = () => !!(process.env.AGORA_APP_ID && process.env.AGORA_APP_CERTIFICATE);

const TOKEN_EXPIRY_SECONDS = 60 * 60 * 2; // 2 hours - generous enough for a delayed/overrunning consult

/**
 * Generates a time-limited Agora RTC token for one participant to join one channel.
 * channelName: unique per appointment (we use appointment._id)
 * uid: numeric Agora user id - we derive a stable one from the Mongo user id
 */
const generateAgoraToken = (channelName, uid) => {
  if (!isConfigured()) {
    logger.warn('Agora env vars not set - cannot generate video call token.');
    return null;
  }

  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + TOKEN_EXPIRY_SECONDS;

  return RtcTokenBuilder.buildTokenWithUid(
    process.env.AGORA_APP_ID,
    process.env.AGORA_APP_CERTIFICATE,
    channelName,
    uid,
    RtcRole.PUBLISHER,
    privilegeExpiredTs
  );
};

// Turns a Mongo ObjectId into a stable positive 32-bit integer Agora can use as a uid
const mongoIdToAgoraUid = (mongoId) => {
  const hex = mongoId.toString().slice(-8); // last 8 hex chars = 32 bits
  return parseInt(hex, 16);
};

module.exports = { generateAgoraToken, mongoIdToAgoraUid, isConfigured };