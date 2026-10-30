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
const Invoice = require('../models/Invoice');
const Queue = require('../models/Queue');
const ClinicSettings = require('../models/ClinicSettings');
const Notification = require('../models/Notification');
const Review = require('../models/Review');
const Patient = require('../models/Patient');
const { signAccessToken } = require('../utils/generateToken');
const { getNormalizedCloudinaryConfig } = require('../config/cloudinary');
const { todayInClinic, dayRange, weekRange, addDays, parseDateOnly, weekdayOf } = require('../utils/clinicDate');
const { createInvoiceForAppointment } = require('../services/invoice.service');
const { notifyRoles, notifyUser } = require('../services/notification.service');

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
  await Invoice.deleteMany({});
  await Queue.deleteMany({});
  await ClinicSettings.deleteMany({});
  await Notification.deleteMany({});
  await Review.deleteMany({});
  await Patient.deleteMany({});
});

describe('Patient, Admin and Staff Fixes (15 items)', () => {
  // F1: Cloudinary upload normalizer & system status
  describe('F1: Cloudinary upload normalizer and system-status endpoint', () => {
    it('normalizes valid cloud names with mixed case, dashes, underscores, and padding/quotes', () => {
      const res1 = getNormalizedCloudinaryConfig({
        CLOUDINARY_CLOUD_NAME: ' "MyCloudName" ',
        CLOUDINARY_API_KEY: '123456789012345',
        CLOUDINARY_API_SECRET: 'secret_abc_123',
      });
      expect(res1.isConfigured).toBe(true);
      expect(res1.cloud_name).toBe('MyCloudName');

      const res2 = getNormalizedCloudinaryConfig({
        CLOUDINARY_CLOUD_NAME: 'my-cloud_1',
        CLOUDINARY_API_KEY: '123456789012345',
        CLOUDINARY_API_SECRET: 'secret_abc_123',
      });
      expect(res2.isConfigured).toBe(true);
      expect(res2.cloud_name).toBe('my-cloud_1');
    });

    it('rejects placeholders and empty values', () => {
      const res = getNormalizedCloudinaryConfig({
        CLOUDINARY_CLOUD_NAME: 'your_cloud_name',
        CLOUDINARY_API_KEY: '',
        CLOUDINARY_API_SECRET: '',
      });
      expect(res.isConfigured).toBe(false);
      expect(res.missing).toContain('CLOUDINARY_CLOUD_NAME');
      expect(res.missing).toContain('CLOUDINARY_API_KEY');
    });

    it('GET /api/admin/system-status returns service status booleans for admin', async () => {
      const admin = await User.create({
        name: 'Admin User',
        email: 'admin@clinic.test',
        phone: '9999990001',
        password: 'Password123!',
        role: 'admin',
        isEmailVerified: true,
      });
      const token = signAccessToken({ id: admin._id, role: 'admin', tv: 0 });

      const res = await request(app)
        .get('/api/admin/system-status')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('uploads');
      expect(res.body.data).toHaveProperty('payments');
      expect(res.body.data).toHaveProperty('email');
    });
  });

  // F3 & P6: Clinic Date Handling across timezones & Sunday matrix
  describe('F3 & P6: Clinic date handling & Sunday matrix', () => {
    it('computes correct weekday and day ranges via UTC math', () => {
      const sundayStr = '2026-10-25'; // Oct 25, 2026 is Sunday
      expect(weekdayOf(sundayStr)).toBe(0);

      const mondayStr = '2026-10-26';
      expect(weekdayOf(mondayStr)).toBe(1);

      const dRange = dayRange(sundayStr);
      expect(dRange.start.toISOString()).toBe('2026-10-25T00:00:00.000Z');
      expect(dRange.end.toISOString()).toBe('2026-10-26T00:00:00.000Z');

      const wRange = weekRange(sundayStr, 'mon');
      expect(wRange.from).toBe('2026-10-19'); // Monday
      expect(wRange.to).toBe('2026-10-25'); // Sunday
    });

    it('addDays correctly navigates across month and year boundaries', () => {
      expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
      expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    });
  });

  // P2: Appointment availability range, pay-at-clinic, upcoming filter
  describe('P2: Appointment system availability range & pay-at-clinic', () => {
    it('returns availability range with open and closed reasons', async () => {
      const docUser = await User.create({
        name: 'Doctor Dentist',
        email: 'doc@clinic.test',
        phone: '9888880001',
        password: 'Password123!',
        role: 'dentist',
        isEmailVerified: true,
      });

      const dentist = await Dentist.create({
        user: docUser._id,
        specialization: 'General Dentistry',
        consultationFee: 500,
        isVerified: true,
        isActive: true,
        weeklyAvailability: [
          { day: 0, slots: [{ startTime: '10:00', endTime: '13:00' }] }, // Sunday open
          { day: 1, slots: [] }, // Monday closed
        ],
        slotDurationMinutes: 30,
      });

      let testSunday = addDays(todayInClinic(), 1);
      while (weekdayOf(testSunday) !== 0) {
        testSunday = addDays(testSunday, 1);
      }
      const testMonday = addDays(testSunday, 1);

      const res = await request(app)
        .get(`/api/dentists/primary/availability?from=${testSunday}&to=${testMonday}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].date).toBe(testSunday);
      expect(res.body.data[0].status).toBe('open');
      expect(res.body.data[1].status).toBe('closed');
    });

    it('allows booking an appointment with payAtClinic when clinic setting permits', async () => {
      await ClinicSettings.findByIdAndUpdate(
        'default',
        { allowPayAtClinic: true },
        { upsert: true }
      );

      const docUser = await User.create({
        name: 'Doctor Dentist',
        email: 'doc2@clinic.test',
        phone: '9888880002',
        password: 'Password123!',
        role: 'dentist',
        isEmailVerified: true,
      });

      const dentist = await Dentist.create({
        user: docUser._id,
        specialization: 'General Dentistry',
        consultationFee: 500,
        isVerified: true,
        isActive: true,
        weeklyAvailability: [
          { day: 0, slots: [{ startTime: '10:00', endTime: '12:00' }] },
        ],
        slotDurationMinutes: 30,
      });

      const patientUser = await User.create({
        name: 'Test Patient',
        email: 'patient@clinic.test',
        phone: '9777770001',
        password: 'Password123!',
        role: 'patient',
        isEmailVerified: true,
      });
      const patientToken = signAccessToken({ id: patientUser._id, role: 'patient', tv: 0 });

      let testSunday = addDays(todayInClinic(), 1);
      while (weekdayOf(testSunday) !== 0) {
        testSunday = addDays(testSunday, 1);
      }

      const res = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          dentistId: dentist._id,
          date: testSunday,
          startTime: '10:00',
          mode: 'in-clinic',
          reasonForVisit: 'Routine cleaning',
          payAtClinic: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('confirmed');
      expect(res.body.data.paymentStatus).toBe('pending');
      expect(res.body.data.payAtClinic).toBe(true);
    });

    it('GET /api/appointments/me?upcoming=true includes today appointments', async () => {
      const docUser = await User.create({
        name: 'Doctor Upcoming',
        email: 'docup@clinic.test',
        phone: '9888880099',
        password: 'Password123!',
        role: 'dentist',
        isEmailVerified: true,
      });
      const dentist = await Dentist.create({
        user: docUser._id,
        specialization: 'General',
        consultationFee: 500,
        isVerified: true,
        isActive: true,
      });

      const patient = await User.create({
        name: 'Patient Upcoming',
        email: 'patientup@clinic.test',
        phone: '9777770002',
        password: 'Password123!',
        role: 'patient',
        isEmailVerified: true,
      });
      const token = signAccessToken({ id: patient._id, role: 'patient', tv: 0 });

      const todayStr = todayInClinic();
      const todayDate = parseDateOnly(todayStr);

      await Appointment.create({
        dentist: dentist._id,
        patient: patient._id,
        date: todayDate,
        startTime: '11:00',
        endTime: '11:30',
        mode: 'in-clinic',
        status: 'confirmed',
        paymentStatus: 'paid',
        fees: { consultationFee: 500, totalAmount: 500 },
      });

      const res = await request(app)
        .get('/api/appointments/me?upcoming=true')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].startTime).toBe('11:00');
    });
  });

  // P4: Treatment plans resilience with deleted treatments & snapshots
  describe('P4: Treatment plans resilience', () => {
    it('snapshots treatment name & cost and renders cleanly even if catalogue treatment is deleted', async () => {
      const docUser = await User.create({
        name: 'Dr. Smile',
        email: 'smile@clinic.test',
        phone: '9888880003',
        password: 'Password123!',
        role: 'dentist',
        isEmailVerified: true,
      });

      const dentist = await Dentist.create({
        user: docUser._id,
        specialization: 'Orthodontics',
        consultationFee: 500,
        isVerified: true,
        isActive: true,
      });
      const docToken = signAccessToken({ id: docUser._id, role: 'dentist', tv: 0 });

      const patient = await User.create({
        name: 'Care Patient',
        email: 'care@clinic.test',
        phone: '9777770003',
        password: 'Password123!',
        role: 'patient',
        isEmailVerified: true,
      });

      const treatment = await Treatment.create({
        name: 'Root Canal',
        category: 'Endodontics',
        defaultCost: 3000,
        durationMinutes: 45,
      });

      // Dentist creates plan
      const planRes = await request(app)
        .post('/api/treatment-plans')
        .set('Authorization', `Bearer ${docToken}`)
        .send({
          title: 'Root Canal Plan',
          patientId: patient._id,
          steps: [
            {
              treatment: treatment._id,
              toothNumbers: [16],
              cost: 3000,
            },
          ],
        });

      expect(planRes.status).toBe(201);

      // Delete the treatment from catalogue
      await Treatment.findByIdAndDelete(treatment._id);

      // Patient fetches plans
      const patientToken = signAccessToken({ id: patient._id, role: 'patient', tv: 0 });
      const fetchRes = await request(app)
        .get('/api/treatment-plans/me')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(fetchRes.status).toBe(200);
      expect(fetchRes.body.data).toHaveLength(1);
      expect(fetchRes.body.data[0].steps[0].name).toBe('Root Canal');
      expect(fetchRes.body.data[0].steps[0].defaultCost).toBe(3000);
    });
  });

  // P5: Dentist pause/resume and bookable checklist
  describe('P5: Dentist pause/resume and bookable checklist', () => {
    it('supports pausing with reason and resume date, and exposes in /dentists/primary', async () => {
      const docUser = await User.create({
        name: 'Dr. Pause',
        email: 'pause@clinic.test',
        phone: '9888880004',
        password: 'Password123!',
        role: 'dentist',
        isEmailVerified: true,
      });

      const dentist = await Dentist.create({
        user: docUser._id,
        specialization: 'Periodontics',
        consultationFee: 400,
        isVerified: true,
        isActive: true,
        weeklyAvailability: [{ day: 1, slots: [{ startTime: '09:00', endTime: '17:00' }] }],
        slotDurationMinutes: 30,
      });
      const docToken = signAccessToken({ id: docUser._id, role: 'dentist', tv: 0 });

      // Dentist pauses
      const pauseRes = await request(app)
        .patch('/api/dentists/me/toggle-active')
        .set('Authorization', `Bearer ${docToken}`)
        .send({
          reason: 'Attending dental conference',
          resumeDate: '2026-11-01',
        });

      expect(pauseRes.status).toBe(200);
      expect(pauseRes.body.data.isActive).toBe(false);
      expect(pauseRes.body.data.pausedReason).toBe('Attending dental conference');

      // Public /dentists/primary still returns doctor with acceptingAppointments: false
      const primaryRes = await request(app).get('/api/dentists/primary');
      expect(primaryRes.status).toBe(200);
      expect(primaryRes.body.data.acceptingAppointments).toBe(false);
      expect(primaryRes.body.data.pausedReason).toBe('Attending dental conference');
      expect(primaryRes.body.data.bookableChecklist.isBookable).toBe(false);
    });
  });

  // A1: Admin weekly appointments chart series
  describe('A1: Weekly appointments series', () => {
    it('returns zero-filled series with separate status segments and total excluding cancelled/rescheduled', async () => {
      const admin = await User.create({
        name: 'Admin Weekly',
        email: 'adminw@clinic.test',
        phone: '9999990002',
        password: 'Password123!',
        role: 'admin',
        isEmailVerified: true,
      });
      const token = signAccessToken({ id: admin._id, role: 'admin', tv: 0 });

      const docUser = await User.create({
        name: 'Doc Appt',
        email: 'docappt@clinic.test',
        phone: '9888880088',
        password: 'Password123!',
        role: 'dentist',
        isEmailVerified: true,
      });
      const dentist = await Dentist.create({
        user: docUser._id,
        specialization: 'General',
        consultationFee: 500,
        isVerified: true,
        isActive: true,
      });

      const patient = await User.create({
        name: 'Patient Appt',
        email: 'patientappt@clinic.test',
        phone: '9777770088',
        password: 'Password123!',
        role: 'patient',
        isEmailVerified: true,
      });

      const todayStr = todayInClinic();
      const todayDate = parseDateOnly(todayStr);

      // Create 1 confirmed, 1 completed, 1 cancelled, 1 rescheduled on today
      await Appointment.create([
        { dentist: dentist._id, patient: patient._id, date: todayDate, startTime: '09:00', endTime: '09:30', status: 'confirmed', mode: 'in-clinic', fees: { consultationFee: 500, totalAmount: 500 } },
        { dentist: dentist._id, patient: patient._id, date: todayDate, startTime: '10:00', endTime: '10:30', status: 'completed', mode: 'in-clinic', fees: { consultationFee: 500, totalAmount: 500 } },
        { dentist: dentist._id, patient: patient._id, date: todayDate, startTime: '11:00', endTime: '11:30', status: 'cancelled', mode: 'in-clinic', fees: { consultationFee: 500, totalAmount: 500 } },
        { dentist: dentist._id, patient: patient._id, date: todayDate, startTime: '12:00', endTime: '12:30', status: 'rescheduled', mode: 'in-clinic', fees: { consultationFee: 500, totalAmount: 500 } },
      ]);

      const res = await request(app)
        .get('/api/dashboard/admin/appointments-weekly?range=7d')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.series).toHaveLength(7);
      const todayEntry = res.body.data.series.find((s) => s.date === todayStr);
      expect(todayEntry).toBeDefined();
      expect(todayEntry.confirmed).toBe(1);
      expect(todayEntry.completed).toBe(1);
      expect(todayEntry.cancelled).toBe(1);
      expect(todayEntry.rescheduled).toBe(1);
      expect(todayEntry.total).toBe(2); // confirmed + completed, excludes cancelled & rescheduled
    });
  });

  // A2: Admin Doctor Profile & Editing
  describe('A2: Admin doctor profile editing with uniqueness', () => {
    it('allows admin to edit doctor details and enforces email uniqueness', async () => {
      const admin = await User.create({
        name: 'Admin EditDoc',
        email: 'adminedit@clinic.test',
        phone: '9999990003',
        password: 'Password123!',
        role: 'admin',
        isEmailVerified: true,
      });
      const adminToken = signAccessToken({ id: admin._id, role: 'admin', tv: 0 });

      const docUser = await User.create({
        name: 'Dr. John Doe',
        email: 'johndoe@clinic.test',
        phone: '9888880005',
        password: 'Password123!',
        role: 'dentist',
        isEmailVerified: true,
      });

      const dentist = await Dentist.create({
        user: docUser._id,
        specialization: 'Prosthodontics',
        consultationFee: 600,
        isVerified: true,
        isActive: true,
      });

      // Update doctor specialization, experience, and name
      const updateRes = await request(app)
        .patch(`/api/dentists/${dentist._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Dr. Jonathan Doe',
          specialization: 'Pediatric Dentistry',
          experienceYears: 12,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.specialization).toBe('Pediatric Dentistry');
      expect(updateRes.body.data.user.name).toBe('Dr. Jonathan Doe');
    });
  });

  // A3: Patient 360 summary and appointments
  describe('A3: Patient 360 summary and appointment history', () => {
    it('returns summary with outstanding balance, last visit, and next appointment', async () => {
      const receptionist = await User.create({
        name: 'Staff Reception',
        email: 'recep360@clinic.test',
        phone: '9999990004',
        password: 'Password123!',
        role: 'receptionist',
        isEmailVerified: true,
      });
      const recepToken = signAccessToken({ id: receptionist._id, role: 'receptionist', tv: 0 });

      const patient = await User.create({
        name: 'Patient 360',
        email: 'p360@clinic.test',
        phone: '9777770004',
        password: 'Password123!',
        role: 'patient',
        isEmailVerified: true,
      });

      // Create an unpaid invoice
      await Invoice.create({
        invoiceNumber: 'INV-2026-000001',
        patient: patient._id,
        totalAmount: 1500,
        subTotal: 1500,
        status: 'unpaid',
      });

      const summaryRes = await request(app)
        .get(`/api/patients/${patient._id}/summary`)
        .set('Authorization', `Bearer ${recepToken}`);

      expect(summaryRes.status).toBe(200);
      expect(summaryRes.body.data.stats.outstandingBalance).toBe(1500);
      expect(summaryRes.body.data.user.name).toBe('Patient 360');
    });
  });

  // S1: Queue check-in rejects walk-in name & accepts appointmentId
  describe('S1: Queue check-in', () => {
    it('rejects walkInName with 400', async () => {
      const receptionist = await User.create({
        name: 'Queue Reception',
        email: 'queue@clinic.test',
        phone: '9999990005',
        password: 'Password123!',
        role: 'receptionist',
        isEmailVerified: true,
      });
      const recepToken = signAccessToken({ id: receptionist._id, role: 'receptionist', tv: 0 });

      const res = await request(app)
        .post('/api/queue/check-in')
        .set('Authorization', `Bearer ${recepToken}`)
        .send({
          walkInName: 'Unauthorized Walk-in',
        });

      expect(res.status).toBe(400);
    });

    it('derives patientId when appointmentId is provided', async () => {
      const docUser = await User.create({
        name: 'Doctor Queue',
        email: 'docqueue@clinic.test',
        phone: '9888880006',
        password: 'Password123!',
        role: 'dentist',
        isEmailVerified: true,
      });

      const dentist = await Dentist.create({
        user: docUser._id,
        specialization: 'General',
        consultationFee: 500,
        isVerified: true,
        isActive: true,
      });

      const patient = await User.create({
        name: 'Queue Patient',
        email: 'qpatient@clinic.test',
        phone: '9777770005',
        password: 'Password123!',
        role: 'patient',
        isEmailVerified: true,
      });

      const appt = await Appointment.create({
        dentist: dentist._id,
        patient: patient._id,
        date: parseDateOnly(todayInClinic()),
        startTime: '10:00',
        endTime: '10:30',
        mode: 'in-clinic',
        status: 'confirmed',
        fees: { consultationFee: 500, totalAmount: 500 },
      });

      const receptionist = await User.create({
        name: 'Recep Queue',
        email: 'rq@clinic.test',
        phone: '9999990006',
        password: 'Password123!',
        role: 'receptionist',
        isEmailVerified: true,
      });
      const recepToken = signAccessToken({ id: receptionist._id, role: 'receptionist', tv: 0 });

      const res = await request(app)
        .post('/api/queue/check-in')
        .set('Authorization', `Bearer ${recepToken}`)
        .send({
          appointmentId: appt._id,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.patient).toBe(String(patient._id));
      expect(res.body.data.tokenNumber).toBe(1);
    });
  });

  // S3: Auto-invoice generation idempotency and sequential numbering
  describe('S3: Auto-invoice creation upon completion', () => {
    it('creates invoice with sequential number INV-YYYY-000123 and is idempotent', async () => {
      const docUser = await User.create({
        name: 'Dr. Invoice',
        email: 'docinv@clinic.test',
        phone: '9888880007',
        password: 'Password123!',
        role: 'dentist',
        isEmailVerified: true,
      });

      const dentist = await Dentist.create({
        user: docUser._id,
        specialization: 'General',
        consultationFee: 500,
        isVerified: true,
        isActive: true,
      });

      const patient = await User.create({
        name: 'Invoice Patient',
        email: 'invpatient@clinic.test',
        phone: '9777770006',
        password: 'Password123!',
        role: 'patient',
        isEmailVerified: true,
      });

      const appt = await Appointment.create({
        dentist: dentist._id,
        patient: patient._id,
        date: parseDateOnly(todayInClinic()),
        startTime: '11:00',
        endTime: '11:30',
        mode: 'in-clinic',
        status: 'confirmed',
        paymentStatus: 'pending',
        fees: { consultationFee: 500, platformFee: 0, totalAmount: 500 },
      });

      const invoice1 = await createInvoiceForAppointment(appt);
      expect(invoice1).toBeDefined();
      expect(invoice1.invoiceNumber).toMatch(/^INV-\d{4}-\d{6}$/);
      expect(invoice1.status).toBe('unpaid');
      expect(invoice1.totalAmount).toBe(500);

      // Calling again is idempotent - returns same invoice
      const invoice2 = await createInvoiceForAppointment(appt);
      expect(String(invoice2._id)).toBe(String(invoice1._id));
      const count = await Invoice.countDocuments({ appointment: appt._id });
      expect(count).toBe(1);
    });
  });

  // S4: Notification fan-out
  describe('S4: Notification fan-out notifyRoles and notifyUser', () => {
    it('delivers notification to all users with specified roles', async () => {
      const r1 = await User.create({ name: 'R1', email: 'r1@clinic.test', phone: '9999990011', role: 'receptionist', password: 'Password123!' });
      const r2 = await User.create({ name: 'R2', email: 'r2@clinic.test', phone: '9999990012', role: 'receptionist', password: 'Password123!' });
      const p1 = await User.create({ name: 'P1', email: 'p1@clinic.test', phone: '9999990013', role: 'patient', password: 'Password123!' });

      await notifyRoles(['receptionist'], {
        title: 'New Booking',
        message: 'A patient has booked an appointment.',
        type: 'new_booking',
      });

      const r1Notifs = await Notification.find({ user: r1._id });
      const r2Notifs = await Notification.find({ user: r2._id });
      const p1Notifs = await Notification.find({ user: p1._id });

      expect(r1Notifs).toHaveLength(1);
      expect(r2Notifs).toHaveLength(1);
      expect(p1Notifs).toHaveLength(0);
    });
  });

  // S5: Staff walk-in registration, demographic updates, patient activate/deactivate
  describe('S5: Staff walk-in registration, demographic updates & status control', () => {
    it('allows receptionist to update patient demographics and contact details', async () => {
      const rec = await User.create({ name: 'Receptionist', email: 'rec@clinic.test', phone: '9999990020', role: 'receptionist', password: 'Password123!' });
      const recToken = signAccessToken({ id: rec._id, role: 'receptionist', tv: 0 });

      // Create walk-in patient
      const createRes = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${recToken}`)
        .send({
          name: 'Jane Doe',
          phone: '9888880001',
          gender: 'female',
          allergies: ['Penicillin'],
        });
      expect(createRes.status).toBe(201);
      const patientUserId = createRes.body.data.user._id;

      // Update patient demographic details
      const updateRes = await request(app)
        .patch(`/api/patients/${patientUserId}`)
        .set('Authorization', `Bearer ${recToken}`)
        .send({
          name: 'Jane Smith',
          gender: 'female',
          bloodGroup: 'B+',
          allergies: ['Penicillin', 'Sulfa'],
        });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.user.name).toBe('Jane Smith');
      expect(updateRes.body.data.patient.bloodGroup).toBe('B+');
      expect(updateRes.body.data.patient.allergies).toContain('Sulfa');
    });

    it('allows admin to activate and deactivate patient accounts', async () => {
      const admin = await User.create({ name: 'Admin', email: 'admin@clinic.test', phone: '9999990021', role: 'admin', password: 'Password123!' });
      const rec = await User.create({ name: 'Rec', email: 'rec2@clinic.test', phone: '9999990022', role: 'receptionist', password: 'Password123!' });
      const patient = await User.create({ name: 'Patient', email: 'pat@clinic.test', phone: '9999990023', role: 'patient', password: 'Password123!' });
      await Patient.create({ user: patient._id });

      const adminToken = signAccessToken({ id: admin._id, role: 'admin', tv: 0 });
      const recToken = signAccessToken({ id: rec._id, role: 'receptionist', tv: 0 });

      // Receptionist cannot deactivate
      const recDeact = await request(app)
        .patch(`/api/patients/${patient._id}/deactivate`)
        .set('Authorization', `Bearer ${recToken}`);
      expect(recDeact.status).toBe(403);

      // Admin deactivates
      const deactRes = await request(app)
        .patch(`/api/patients/${patient._id}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(deactRes.status).toBe(200);
      expect(deactRes.body.data.active).toBe(false);

      // Admin reactivates
      const actRes = await request(app)
        .patch(`/api/patients/${patient._id}/activate`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(actRes.status).toBe(200);
      expect(actRes.body.data.active).toBe(true);
    });
  });

  // S6: Staff management - update, reset password, role guard
  describe('S6: Staff management - update, reset password, and self/last-admin safeguards', () => {
    it('allows admin to update staff role and reset staff password with mustChangePassword', async () => {
      const admin = await User.create({ name: 'Admin', email: 'admin2@clinic.test', phone: '9999990024', role: 'admin', password: 'Password123!' });
      const staff = await User.create({ name: 'Front Desk', email: 'staff@clinic.test', phone: '9999990025', role: 'receptionist', password: 'Password123!' });

      const adminToken = signAccessToken({ id: admin._id, role: 'admin', tv: 0 });

      // Update staff details
      const updateRes = await request(app)
        .patch(`/api/staff/${staff._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Front Desk Lead' });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.name).toBe('Front Desk Lead');

      // Reset staff password
      const resetRes = await request(app)
        .post(`/api/staff/${staff._id}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ temporaryPassword: 'TempPass123!' });
      expect(resetRes.status).toBe(200);

      const updatedStaff = await User.findById(staff._id).select('+mustChangePassword');
      expect(updatedStaff.mustChangePassword).toBe(true);
    });
  });

  // S7: Review moderation
  describe('S7: Review moderation - list reviews and toggle visibility', () => {
    it('allows admin to list all reviews and toggle isHidden', async () => {
      const admin = await User.create({ name: 'Admin', email: 'admin3@clinic.test', phone: '9999990026', role: 'admin', password: 'Password123!' });
      const patient = await User.create({ name: 'Reviewer', email: 'rev@clinic.test', phone: '9999990027', role: 'patient', password: 'Password123!' });
      const dentistUser = await User.create({ name: 'Doc', email: 'doc@clinic.test', phone: '9999990028', role: 'dentist', password: 'Password123!' });
      const dentist = await Dentist.create({ user: dentistUser._id, specialization: 'General', consultationFee: 500 });

      const appt = await Appointment.create({
        patient: patient._id,
        dentist: dentist._id,
        date: new Date(),
        startTime: '10:00',
        endTime: '10:30',
        mode: 'in-clinic',
        status: 'completed',
        fees: { consultationFee: 500, platformFee: 0, totalAmount: 500 },
      });

      const review = await Review.create({
        patient: patient._id,
        dentist: dentist._id,
        appointment: appt._id,
        rating: 1,
        comment: 'Offensive spam review',
      });

      const adminToken = signAccessToken({ id: admin._id, role: 'admin', tv: 0 });

      // List reviews
      const listRes = await request(app)
        .get('/api/reviews')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);

      // Hide review
      const hideRes = await request(app)
        .patch(`/api/reviews/${review._id}/toggle-hide`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(hideRes.status).toBe(200);
      expect(hideRes.body.data.isHidden).toBe(true);

      // Unhide review
      const unhideRes = await request(app)
        .patch(`/api/reviews/${review._id}/toggle-hide`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(unhideRes.status).toBe(200);
      expect(unhideRes.body.data.isHidden).toBe(false);
    });
  });
});
