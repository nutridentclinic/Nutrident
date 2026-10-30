const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const crypto = require('crypto');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'super_secret_jwt_key_that_is_at_least_64_characters_long_for_security_tests_12345';
process.env.JWT_REFRESH_SECRET = 'super_secret_jwt_refresh_key_that_is_at_least_64_characters_long_for_tests_67890';
process.env.OTP_SECRET = 'super_secret_otp_key_that_is_at_least_32_characters_long_1234567890';
process.env.BCRYPT_SALT_ROUNDS = '4';
process.env.SINGLE_DENTIST_MODE = 'true';
process.env.CLINIC_TIMEZONE = 'Asia/Kolkata';

jest.mock('../config/firebase', () => ({
  auth: () => ({ verifyIdToken: jest.fn() }),
  isConfigured: () => false,
  messaging: () => ({ send: jest.fn() }),
}));

const mockSendEmail = jest.fn().mockResolvedValue({ messageId: 'mock-email-id' });
jest.mock('../config/email', () => ({
  sendEmail: (...args) => mockSendEmail(...args),
}));

const mockCloudinaryPing = jest.fn().mockResolvedValue({ status: 'ok' });
const mockCloudinaryDestroy = jest.fn().mockResolvedValue({ result: 'ok' });
jest.mock('cloudinary', () => {
  const original = jest.requireActual('cloudinary');
  return {
    ...original,
    v2: {
      ...original.v2,
      config: jest.fn(),
      api: {
        ping: () => mockCloudinaryPing(),
      },
      uploader: {
        destroy: (...args) => mockCloudinaryDestroy(...args),
      },
    },
  };
});

const app = require('../app');
const User = require('../models/User');
const Patient = require('../models/Patient');
const MedicalRecord = require('../models/MedicalRecord');
const { generateOTP, hashOTP, compareOTP, normalizeValue, getNormalizedCloudinaryConfig } = require('../utils/otp');
const { normalizeValue: normCloudinary, getNormalizedCloudinaryConfig: getCloudinaryConf } = require('../config/cloudinary');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  mockSendEmail.mockClear();
  mockCloudinaryPing.mockClear();
  mockCloudinaryDestroy.mockClear();

  process.env.CLOUDINARY_CLOUD_NAME = 'MyValidCloud';
  process.env.CLOUDINARY_API_KEY = '123456789012345';
  process.env.CLOUDINARY_API_SECRET = 'secret_test_key_12345';

  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany();
  }
});

