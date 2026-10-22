const getCorsOrigins = (env = process.env) => {
  const origins = (env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (!origins.length) origins.push(env.CLIENT_URL, env.DENTIST_PANEL_URL);
  if (env.NODE_ENV !== 'production') {
    origins.push(
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
    );
  }
  return [...new Set(origins.filter(Boolean))];
};

module.exports = getCorsOrigins;