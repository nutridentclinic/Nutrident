const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'super_secret_jwt_key_that_is_at_least_64_characters_long_for_security_tests_12345';
process.env.JWT_REFRESH_SECRET = 'super_secret_jwt_refresh_key_that_is_at_least_64_characters_long_for_tests_67890';
process.env.BCRYPT_SALT_ROUNDS = '4';

jest.mock('../config/firebase', () => ({
  auth: () => ({ verifyIdToken: jest.fn() }),
  isConfigured: () => false,
  messaging: () => ({ send: jest.fn() }),
}));

const app = require('../app');
const User = require('../models/User');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany();
  }
});

describe('Secure HTTP-Only Cookie Authentication & Lifecycle', () => {
  test('login sets HttpOnly accessToken and refreshToken cookies', async () => {
    await User.create({
      name: 'Cookie Patient',
      email: 'cookie.patient@example.com',
      phone: '9876543210',
      password: 'Password123!',
      role: 'patient',
      isEmailVerified: true,
    });

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'cookie.patient@example.com',
      password: 'Password123!',
    });

    expect(loginRes.status).toBe(200);

    const cookies = loginRes.headers['set-cookie'];
    expect(cookies).toBeDefined();

    const accessCookie = cookies.find((c) => c.startsWith('accessToken='));
    const refreshCookie = cookies.find((c) => c.startsWith('refreshToken='));

    expect(accessCookie).toBeDefined();
    expect(accessCookie.toLowerCase()).toContain('httponly');
    expect(accessCookie.toLowerCase()).toContain('path=/');

    expect(refreshCookie).toBeDefined();
    expect(refreshCookie.toLowerCase()).toContain('httponly');
    expect(refreshCookie.toLowerCase()).toContain('path=/');
  });

  test('protected route allows access using HTTP-Only cookie without Authorization header', async () => {
    await User.create({
      name: 'Cookie Doctor',
      email: 'doctor@example.com',
      phone: '9876543211',
      password: 'Password123!',
      role: 'dentist',
      isEmailVerified: true,
    });

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'doctor@example.com',
      password: 'Password123!',
    });

    const rawCookies = loginRes.headers['set-cookie'];
    const accessCookieHeader = rawCookies.find((c) => c.startsWith('accessToken=')).split(';')[0];

    // Request /me with Cookie header and NO Authorization header
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', [accessCookieHeader]);

    expect(meRes.status).toBe(200);
    expect(meRes.body.success).toBe(true);
    expect(meRes.body.data.user.email).toBe('doctor@example.com');
  });

  test('refresh-token works using refreshToken cookie and rotates cookies', async () => {
    await User.create({
      name: 'Refresh Patient',
      email: 'refresh@example.com',
      phone: '9876543212',
      password: 'Password123!',
      role: 'patient',
      isEmailVerified: true,
    });

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'refresh@example.com',
      password: 'Password123!',
    });

    const rawCookies = loginRes.headers['set-cookie'];
    const refreshCookieHeader = rawCookies.find((c) => c.startsWith('refreshToken=')).split(';')[0];

    // Call /refresh-token with empty body and refreshToken Cookie
    const refreshRes = await request(app)
      .post('/api/auth/refresh-token')
      .set('Cookie', [refreshCookieHeader])
      .send({});

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.success).toBe(true);

    const newCookies = refreshRes.headers['set-cookie'];
    expect(newCookies).toBeDefined();
    expect(newCookies.some((c) => c.startsWith('accessToken='))).toBe(true);
    expect(newCookies.some((c) => c.startsWith('refreshToken='))).toBe(true);
  });

  test('logout clears accessToken and refreshToken cookies', async () => {
    await User.create({
      name: 'Logout Patient',
      email: 'logout@example.com',
      phone: '9876543213',
      password: 'Password123!',
      role: 'patient',
      isEmailVerified: true,
    });

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'logout@example.com',
      password: 'Password123!',
    });

    const rawCookies = loginRes.headers['set-cookie'];
    const accessCookieHeader = rawCookies.find((c) => c.startsWith('accessToken=')).split(';')[0];
    const refreshCookieHeader = rawCookies.find((c) => c.startsWith('refreshToken=')).split(';')[0];

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', [accessCookieHeader, refreshCookieHeader])
      .send({});

    expect(logoutRes.status).toBe(200);

    const clearedCookies = logoutRes.headers['set-cookie'];
    expect(clearedCookies).toBeDefined();

    // Check that cookies are expired / cleared
    const clearedAccess = clearedCookies.find((c) => c.startsWith('accessToken='));
    const clearedRefresh = clearedCookies.find((c) => c.startsWith('refreshToken='));

    expect(clearedAccess).toBeDefined();
    expect(clearedAccess).toMatch(/accessToken=;?(?:.*expires=Thu, 01 Jan 1970|.*Max-Age=0)/i);

    expect(clearedRefresh).toBeDefined();
    expect(clearedRefresh).toMatch(/refreshToken=;?(?:.*expires=Thu, 01 Jan 1970|.*Max-Age=0)/i);
  });
});