describe('Problem 1: Mandatory Email OTP Verification', () => {
  test('POST /auth/register creates unverified patient, returns no tokens, requiresVerification=true', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'New Patient',
      email: 'newpatient@example.com',
      phone: '9123456780',
      password: 'Password123!',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.requiresVerification).toBe(true);
    expect(res.body.data.otpSent).toBe(true);
    expect(res.body.data.accessToken).toBeUndefined();
    expect(res.body.data.refreshToken).toBeUndefined();
    expect(res.body.data.email).toBe('newpatient@example.com');
    expect(res.body.data.resendAvailableAt).toBeTruthy();

    const savedUser = await User.findOne({ email: 'newpatient@example.com' }).select('+isEmailVerified');
    expect(savedUser.isEmailVerified).toBe(false);

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'newpatient@example.com',
        subject: 'Verify your email',
      })
    );
  });

  test('POST /auth/register overwrites abandoned unverified account but rejects verified with 409', async () => {
    // 1. Initial unverified user
    await request(app).post('/api/auth/register').send({
      name: 'Abandoned User',
      email: 'abandoned@example.com',
      phone: '9123456781',
      password: 'OldPassword123!',
    });

    // 2. Re-register same unverified email with new details -> overwrites and returns 201
    const resOverwrite = await request(app).post('/api/auth/register').send({
      name: 'Real User',
      email: 'abandoned@example.com',
      phone: '9123456782',
      password: 'NewPassword123!',
    });
    expect(resOverwrite.status).toBe(201);
    const updatedUser = await User.findOne({ email: 'abandoned@example.com' });
    expect(updatedUser.name).toBe('Real User');
    expect(updatedUser.phone).toBe('9123456782');

    // 3. Verify user
    updatedUser.isEmailVerified = true;
    await updatedUser.save();

    // 4. Try registering verified email -> 409
    const resVerified = await request(app).post('/api/auth/register').send({
      name: 'Intruder',
      email: 'abandoned@example.com',
      phone: '9123456783',
      password: 'Password123!',
    });
    expect(resVerified.status).toBe(409);
    expect(resVerified.body.message).toContain('already exists');
  });

  test('POST /auth/login with correct credentials but unverified patient returns 403 EMAIL_NOT_VERIFIED and no tokens', async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Unverified Patient',
      email: 'unverified@example.com',
      phone: '9123456784',
      password: 'Password123!',
    });

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'unverified@example.com',
      password: 'Password123!',
    });

    expect(loginRes.status).toBe(403);
    expect(loginRes.body.success).toBe(false);
    expect(loginRes.body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(loginRes.body.email).toBe('unverified@example.com');
    expect(loginRes.body.resendAvailableAt).toBeTruthy();
    expect(loginRes.body.data).toBeUndefined();

    // Wrong credentials still gives 401
    const wrongPassRes = await request(app).post('/api/auth/login').send({
      email: 'unverified@example.com',
      password: 'WrongPassword!',
    });
    expect(wrongPassRes.status).toBe(401);
  });

  test('POST /auth/verify-otp with valid code sets isEmailVerified=true and returns auth tokens', async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Verification Target',
      email: 'target@example.com',
      phone: '9123456785',
      password: 'Password123!',
    });

    // Extract the sent code from mockSendEmail
    const emailCall = mockSendEmail.mock.calls.find((call) => call[0].to === 'target@example.com');
    const html = emailCall[0].html;
    const match = html.match(/<b>(\d{6})<\/b>/);
    const code = match ? match[1] : null;
    expect(code).toBeTruthy();

    const verifyRes = await request(app).post('/api/auth/verify-otp').send({
      email: 'target@example.com',
      otp: code,
    });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.data.accessToken).toBeDefined();
    expect(verifyRes.body.data.refreshToken).toBeDefined();
    expect(verifyRes.body.data.user.email).toBe('target@example.com');

    const updated = await User.findOne({ email: 'target@example.com' }).select('+isEmailVerified');
    expect(updated.isEmailVerified).toBe(true);

    // Can now log in and receive tokens
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'target@example.com',
      password: 'Password123!',
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.accessToken).toBeDefined();
  });

  test('OTP purpose isolation: reset OTP cannot verify email and vice versa', async () => {
    const user = await User.create({
      name: 'Purpose Target',
      email: 'purpose@example.com',
      phone: '9123456786',
      password: 'Password123!',
      role: 'patient',
      isEmailVerified: false,
    });

    // Generate reset OTP for user
    await request(app).post('/api/auth/forgot-password').send({
      email: 'purpose@example.com',
    });

    const emailCall = mockSendEmail.mock.calls.find((call) => call[0].to === 'purpose@example.com');
    const code = emailCall[0].html.match(/<b>(\d{6})<\/b>/)[1];

    // Try using this reset code on verify-otp -> must fail
    const verifyRes = await request(app).post('/api/auth/verify-otp').send({
      email: 'purpose@example.com',
      otp: code,
    });
    expect(verifyRes.status).toBe(400);
    expect(verifyRes.body.message).toBe('Invalid code.');

    const checkUser = await User.findById(user._id).select('+isEmailVerified');
    expect(checkUser.isEmailVerified).toBe(false);
  });

  test('Server enforces 60-second resend cooldown with 429', async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Cooldown Patient',
      email: 'cooldown@example.com',
      phone: '9123456787',
      password: 'Password123!',
    });

    // Immediate resend -> 429
    const resendRes = await request(app).post('/api/auth/resend-otp').send({
      email: 'cooldown@example.com',
    });
    expect(resendRes.status).toBe(429);
    expect(resendRes.body.message).toContain('Please wait');
    expect(resendRes.body.retryAfterSeconds).toBeGreaterThan(0);
  });

  test('Protect middleware blocks unverified patient with 403 EMAIL_NOT_VERIFIED, while staff is unaffected', async () => {
    // 1. Unverified patient
    const unverifiedPatient = await User.create({
      name: 'Unverified Patient',
      email: 'unvpat@example.com',
      phone: '9123456788',
      password: 'Password123!',
      role: 'patient',
      isEmailVerified: false,
    });
    const { signAccessToken } = require('../utils/generateToken');
    const patToken = signAccessToken({ id: unverifiedPatient._id, role: 'patient', tv: 0 });

    const patRes = await request(app)
      .get('/api/patients/me')
      .set('Authorization', `Bearer ${patToken}`);
    expect(patRes.status).toBe(403);
    expect(patRes.body.code).toBe('EMAIL_NOT_VERIFIED');

    // 2. Staff user (dentist)
    const doc = await User.create({
      name: 'Doctor Clinician',
      email: 'doctor@example.com',
      phone: '9123456789',
      password: 'Password123!',
      role: 'dentist',
      isEmailVerified: false, // staff not blocked by email verification requirement
    });
    const docToken = signAccessToken({ id: doc._id, role: 'dentist', tv: 0 });

    const docRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${docToken}`);
    expect(docRes.status).toBe(200);
    expect(docRes.body.data.user.email).toBe('doctor@example.com');
  });
});

describe('Problem 2: Two-Step Password Reset', () => {
  test('Single-step reset (email + otp + password) is rejected with 400', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({
      email: 'someone@example.com',
      otp: '123456',
      password: 'NewPassword123!',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Please use the updated password reset flow.');
  });

  test('Full two-step reset flow: forgot -> verify-reset-otp -> reset-password -> invalidates sessions', async () => {
    const user = await User.create({
      name: 'Reset Flow User',
      email: 'resetflow@example.com',
      phone: '9123456790',
      password: 'OldPassword123!',
      role: 'patient',
      isEmailVerified: true,
    });

    // Login to get an active session
    const loginBefore = await request(app).post('/api/auth/login').send({
      email: 'resetflow@example.com',
      password: 'OldPassword123!',
    });
    const { accessToken: oldAccess, refreshToken: oldRefresh } = loginBefore.body.data;

    // Step 1: POST /auth/forgot-password
    const forgotRes = await request(app).post('/api/auth/forgot-password').send({
      email: 'resetflow@example.com',
    });
    expect(forgotRes.status).toBe(200);
    expect(forgotRes.body.success).toBe(true);

    const emailCall = mockSendEmail.mock.calls.find((call) => call[0].to === 'resetflow@example.com');
    const otp = emailCall[0].html.match(/<b>(\d{6})<\/b>/)[1];

    // Step 2: POST /auth/verify-reset-otp
    const verifyOtpRes = await request(app).post('/api/auth/verify-reset-otp').send({
      email: 'resetflow@example.com',
      otp,
    });
    expect(verifyOtpRes.status).toBe(200);
    expect(verifyOtpRes.body.data.resetToken).toBeDefined();
    expect(verifyOtpRes.body.data.expiresInSeconds).toBe(600);
    const { resetToken } = verifyOtpRes.body.data;

    // Step 3: POST /auth/reset-password with resetToken
    const resetRes = await request(app).post('/api/auth/reset-password').send({
      resetToken,
      password: 'BrandNewPassword123!',
    });
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.message).toContain('Password reset successfully');
    expect(resetRes.body.data).toBeUndefined(); // No automatic login tokens

    // 4. Token cannot be reused (single-use)
    const reuseRes = await request(app).post('/api/auth/reset-password').send({
      resetToken,
      password: 'AnotherPassword123!',
    });
    expect(reuseRes.status).toBe(400);

    // 5. Old sessions are invalidated
    const meCheck = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${oldAccess}`);
    expect(meCheck.status).toBe(401);

    const refreshCheck = await request(app).post('/api/auth/refresh-token').send({
      refreshToken: oldRefresh,
    });
    expect(refreshCheck.status).toBe(401);

    // 6. Sign in with new password succeeds
    const newLoginRes = await request(app).post('/api/auth/login').send({
      email: 'resetflow@example.com',
      password: 'BrandNewPassword123!',
    });
    expect(newLoginRes.status).toBe(200);
    expect(newLoginRes.body.data.accessToken).toBeDefined();
  });
});

