const request = require('supertest');
const mongoose = require('mongoose');
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

const app = require('../app');
const User = require('../models/User');
const Dentist = require('../models/Dentist');
const Appointment = require('../models/Appointment');
const ClinicSettings = require('../models/ClinicSettings');
const { signAccessToken } = require('../utils/generateToken');
const { validateSecurityEnv } = require('../utils/validateEnv');

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
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test_jwt_secret_at_least_32_characters_long_for_test!';
  process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_at_least_32_chars_long!';
  process.env.SINGLE_DENTIST_MODE = 'true';
  process.env.CLINIC_TIMEZONE = 'Asia/Kolkata';
  await User.deleteMany({});
  await Dentist.deleteMany({});
  await Appointment.deleteMany({});
  await ClinicSettings.deleteMany({});
});

describe('Workstream B & D Integration Tests', () => {
  describe('Boot Security Check (D2)', () => {
    afterEach(() => {
      process.env.NODE_ENV = 'test';
      process.env.JWT_SECRET = 'test_jwt_secret_at_least_32_characters_long_for_test!';
      process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_at_least_32_chars_long!';
    });

    it('refuses to boot in production if JWT secret is shorter than 32 characters', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'short';
      process.env.JWT_REFRESH_SECRET = 'a'.repeat(40);
      expect(() => validateSecurityEnv()).toThrow(/at least 32 characters/);
    });

    it('refuses to boot in production if JWT secrets are identical', () => {
      process.env.NODE_ENV = 'production';
      const secret = 'a'.repeat(40);
      process.env.JWT_SECRET = secret;
      process.env.JWT_REFRESH_SECRET = secret;
      expect(() => validateSecurityEnv()).toThrow(/distinct values/);
    });

    it('passes boot check with valid distinct secrets', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(40);
      process.env.JWT_REFRESH_SECRET = 'b'.repeat(40);
      expect(() => validateSecurityEnv()).not.toThrow();
    });
  });

  describe('Single-Dentist Endpoints (B1)', () => {
    it('returns 404 for GET /api/dentists/primary if no dentist exists yet', async () => {
      const res = await request(app).get('/api/dentists/primary');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/No dentist/i);
    });

    it('allows admin to onboard first dentist, but rejects second with 409', async () => {
      const admin = await User.create({
        name: 'Admin User',
        email: 'admin@clinic.test',
        phone: '9999990001',
        password: 'Password123!',
        role: 'admin',
      });
      const adminToken = signAccessToken({ id: admin._id, role: admin.role, tv: 0 });

      // First dentist creation
      const res1 = await request(app)
        .post('/api/dentists')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Dr. Single Dentist',
          email: 'doctor@clinic.test',
          phone: '9999990002',
          password: 'DoctorPassword123!',
          specialization: 'General Dentist',
          consultationFee: 500,
        });

      expect(res1.status).toBe(201);
      expect(res1.body.success).toBe(true);
      expect(res1.body.data.user.password).toBeUndefined(); // no password leaked

      // Verify dentist so they can accept appointments
      const dentistDoc = await Dentist.findOne();
      dentistDoc.isVerified = true;
      dentistDoc.weeklyAvailability = [
        {
          day: new Date().getDay(),
          slots: [{ startTime: '09:00', endTime: '18:00' }],
        },
      ];
      await dentistDoc.save();

      // Second dentist creation attempt
      const res2 = await request(app)
        .post('/api/dentists')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Dr. Second Dentist',
          email: 'doctor2@clinic.test',
          phone: '9999990003',
          password: 'DoctorPassword123!',
          specialization: 'Orthodontist',
          consultationFee: 800,
        });

      expect(res2.status).toBe(409);
      expect(res2.body.message).toMatch(/already has its dentist/i);

      // GET /api/dentists/primary now returns the single dentist
      const primaryRes = await request(app).get('/api/dentists/primary');
      expect(primaryRes.status).toBe(200);
      expect(primaryRes.body.data.dentist._id).toBe(String(dentistDoc._id));
    });

    it('resolves primary dentist on booking when dentistId is omitted, and rejects wrong dentistId', async () => {
      // Create dentist
      const docUser = await User.create({
        name: 'Dr. Primary',
        email: 'doc@clinic.test',
        phone: '9999991111',
        password: 'DocPassword123!',
        role: 'dentist',
      });
      const dentist = await Dentist.create({
        user: docUser._id,
        specialization: 'General',
        consultationFee: 400,
        isVerified: true,
        isActive: true,
        slotDurationMinutes: 30,
        weeklyAvailability: [
          {
            day: 1, // Monday
            slots: [{ startTime: '10:00', endTime: '12:00' }],
          },
        ],
      });

      const patient = await User.create({
        name: 'Patient Test',
        email: 'patient@clinic.test',
        phone: '9999992222',
        password: 'Password123!',
        role: 'patient',
        isEmailVerified: true,
      });
      const patientToken = signAccessToken({ id: patient._id, role: 'patient', tv: 0 });

      // Find next Monday date in local/clinic timezone
      const toLocalDateStr = (dt) => {
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const day = String(dt.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      const d = new Date();
      d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7));
      const nextMondayStr = toLocalDateStr(d);

      // 1. Wrong dentistId -> 400
      const fakeId = new mongoose.Types.ObjectId();
      const resWrong = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          dentistId: fakeId,
          date: nextMondayStr,
          startTime: '10:00',
          mode: 'in-clinic',
        });
      expect(resWrong.status).toBe(400);
      expect(resWrong.body.message).toMatch(/not the clinic doctor/i);

      // 2. Omitted dentistId -> automatically resolves primary dentist!
      const resOk = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          date: nextMondayStr,
          startTime: '10:00',
          mode: 'in-clinic',
          reasonForVisit: 'Checkup',
        });
      expect(resOk.status).toBe(201);
      expect(resOk.body.data.dentist).toBe(String(dentist._id));
    });
  });

  describe('Staff-Assisted Walk-in Booking & Registration (C3)', () => {
    it('allows receptionist to register a walk-in patient and book appointment confirmed', async () => {
      const docUser = await User.create({
        name: 'Dr. Primary',
        email: 'doc2@clinic.test',
        phone: '9999993333',
        password: 'DocPassword123!',
        role: 'dentist',
      });
      const dentist = await Dentist.create({
        user: docUser._id,
        specialization: 'General',
        consultationFee: 500,
        isVerified: true,
        isActive: true,
        weeklyAvailability: [
          {
            day: 2, // Tuesday
            slots: [{ startTime: '14:00', endTime: '16:00' }],
          },
        ],
      });

      const receptionist = await User.create({
        name: 'Receptionist Jane',
        email: 'reception@clinic.test',
        phone: '9999994444',
        password: 'Password123!',
        role: 'receptionist',
      });
      const staffToken = signAccessToken({ id: receptionist._id, role: 'receptionist', tv: 0 });

      // 1. Staff walk-in registration (POST /api/patients) enabled per S5
      const regRes = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          name: 'Walk In Patient',
          phone: '9876543210',
          gender: 'female',
        });
      expect(regRes.status).toBe(201);
      expect(regRes.body.data.user.phone).toBe('9876543210');
      const walkInUserId = regRes.body.data.user._id;

      // Duplicate registration returns 409 with existing patient info
      const dupRes = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          name: 'Walk In Patient Duplicate',
          phone: '9876543210',
        });
      expect(dupRes.status).toBe(409);
      expect(dupRes.body.data.existingUser._id.toString()).toBe(walkInUserId.toString());

      // 2. Book appointment via POST /api/appointments/staff
      const d = new Date();
      d.setDate(d.getDate() + ((2 + 7 - d.getDay()) % 7 || 7));
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const nextTuesdayStr = `${y}-${m}-${day}`;

      const bookRes = await request(app)
        .post('/api/appointments/staff')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          patientId: walkInUserId,
          date: nextTuesdayStr,
          startTime: '14:00',
          mode: 'in-clinic',
          reasonForVisit: 'Severe toothache',
        });

      expect(bookRes.status).toBe(201);
      expect(bookRes.body.data.status).toBe('confirmed');
      expect(bookRes.body.data.paymentStatus).toBe('pending');
      expect(bookRes.body.data.dentist).toBe(String(dentist._id));
    });
  });

  describe('Dental Chart FDI Tooth Number & Patient Check (D5)', () => {
    it('rejects chart access for non-existent patient with 404', async () => {
      const docUser = await User.create({
        name: 'Dr. Dental',
        email: 'docdental@clinic.test',
        phone: '9999997777',
        password: 'Password123!',
        role: 'dentist',
      });
      const docToken = signAccessToken({ id: docUser._id, role: 'dentist', tv: 0 });

      const fakePatientId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/dental-charts/${fakePatientId}`)
        .set('Authorization', `Bearer ${docToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/Patient not found/i);
    });

    it('rejects invalid tooth number (e.g. 99) with 422 validation error', async () => {
      const docUser = await User.create({
        name: 'Dr. Dental 2',
        email: 'docdental2@clinic.test',
        phone: '9999998888',
        password: 'Password123!',
        role: 'dentist',
      });
      const docToken = signAccessToken({ id: docUser._id, role: 'dentist', tv: 0 });

      const patient = await User.create({
        name: 'Patient Teeth',
        email: 'patientteeth@clinic.test',
        phone: '9999999999',
        password: 'Password123!',
        role: 'patient',
      });

      const res = await request(app)
        .patch(`/api/dental-charts/${patient._id}/tooth/99`)
        .set('Authorization', `Bearer ${docToken}`)
        .send({ condition: 'decayed' });

      expect(res.status).toBe(422);
      expect(res.body.message).toMatch(/Validation failed/i);
    });

    it('accepts valid FDI tooth number (e.g. 11, 21, 36, 48)', async () => {
      const docUser = await User.create({
        name: 'Dr. Dental 3',
        email: 'docdental3@clinic.test',
        phone: '9999990009',
        password: 'Password123!',
        role: 'dentist',
      });
      const docToken = signAccessToken({ id: docUser._id, role: 'dentist', tv: 0 });

      const patient = await User.create({
        name: 'Patient Teeth 2',
        email: 'patientteeth2@clinic.test',
        phone: '9999990008',
        password: 'Password123!',
        role: 'patient',
      });

      const res = await request(app)
        .patch(`/api/dental-charts/${patient._id}/tooth/11`)
        .set('Authorization', `Bearer ${docToken}`)
        .send({ condition: 'crowned', notes: 'Zirconia crown placed' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.teeth).toHaveLength(1);
      expect(res.body.data.teeth[0].toothNumber).toBe(11);
      expect(res.body.data.teeth[0].condition).toBe('crowned');
    });
  });

  describe('Doctor Seed and Idempotency (Single Doctor Mode)', () => {
    it('seeds the doctor idempotently, allows login with tokens, returns exactly 1 dentist, and rejects a second dentist with 409', async () => {
      const seedDoctor = require('../utils/seedDoctor');
      process.env.DOCTOR_EMAIL = 'siddheshvpatil02@gmail.com';
      process.env.DOCTOR_PASSWORD = 'Dentist@123';
      process.env.DOCTOR_PHONE = '+919876543210';
      process.env.DOCTOR_NAME = 'Dr. Siddhesh Patil';

      // 1. Run seedDoctor twice to test idempotency
      await seedDoctor();
      await seedDoctor();

      // 2. POST /api/auth/login with doctor credentials returns tokens
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'siddheshvpatil02@gmail.com', password: 'Dentist@123' });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);
      expect(loginRes.body.data.accessToken).toBeDefined();
      expect(loginRes.body.data.refreshToken).toBeDefined();
      expect(loginRes.body.data.user.role).toBe('dentist');

      // 3. GET /api/dentists returns exactly 1
      const listRes = await request(app).get('/api/dentists');
      expect(listRes.status).toBe(200);
      expect(listRes.body.data).toHaveLength(1);

      // Verify doctor weekly availability
      const doctorProfile = listRes.body.data[0];
      expect(doctorProfile.isVerified).toBe(true);
      expect(doctorProfile.isActive).toBe(true);
      expect(doctorProfile.weeklyAvailability.length).toBeGreaterThanOrEqual(6);

      // 4. POST /api/dentists returns 409
      const admin = await User.create({
        name: 'Admin For Test',
        email: 'admintest@clinic.test',
        phone: '9999998877',
        password: 'Password123!',
        role: 'admin',
      });
      const adminToken = signAccessToken({ id: admin._id, role: admin.role, tv: 0 });

      const createRes = await request(app)
        .post('/api/dentists')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Dr. Extra Clinician',
          email: 'extra@clinic.test',
          phone: '9999998866',
          password: 'Password123!',
          specialization: 'Periodontist',
          consultationFee: 600,
        });

      expect(createRes.status).toBe(409);
      expect(createRes.body.message).toMatch(/already has its dentist/i);
    });
  });
});
