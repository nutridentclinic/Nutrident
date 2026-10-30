const isProduction = process.env.NODE_ENV === 'production';

/**
 * Returns cookie options tailored to current environment.
 * In production cross-site setups (e.g. frontend on custom domain/Vercel and backend on Render/GCP):
 * - sameSite must be 'none' and secure must be true.
 * In local development (http://localhost:3000 to http://localhost:5000):
 * - sameSite: 'lax' and secure: false allows cookies to be sent across different local ports.
 *
 * @param {boolean} isRefreshToken - Whether the cookie is for refresh token (longer maxAge)
 */
function getCookieOptions(isRefreshToken = false) {
  const isProd = process.env.NODE_ENV === 'production';
  // Allow overriding sameSite via env if frontend and backend share same origin/domain
  const sameSite = isProd ? (process.env.COOKIE_SAME_SITE || 'none') : 'lax';
  const secure = isProd ? true : process.env.COOKIE_SECURE === 'true';

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    // accessToken: 7 days (or 15 mins if short-lived tokens configured); refreshToken: 30 days
    maxAge: isRefreshToken ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000,
  };
}

/**
 * Sets secure HTTP-Only authentication cookies on the HTTP response.
 *
 * @param {import('express').Response} res
 * @param {{ accessToken?: string, refreshToken?: string }} tokens
 */
function setAuthCookies(res, { accessToken, refreshToken }) {
  if (accessToken) {
    res.cookie('accessToken', accessToken, getCookieOptions(false));
  }
  if (refreshToken) {
    res.cookie('refreshToken', refreshToken, getCookieOptions(true));
  }
}

/**
 * Clears authentication cookies upon user sign-out or session revocation.
 *
 * @param {import('express').Response} res
 */
function clearAuthCookies(res) {
  const clearOpts = {
    ...getCookieOptions(false),
    maxAge: 0,
  };
  delete clearOpts.expires;

  const refreshClearOpts = {
    ...getCookieOptions(true),
    maxAge: 0,
  };
  delete refreshClearOpts.expires;

  res.clearCookie('accessToken', clearOpts);
  res.clearCookie('refreshToken', refreshClearOpts);
}

module.exports = {
  getCookieOptions,
  setAuthCookies,
  clearAuthCookies,
};