describe('Problem 3: Cloudinary Normaliser, Uploads & System Status', () => {
  test('Cloudinary normaliser accepts uppercase, hyphens, padded, quoted; rejects placeholders', () => {
    expect(normCloudinary('  MyCloudName  ')).toBe('MyCloudName');
    expect(normCloudinary('"quoted-name"')).toBe('quoted-name');
    expect(normCloudinary("'single-quote'")).toBe('single-quote');

    process.env.CLOUDINARY_CLOUD_NAME = 'MyCloud-123_test';
    process.env.CLOUDINARY_API_KEY = '987654321';
    process.env.CLOUDINARY_API_SECRET = 'secret123';
    expect(getCloudinaryConf().isConfigured).toBe(true);

    process.env.CLOUDINARY_CLOUD_NAME = 'your_cloud_name';
    expect(getCloudinaryConf().isConfigured).toBe(false);

    process.env.CLOUDINARY_CLOUD_NAME = 'replace-me';
    expect(getCloudinaryConf().isConfigured).toBe(false);
  });

  test('Missing Cloudinary config returns 503 with user-friendly message', async () => {
    delete process.env.CLOUDINARY_CLOUD_NAME;

    const patient = await User.create({
      name: 'Upload User',
      email: 'uploaduser@example.com',
      phone: '9123456791',
      password: 'Password123!',
      role: 'patient',
      isEmailVerified: true,
    });
    const { signAccessToken } = require('../utils/generateToken');
    const token = signAccessToken({ id: patient._id, role: 'patient', tv: 0 });

    const res = await request(app)
      .post('/api/medical-records')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('test pdf content'), 'record.pdf');

    expect(res.status).toBe(503);
    expect(res.body.message).toBe('Uploads are temporarily unavailable. Please try again later or contact the clinic.');
  });

  test('GET /api/admin/system-status requires admin role and returns service booleans without secrets', async () => {
    const admin = await User.create({
      name: 'System Admin',
      email: 'sysadmin@clinic.test',
      phone: '9123456792',
      password: 'Password123!',
      role: 'admin',
      isEmailVerified: true,
    });
    const patient = await User.create({
      name: 'Normal Patient',
      email: 'patientstatus@clinic.test',
      phone: '9123456793',
      password: 'Password123!',
      role: 'patient',
      isEmailVerified: true,
    });

    const { signAccessToken } = require('../utils/generateToken');
    const adminToken = signAccessToken({ id: admin._id, role: 'admin', tv: 0 });
    const patientToken = signAccessToken({ id: patient._id, role: 'patient', tv: 0 });

    // Non-admin is blocked with 403
    const patRes = await request(app)
      .get('/api/admin/system-status')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(patRes.status).toBe(403);

    // Admin succeeds
    const adminRes = await request(app)
      .get('/api/admin/system-status')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.success).toBe(true);
    expect(typeof adminRes.body.data.uploads).toBe('boolean');
    expect(typeof adminRes.body.data.email).toBe('boolean');
    expect(typeof adminRes.body.data.payments).toBe('boolean');
    expect(['ok', 'unauthorized', 'unreachable', 'not_configured']).toContain(adminRes.body.data.cloudinaryPing);

    // Ensure no secrets leaked
    const jsonStr = JSON.stringify(adminRes.body);
    expect(jsonStr).not.toContain(process.env.JWT_SECRET);
    expect(jsonStr).not.toContain(process.env.CLOUDINARY_API_SECRET);
  });
});
