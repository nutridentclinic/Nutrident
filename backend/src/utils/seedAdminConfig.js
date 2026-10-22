module.exports = (env = process.env) => {
  const email = String(env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(env.ADMIN_PASSWORD || '');
  const phone = String(env.ADMIN_PHONE || '').trim();
  if (!email || !password || !phone) {
    throw new Error('ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_PHONE are required to seed the first admin.');
  }
  return { email, password, phone, name: String(env.ADMIN_NAME || 'Clinic Admin').trim() };
};