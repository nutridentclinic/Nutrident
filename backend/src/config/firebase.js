const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getMessaging } = require('firebase-admin/messaging');
const logger = require('../utils/logger');

// firebase-admin v14 removed the old namespaced API (admin.credential.cert(),
// admin.auth(), admin.messaging()) entirely - it now requires these modular,
// per-service imports instead. This also means firebase-admin v14 requires
// Node.js >=22.12 (it depends on the ESM-only 'jose' package, loaded via
// require(ESM), which is only stable from Node 22.12+).
//
// Credentials are read from ONE base64-encoded env var (FIREBASE_SERVICE_ACCOUNT_BASE64)
// containing the entire downloaded service account JSON file, rather than three separate
// FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY vars. The private key
// specifically breaks constantly across different hosts (Render, Vercel, Heroku, Windows
// .env files) because each platform's env-var UI/parser handles embedded \n and quote
// characters differently - some preserve literal backslash-n, some convert to real
// newlines, some strip surrounding quotes and some don't. Base64 has none of those
// characters at all, so it survives copy-paste into any platform's UI unchanged.

const isConfigured = () => !!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

let firebaseApp = null;

if (isConfigured()) {
  try {
    const serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8')
    );

    // getApps().length check guards against double-initialization if this file is
    // ever required twice (e.g. by a hot-reloader in dev) - initializeApp() throws
    // if called a second time with the same default app name.
    firebaseApp = getApps().length ? getApps()[0] : initializeApp({ credential: cert(serviceAccount) });
    logger.info('Firebase Admin SDK initialized (push notifications + phone auth verification active).');
  } catch (err) {
    logger.error(`Failed to initialize Firebase Admin SDK - check FIREBASE_SERVICE_ACCOUNT_BASE64: ${err.message}`);
  }
} else {
  logger.warn('FIREBASE_SERVICE_ACCOUNT_BASE64 not set - push notifications and phone verification are disabled.');
}

// Lazy getters - only call these once something actually needs Firebase (and only
// after confirming isConfigured()). Calling getAuth()/getMessaging() with no
// initialized app throws, so callers must always check isConfigured() first -
// see notification.service.js and auth.controller.js for the pattern.
const auth = () => getAuth(firebaseApp);
const messaging = () => getMessaging(firebaseApp);

module.exports = { auth, messaging, isConfigured };