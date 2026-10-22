const getSeedAdminConfig = require('../seedAdminConfig');

describe('first-admin seed configuration', () => {
  test('refuses missing credentials before database work', () => {
    expect(() => getSeedAdminConfig({})).toThrow('ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_PHONE are required');
  });

  test('uses explicit environment values without logging credentials', () => {
    expect(getSeedAdminConfig({ ADMIN_EMAIL: 'ADMIN@example.com', ADMIN_PASSWORD: 'secret-value', ADMIN_PHONE: '+911234567890' })).toEqual({
      email: 'admin@example.com',
      password: 'secret-value',
      phone: '+911234567890',
      name: 'Clinic Admin',
    });
  });
});