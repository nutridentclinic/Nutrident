const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getMessaging } = require('firebase-admin/messaging');
const logger = require('../utils/logger');

// firebase-admin v14 removed the old namespaced API (admin.credential.cert(),
// admin.auth(), admin.messaging()) entirely - it now requires these modular,
// per-service imports instead. This also means firebase-admin v14 requires
// Node.js >=22.12 (it depends on the ESM-only 'jose' package, loaded via
// require(ESM), which is only stable from Node 22.12+). Confirm your Node
// version and your deploy host's Node version are both >=22.12 before using this.

const isConfigured = () =>
  !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);

let firebaseApp = null;

if (isConfigured()) {
  // getApps().length check guards against double-initialization if this file is
  // ever required twice (e.g. by a hot-reloader in dev) - initializeApp() throws
  // if called a second time with the same default app name.
  firebaseApp = getApps().length
    ? getApps()[0]
    : initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
  logger.info('Firebase Admin SDK initialized (push notifications + phone auth verification active).');
} else {
  logger.warn('Firebase env vars not set - push notifications and phone verification are disabled.');
}

// Lazy getters - only call these once something actually needs Firebase (and only
// after confirming isConfigured()). Calling getAuth()/getMessaging() with no
// initialized app throws, so callers must always check isConfigured() first -
// see notification.service.js and auth.controller.js for the pattern.
const auth = () => getAuth(firebaseApp);
const messaging = () => getMessaging(firebaseApp);

module.exports = { auth, messaging, isConfigured };