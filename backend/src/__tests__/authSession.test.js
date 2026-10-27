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

describe('Workstream A2 & D: Backend real logout, token revocation, no-store headers, and OTP hardening', () => {
  test('API response headers include Cache-Control no-store and Pragma no-cache', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.headers['cache-control']).toContain('max-age=0');
    expect(res.headers['pragma']).toBe('no-cache');
  });

  test('old access token and old refresh token are rejected after logout', async () => {
    // 1. Create a user
    const user = await User.create({
      name: 'Session Patient',
      email: 'session@example.com',
      phone: '9898989898',
      password: 'Password123!',
      role: 'patient',
      isEmailVerified: true,
    });

    // 2. Login
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'session@example.com',
      password: 'Password123!',
    });
    expect(loginRes.status).toBe(200);
    const { accessToken, refreshToken } = loginRes.body.data;
    expect(accessToken).toBeDefined();
    expect(refreshToken).toBeDefined();

    // 3. Access token works before logout
    const meBefore = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(meBefore.status).toBe(200);

    // 4. Logout
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });
    expect(logoutRes.status).toBe(200);

    // 5. Old access token returns 401
    const meAfter = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(meAfter.status).toBe(401);

    // 6. Old refresh token returns 401
    const refreshAfter = await request(app)
      .post('/api/auth/refresh-token')
      .send({ refreshToken });
    expect(refreshAfter.status).toBe(401);
  });

  test('password change invalidates existing sessions', async () => {
    // 1. Create user
    await User.create({
      name: 'Pass Change User',
      email: 'passchange@example.com',
      phone: '9797979797',
      password: 'OldPassword123!',
      role: 'patient',
      isEmailVerified: true,
    });

    // 2. Login to get token
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'passchange@example.com',
      password: 'OldPassword123!',
    });
    const { accessToken, refreshToken } = loginRes.body.data;

    // 3. Change password
    const changeRes = await request(app)
      .patch('/api/auth/update-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword123!',
      });
    expect(changeRes.status).toBe(200);
    const newTokens = changeRes.body.data;

    // 4. Old access token is now rejected
    const oldMe = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(oldMe.status).toBe(401);

    // 5. Old refresh token is also rejected
    const oldRefresh = await request(app)
      .post('/api/auth/refresh-token')
      .send({ refreshToken });
    expect(oldRefresh.status).toBe(401);

    // 6. New access token works
    const newMe = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${newTokens.accessToken}`);
    expect(newMe.status).toBe(200);
  });

  test('deactivated user cannot refresh token or access protected routes', async () => {
    // 1. Create staff/user
    const user = await User.create({
      name: 'Deactivate Target',
      email: 'deact@example.com',
      phone: '9696969696',
      password: 'Password123!',
      role: 'receptionist',
    });

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'deact@example.com',
      password: 'Password123!',
    });
    const { accessToken, refreshToken } = loginRes.body.data;

    // 2. Deactivate the user
    user.active = false;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save({ validateBeforeSave: false });

    // 3. Refresh token returns 401
    const refreshRes = await request(app)
      .post('/api/auth/refresh-token')
      .send({ refreshToken });
    expect(refreshRes.status).toBe(401);

    // 4. Access token returns 401
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(meRes.status).toBe(401);
  });

  test('OTP lockout occurs after 5 incorrect attempts with 15-minute lock', async () => {
    const user = await User.create({
      name: 'OTP Lockout Patient',
      email: 'otplockout@example.com',
      phone: '9595959595',
      password: 'Password123!',
      role: 'patient',
    });

    // Set an active OTP
    const { hashOTP } = require('../utils/generateOTP');
    user.otpHash = hashOTP('123456');
    user.otpExpires = Date.now() + 10 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

    // 5 failed attempts
    for (let i = 1; i <= 4; i++) {
      const res = await request(app).post('/api/auth/verify-otp').send({
        userId: user._id,
        otp: '999999',
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Invalid (code|OTP)/);
    }

    // 5th failed attempt triggers lock
    const res5 = await request(app).post('/api/auth/verify-otp').send({
      userId: user._id,
      otp: '999999',
    });
    expect(res5.status).toBe(400);

    // 6th attempt is locked out with 429
    const res6 = await request(app).post('/api/auth/verify-otp').send({
      userId: user._id,
      otp: '123456', // Even with correct OTP
    });
    expect(res6.status).toBe(429);
    expect(res6.body.message).toContain('Account locked');
  });

  test('per-session isolation: logging out on Device A does not log out Device B', async () => {
    const user = await User.create({
      name: 'Multi Device User',
      email: 'multidevice@example.com',
      phone: '9494949494',
      password: 'Password123!',
      role: 'patient',
      isEmailVerified: true,
    });

    // 1. Device A logs in
    const loginA = await request(app).post('/api/auth/login').send({
      email: 'multidevice@example.com',
      password: 'Password123!',
    });
    const { accessToken: tokenA, refreshToken: refreshA } = loginA.body.data;

    // 2. Device B logs in
    const loginB = await request(app).post('/api/auth/login').send({
      email: 'multidevice@example.com',
      password: 'Password123!',
    });
    const { accessToken: tokenB, refreshToken: refreshB } = loginB.body.data;

    // 3. Device A logs out
    const logoutA = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ refreshToken: refreshA });
    expect(logoutA.status).toBe(200);

    // 4. Device A is revoked
    const meA = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenA}`);
    expect(meA.status).toBe(401);
    const refreshResA = await request(app).post('/api/auth/refresh-token').send({ refreshToken: refreshA });
    expect(refreshResA.status).toBe(401);

    // 5. Device B remains authenticated and can access /auth/me and refresh tokens
    const meB = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenB}`);
    expect(meB.status).toBe(200);
    expect(meB.body.data.user.email).toBe('multidevice@example.com');

    const refreshResB = await request(app).post('/api/auth/refresh-token').send({ refreshToken: refreshB });
    expect(refreshResB.status).toBe(200);
    expect(refreshResB.body.data.accessToken).toBeDefined();
  });

  test('real refresh token rotation: old refresh token is invalidated upon rotation', async () => {
    const user = await User.create({
      name: 'Rotation User',
      email: 'rotation@example.com',
      phone: '9393939393',
      password: 'Password123!',
      role: 'patient',
      isEmailVerified: true,
    });

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'rotation@example.com',
      password: 'Password123!',
    });
    const { refreshToken: initialRefresh } = loginRes.body.data;

    // 1. Perform first refresh
    const firstRefresh = await request(app).post('/api/auth/refresh-token').send({ refreshToken: initialRefresh });
    expect(firstRefresh.status).toBe(200);
    const { refreshToken: newRefresh, accessToken: newAccess } = firstRefresh.body.data;
    expect(newRefresh).not.toBe(initialRefresh);

    // 2. Try to reuse the old refresh token (replay attack) -> MUST return 401
    const replayAttempt = await request(app).post('/api/auth/refresh-token').send({ refreshToken: initialRefresh });
    expect(replayAttempt.status).toBe(401);
    expect(replayAttempt.body.message).toMatch(/Invalid or expired/i);

    // 3. The new refresh token works
    const secondRefresh = await request(app).post('/api/auth/refresh-token').send({ refreshToken: newRefresh });
    expect(secondRefresh.status).toBe(200);
  });
});
