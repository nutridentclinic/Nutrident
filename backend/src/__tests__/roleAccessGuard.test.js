const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('../config/firebase', () => ({
  auth: () => ({ verifyIdToken: jest.fn() }),
  messaging: () => ({ send: jest.fn().mockResolvedValue('fake-msg-id') }),
  isConfigured: () => false,
}));

jest.mock('../config/email', () => ({
  sendEmail: jest.fn().mockResolvedValue({ messageId: 'mock-msg' }),
}));

const app = require('../app');
const User = require('../models/User');
const Dentist = require('../models/Dentist');
const { signAccessToken } = require('../utils/generateToken');

let mongoServer;
let patientToken;
let dentistToken;
let receptionistToken;
let adminToken;

jest.setTimeout(60000);

beforeAll(async () => {
  process.env.JWT_SECRET = 'test_jwt_secret_at_least_32_characters_long_for_test!';
  process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_at_least_32_chars_long!';
  process.env.SINGLE_DENTIST_MODE = 'true';
  process.env.CLINIC_TIMEZONE = 'Asia/Kolkata';

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const patient = await User.create({
    name: 'Test Patient',
    email: 'patient@clinic.test',
    password: 'Password123!',
    phone: '9876543201',
    role: 'patient',
    isEmailVerified: true,
  });
  patientToken = signAccessToken({ id: patient._id, role: 'patient' });

  const dentistUser = await User.create({
    name: 'Dr. Shraddha',
    email: 'dentist@clinic.test',
    password: 'Password123!',
    phone: '9876543202',
    role: 'dentist',
    isEmailVerified: true,
  });
  await Dentist.create({
    user: dentistUser._id,
    specialization: 'Orthodontics',
    consultationFee: 500,
    slotDurationMinutes: 30,
    isVerified: true,
    isActive: true,
  });
  dentistToken = signAccessToken({ id: dentistUser._id, role: 'dentist' });

  const receptionist = await User.create({
    name: 'Front Desk',
    email: 'reception@clinic.test',
    password: 'Password123!',
    phone: '9876543203',
    role: 'receptionist',
    isEmailVerified: true,
  });
  receptionistToken = signAccessToken({ id: receptionist._id, role: 'receptionist' });

  const admin = await User.create({
    name: 'Admin Manager',
    email: 'admin@clinic.test',
    password: 'Password123!',
    phone: '9876543204',
    role: 'admin',
    isEmailVerified: true,
  });
  adminToken = signAccessToken({ id: admin._id, role: 'admin' });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Backend Role Access Guards & Cross-Role Isolation', () => {
  describe('1. /api/admin/* endpoints require admin role', () => {
    it('blocks unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/admin/system-status');
      expect(res.status).toBe(401);
    });

    it('blocks patient access with 403', async () => {
      const res = await request(app)
        .get('/api/admin/system-status')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(res.status).toBe(403);
    });

    it('blocks receptionist access with 403', async () => {
      const res = await request(app)
        .get('/api/admin/system-status')
        .set('Authorization', `Bearer ${receptionistToken}`);
      expect(res.status).toBe(403);
    });

    it('blocks dentist access with 403', async () => {
      const res = await request(app)
        .get('/api/admin/system-status')
        .set('Authorization', `Bearer ${dentistToken}`);
      expect(res.status).toBe(403);
    });

    it('permits admin access with 200', async () => {
      const res = await request(app)
        .get('/api/admin/system-status')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('2. /api/dashboard/* endpoints isolate role data', () => {
    it('admin dashboard endpoints: block patient, receptionist, dentist; permit admin', async () => {
      const pRes = await request(app)
        .get('/api/dashboard/admin')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(pRes.status).toBe(403);

      const rRes = await request(app)
        .get('/api/dashboard/admin')
        .set('Authorization', `Bearer ${receptionistToken}`);
      expect(rRes.status).toBe(403);

      const dRes = await request(app)
        .get('/api/dashboard/admin')
        .set('Authorization', `Bearer ${dentistToken}`);
      expect(dRes.status).toBe(403);

      const aRes = await request(app)
        .get('/api/dashboard/admin')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(aRes.status).toBe(200);
      expect(aRes.body.success).toBe(true);
    });

    it('dentist dashboard endpoints: block patient, receptionist; permit dentist', async () => {
      const pRes = await request(app)
        .get('/api/dashboard/dentist/me')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(pRes.status).toBe(403);

      const rRes = await request(app)
        .get('/api/dashboard/dentist/me')
        .set('Authorization', `Bearer ${receptionistToken}`);
      expect(rRes.status).toBe(403);

      const dRes = await request(app)
        .get('/api/dashboard/dentist/me')
        .set('Authorization', `Bearer ${dentistToken}`);
      expect(dRes.status).toBe(200);
      expect(dRes.body.success).toBe(true);
    });

    it('receptionist dashboard endpoints: block patient, dentist; permit receptionist', async () => {
      const pRes = await request(app)
        .get('/api/dashboard/receptionist')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(pRes.status).toBe(403);

      const dRes = await request(app)
        .get('/api/dashboard/receptionist')
        .set('Authorization', `Bearer ${dentistToken}`);
      expect(dRes.status).toBe(403);

      const rRes = await request(app)
        .get('/api/dashboard/receptionist')
        .set('Authorization', `Bearer ${receptionistToken}`);
      expect(rRes.status).toBe(200);
      expect(rRes.body.success).toBe(true);
    });
  });
});

