const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('../config/firebase', () => ({
  auth: () => ({ verifyIdToken: jest.fn() }),
  messaging: () => ({ send: jest.fn().mockResolvedValue('fake-msg-id') }),
  isConfigured: () => false,
}));

jest.mock('../config/razorpay', () => ({
  orders: { create: jest.fn().mockResolvedValue({ id: 'order_mock_123', amount: 50000 }) },
  payments: { refund: jest.fn().mockResolvedValue({ id: 'rfnd_mock_123', amount: 50000 }) },
}));

jest.mock('../config/email', () => ({
  sendEmail: jest.fn().mockResolvedValue({ messageId: 'mock-msg' }),
}));

jest.mock('../config/cloudinary', () => {
  const actual = jest.requireActual('../config/cloudinary');
  return {
    ...actual,
    cloudinary: {
      ...actual.cloudinary,
      api: {
        ping: jest.fn().mockResolvedValue({ status: 'ok' }),
      },
      uploader: {
        upload_stream: jest.fn(),
        destroy: jest.fn().mockResolvedValue({ result: 'ok' }),
      },
    },
  };
});

const app = require('../app');
const User = require('../models/User');
const Dentist = require('../models/Dentist');
const Appointment = require('../models/Appointment');
const TreatmentPlan = require('../models/TreatmentPlan');
const Treatment = require('../models/Treatment');
const upload = require('../middleware/upload.middleware');
const { signAccessToken } = require('../utils/generateToken');
const seedDoctor = require('../utils/seedDoctor');

let mongoServer;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test_jwt_secret_at_least_32_characters_long_for_test!';
  process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_at_least_32_chars_long!';
  process.env.SINGLE_DENTIST_MODE = 'true';
  process.env.CLINIC_TIMEZONE = 'Asia/Kolkata';
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Dentist.deleteMany({});
  await Appointment.deleteMany({});
  await TreatmentPlan.deleteMany({});
  await Treatment.deleteMany({});
});

describe('N1, N2, and N3 Root Cause Fix Verification', () => {
  // Helper to format YYYY-MM-DD
  const toLocalDateStr = (dt) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  describe('N1: Doctor Booking Readiness and Specific Failure Codes', () => {
    it('seeded doctor allows patient to complete booking; flipping flags returns matching specific codes', async () => {
      // 1. Seed doctor
      process.env.DOCTOR_EMAIL = 'siddheshvpatil02@gmail.com';
      process.env.DOCTOR_PASSWORD = 'Dentist@123';
      process.env.DOCTOR_PHONE = '+919876543210';
      process.env.DOCTOR_NAME = 'Dr. Siddhesh Patil';
      await seedDoctor();

      const doctorProfile = await Dentist.findOne();
      expect(doctorProfile).toBeDefined();
      expect(doctorProfile.isVerified).toBe(true);
      expect(doctorProfile.isActive).toBe(true);
      expect(doctorProfile.pausedUntil).toBeNull();
      expect(doctorProfile.slotDurationMinutes).toBe(30);
      expect(doctorProfile.consultationFee).toBe(500);

      // Create a verified patient
      const patient = await User.create({
        name: 'Patient One',
        email: 'patient1@clinic.test',
        phone: '9888880001',
        password: 'Password123!',
        role: 'patient',
        isEmailVerified: true,
      });
      const patientToken = signAccessToken({ id: patient._id, role: 'patient', tv: 0 });

      // Find next Monday date for booking
      const d = new Date();
      d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7));
      const nextMondayStr = toLocalDateStr(d);

      // A: Seeded doctor can be booked successfully!
      const okRes = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          date: nextMondayStr,
          startTime: '10:00',
          mode: 'in-clinic',
          reasonForVisit: 'General checkup',
        });

      expect(okRes.status).toBe(201);
      expect(okRes.body.success).toBe(true);
      expect(okRes.body.data.dentist).toBe(String(doctorProfile._id));

      // Clean up appointment for next tests
      await Appointment.deleteMany({});

      // B: Flip isVerified to false -> returns 400 with DOCTOR_NOT_VERIFIED
      doctorProfile.isVerified = false;
      await doctorProfile.save();

      const unverifiedRes = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          date: nextMondayStr,
          startTime: '10:00',
          mode: 'in-clinic',
        });

      expect(unverifiedRes.status).toBe(400);
      expect(unverifiedRes.body.code).toBe('DOCTOR_NOT_VERIFIED');
      expect(unverifiedRes.body.message).toMatch(/Credentials not verified/i);

      // Restore isVerified
      doctorProfile.isVerified = true;

      // C: Flip isActive to false -> returns 400 with DOCTOR_PAUSED
      doctorProfile.isActive = false;
      await doctorProfile.save();

      const pausedRes = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          date: nextMondayStr,
          startTime: '10:00',
          mode: 'in-clinic',
        });

      expect(pausedRes.status).toBe(400);
      expect(pausedRes.body.code).toBe('DOCTOR_PAUSED');
      expect(pausedRes.body.message).toMatch(/Not accepting new appointments/i);

      // D: Set pausedUntil to future with reason -> returns 400 with DOCTOR_PAUSED and specific message
      doctorProfile.isActive = true;
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      doctorProfile.pausedUntil = futureDate;
      doctorProfile.pausedReason = 'Attending Dental Conference';
      await doctorProfile.save();

      const pausedUntilRes = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          date: nextMondayStr,
          startTime: '10:00',
          mode: 'in-clinic',
        });

      expect(pausedUntilRes.status).toBe(400);
      expect(pausedUntilRes.body.code).toBe('DOCTOR_PAUSED');
      expect(pausedUntilRes.body.message).toMatch(/Appointments paused until/i);
      expect(pausedUntilRes.body.message).toMatch(/Attending Dental Conference/i);

      // E: Clear weeklyAvailability -> returns 400 with NO_AVAILABILITY
      doctorProfile.pausedUntil = null;
      doctorProfile.pausedReason = '';
      doctorProfile.weeklyAvailability = [];
      await doctorProfile.save();

      const noAvailRes = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          date: nextMondayStr,
          startTime: '10:00',
          mode: 'in-clinic',
        });

      expect(noAvailRes.status).toBe(400);
      expect(noAvailRes.body.code).toBe('NO_AVAILABILITY');
      expect(noAvailRes.body.message).toMatch(/Weekly hours not set/i);
    });
  });

  describe('N2: Cloudinary Upload Middleware Error Codes & Admin Diagnostics', () => {
    let uploadApp;
    const origEnv = { ...process.env };

    beforeEach(() => {
      uploadApp = express();
      uploadApp.use(express.json());
      uploadApp.post('/test-upload', upload('test').single('file'), (req, res) => {
        res.status(200).json({ success: true, file: req.file });
      });
      uploadApp.use((err, req, res, next) => {
        res.status(err.statusCode || 500).json({
          success: false,
          code: err.code || 'UNKNOWN',
          message: err.message,
        });
      });
    });

    afterEach(() => {
      process.env = { ...origEnv };
    });

    it('returns UPLOAD_NOT_CONFIGURED when Cloudinary credentials are missing', async () => {
      delete process.env.CLOUDINARY_CLOUD_NAME;
      delete process.env.CLOUDINARY_API_KEY;
      delete process.env.CLOUDINARY_API_SECRET;

      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
      const res = await request(uploadApp)
        .post('/test-upload')
        .attach('file', pngBuffer, 'test.png');

      expect(res.status).toBe(503);
      expect(res.body.code).toBe('UPLOAD_NOT_CONFIGURED');
    });

    it('returns UPLOAD_BAD_TYPE on unsupported file magic bytes', async () => {
      process.env.CLOUDINARY_CLOUD_NAME = 'demo';
      process.env.CLOUDINARY_API_KEY = '123456789012345';
      process.env.CLOUDINARY_API_SECRET = 'abcdef123456789';

      const invalidBuffer = Buffer.from('Plain text file content, not an image or pdf');
      const res = await request(uploadApp)
        .post('/test-upload')
        .attach('file', invalidBuffer, 'doc.txt');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('UPLOAD_BAD_TYPE');
      expect(res.body.message).toMatch(/Unsupported file type/i);
    });

    it('returns UPLOAD_TOO_LARGE when file exceeds 10MB limit', async () => {
      process.env.CLOUDINARY_CLOUD_NAME = 'demo';
      process.env.CLOUDINARY_API_KEY = '123456789012345';
      process.env.CLOUDINARY_API_SECRET = 'abcdef123456789';

      const largeBuffer = Buffer.alloc(10.5 * 1024 * 1024);
      largeBuffer[0] = 0x89;
      largeBuffer[1] = 0x50;
      largeBuffer[2] = 0x4e;
      largeBuffer[3] = 0x47;

      const res = await request(uploadApp)
        .post('/test-upload')
        .attach('file', largeBuffer, 'large.png');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('UPLOAD_TOO_LARGE');
    });

    it('GET /api/admin/system-status provides detailed Cloudinary diagnostics and lists missing variables without secrets', async () => {
      const admin = await User.create({
        name: 'Admin Sys',
        email: 'adminsys@clinic.test',
        phone: '9999990111',
        password: 'Password123!',
        role: 'admin',
      });
      const adminToken = signAccessToken({ id: admin._id, role: 'admin', tv: 0 });

      // Simulate missing CLOUDINARY_API_SECRET
      process.env.CLOUDINARY_CLOUD_NAME = 'clinic-cloud';
      process.env.CLOUDINARY_API_KEY = '123456789012345';
      delete process.env.CLOUDINARY_API_SECRET;

      const res = await request(app)
        .get('/api/admin/system-status')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.cloudinaryPing).toBe('not_configured');
      expect(res.body.data.missingCloudinaryVars).toContain('CLOUDINARY_API_SECRET');
      // Ensure secrets are never exposed
      expect(res.body.data).not.toHaveProperty('CLOUDINARY_API_SECRET');
      expect(res.body.data.cloudinary).toBeDefined();
      expect(res.body.data.cloudinary.pingStatus).toBe('not_configured');
    });
  });

  describe('N3: Treatment Plans Creation, FDI Tooth Validation, and Normalization', () => {
    it('validates treatment plan input and returns 422 on invalid FDI tooth or missing steps', async () => {
      const docUser = await User.create({
        name: 'Dr. Ortho',
        email: 'ortho@clinic.test',
        phone: '9999990222',
        password: 'Password123!',
        role: 'dentist',
      });
      await Dentist.create({ user: docUser._id, specialization: 'Orthodontics', consultationFee: 600 });
      const docToken = signAccessToken({ id: docUser._id, role: 'dentist', tv: 0 });

      const patient = await User.create({
        name: 'Plan Patient',
        email: 'planpat@clinic.test',
        phone: '9999990333',
        password: 'Password123!',
        role: 'patient',
        isEmailVerified: true,
      });

      // 1. Missing title and empty steps -> 422
      const res1 = await request(app)
        .post('/api/treatment-plans')
        .set('Authorization', `Bearer ${docToken}`)
        .send({
          patientId: patient._id,
          title: '',
          steps: [],
        });

      expect(res1.status).toBe(422);
      expect(res1.body.success).toBe(false);

      // 2. Invalid FDI tooth number (e.g. 99) -> 422
      const res2 = await request(app)
        .post('/api/treatment-plans')
        .set('Authorization', `Bearer ${docToken}`)
        .send({
          patientId: patient._id,
          title: 'Root Canal Plan',
          steps: [
            {
              name: 'RCT Step 1',
              cost: 1500,
              toothNumbers: [99], // Invalid FDI tooth!
            },
          ],
        });

      expect(res2.status).toBe(422);
      expect(res2.body.errors.some((e) => /Invalid tooth number/i.test(e.message))).toBe(true);
    });

    it('creates multi-step plan with catalog treatments, FDI teeth, and returns normalized requiresFollowUp / teeth to patient and staff', async () => {
      const docUser = await User.create({
        name: 'Dr. Clinician',
        email: 'docclin@clinic.test',
        phone: '9999990444',
        password: 'Password123!',
        role: 'dentist',
      });
      const dentist = await Dentist.create({ user: docUser._id, specialization: 'Restorative', consultationFee: 500 });
      const docToken = signAccessToken({ id: docUser._id, role: 'dentist', tv: 0 });

      const patient = await User.create({
        name: 'Jane Patient',
        email: 'janepat@clinic.test',
        phone: '9999990555',
        password: 'Password123!',
        role: 'patient',
        isEmailVerified: true,
      });
      const patientToken = signAccessToken({ id: patient._id, role: 'patient', tv: 0 });

      // Create treatments in catalog
      const t1 = await Treatment.create({ name: 'Scaling & Polishing', category: 'Preventive', defaultCost: 1200 });
      const t2 = await Treatment.create({ name: 'Composite Restoration', category: 'Restorative', defaultCost: 2000 });
      const t3 = await Treatment.create({ name: 'Crown Placement', category: 'Prosthodontics', defaultCost: 6500 });

      // Doctor creates 3-step treatment plan
      const createRes = await request(app)
        .post('/api/treatment-plans')
        .set('Authorization', `Bearer ${docToken}`)
        .send({
          patientId: patient._id,
          title: 'Full Mouth Rehabilitation',
          notes: 'Comprehensive plan across 3 sessions',
          followUpRequired: true,
          followUpDate: '2026-11-20T10:00:00.000Z',
          steps: [
            {
              treatment: t1._id,
              name: 'Scaling & Polishing',
              cost: 1200,
              toothNumbers: [], // General
              status: 'planned',
            },
            {
              treatment: t2._id,
              name: 'Composite Filling on 16 & 26',
              cost: 4000,
              toothNumbers: [16, 26], // FDI upper molars
              status: 'planned',
            },
            {
              treatment: t3._id,
              name: 'Zirconia Crown on 36',
              cost: 7000,
              toothNumbers: [36], // FDI lower molar
              status: 'planned',
            },
          ],
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.success).toBe(true);
      const createdPlan = createRes.body.data;
      expect(createdPlan.totalEstimatedCost).toBe(12200);
      expect(createdPlan.requiresFollowUp).toBe(true);
      expect(createdPlan.followUpRequired).toBe(true);
      expect(createdPlan.steps).toHaveLength(3);
      expect(createdPlan.steps[1].teeth).toEqual([16, 26]);
      expect(createdPlan.steps[1].toothNumbers).toEqual([16, 26]);

      // Patient retrieves plan via GET /api/treatment-plans/me
      const myPlansRes = await request(app)
        .get('/api/treatment-plans/me')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(myPlansRes.status).toBe(200);
      expect(myPlansRes.body.success).toBe(true);
      expect(myPlansRes.body.data).toHaveLength(1);

      const patientPlan = myPlansRes.body.data[0];
      expect(patientPlan.title).toBe('Full Mouth Rehabilitation');
      expect(patientPlan.requiresFollowUp).toBe(true);
      expect(patientPlan.followUpRequired).toBe(true);
      expect(patientPlan.steps[0].name).toBe('Scaling & Polishing');
      expect(patientPlan.steps[1].teeth).toEqual([16, 26]);
      expect(patientPlan.steps[2].teeth).toEqual([36]);

      // Receptionist/Admin retrieves plan via GET /api/treatment-plans/patient/:patientId
      const recUser = await User.create({
        name: 'Front Desk',
        email: 'recplan@clinic.test',
        phone: '9999990666',
        password: 'Password123!',
        role: 'receptionist',
      });
      const recToken = signAccessToken({ id: recUser._id, role: 'receptionist', tv: 0 });

      const patientPlansRes = await request(app)
        .get(`/api/treatment-plans/patient/${patient._id}`)
        .set('Authorization', `Bearer ${recToken}`);

      expect(patientPlansRes.status).toBe(200);
      expect(patientPlansRes.body.success).toBe(true);
      expect(patientPlansRes.body.data).toHaveLength(1);
      expect(patientPlansRes.body.data[0].requiresFollowUp).toBe(true);
      expect(patientPlansRes.body.data[0].steps[1].teeth).toEqual([16, 26]);
    });
  });
});
