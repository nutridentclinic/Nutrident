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
      api: { ping: jest.fn().mockResolvedValue({ status: 'ok' }) },
      uploader: { destroy: jest.fn().mockResolvedValue({ result: 'ok' }) },
    },
  };
});

const app = require('../app');
const User = require('../models/User');
const Dentist = require('../models/Dentist');
const Appointment = require('../models/Appointment');
const Prescription = require('../models/Prescription');
const Invoice = require('../models/Invoice');
const Queue = require('../models/Queue');
const Review = require('../models/Review');
const EmailLog = require('../models/EmailLog');
const ClinicSettings = require('../models/ClinicSettings');
const Notification = require('../models/Notification');
const { signAccessToken } = require('../utils/generateToken');
const { sendTransactionalEmail } = require('../services/email.service');
const { templates } = require('../services/emailTemplates');

describe('Dentist, Patient, Notifications & Reception Comprehensive Tests', () => {
  let mongoServer;
  let dentistUser, otherDentistUser, patientUser, otherPatientUser, receptionistUser;
  let dentistProfile, otherDentistProfile;
  let dentistToken, otherDentistToken, patientToken, receptionistToken;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test_jwt_secret_at_least_32_characters_long_for_test!';
    process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_at_least_32_chars_long!';
    process.env.SINGLE_DENTIST_MODE = 'false';

    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Dentist.deleteMany({});
    await Appointment.deleteMany({});
    await Prescription.deleteMany({});
    await Invoice.deleteMany({});
    await Queue.deleteMany({});
    await Review.deleteMany({});
    await EmailLog.deleteMany({});
    await Notification.deleteMany({});
    await ClinicSettings.deleteMany({});

    await ClinicSettings.create({
      _id: 'default',
      clinicName: 'DrNutrident Care',
      contactPhone: '+91 98765 43210',
      contactEmail: 'clinic@drnutrident.com',
      cancellationFullRefundHours: 24,
    });

    dentistUser = await User.create({
      name: 'Dr. John Doe',
      email: 'dentist@drnutrident.com',
      phone: '+919811111111',
      role: 'dentist',
      password: 'password123',
      isVerified: true, isEmailVerified: true,
    });

    dentistProfile = await Dentist.create({
      user: dentistUser._id,
      name: dentistUser.name,
      email: dentistUser.email,
      phone: dentistUser.phone,
      specialization: 'General Dentist',
      consultationFee: 500,
      slotDurationMinutes: 30,
      isActive: true,
      weeklyAvailability: [
        { day: 0, slots: [{ startTime: '09:00', endTime: '18:00' }] },
        { day: 1, slots: [{ startTime: '09:00', endTime: '18:00' }] },
        { day: 2, slots: [{ startTime: '09:00', endTime: '18:00' }] },
        { day: 3, slots: [{ startTime: '09:00', endTime: '18:00' }] },
        { day: 4, slots: [{ startTime: '09:00', endTime: '18:00' }] },
        { day: 5, slots: [{ startTime: '09:00', endTime: '18:00' }] },
        { day: 6, slots: [{ startTime: '09:00', endTime: '18:00' }] },
      ],
    });

    otherDentistUser = await User.create({
      name: 'Dr. Sarah Connor',
      email: 'sarah@drnutrident.com',
      phone: '+919822222222',
      role: 'dentist',
      password: 'password123',
      isVerified: true, isEmailVerified: true,
    });

    otherDentistProfile = await Dentist.create({
      user: otherDentistUser._id,
      name: otherDentistUser.name,
      email: otherDentistUser.email,
      phone: otherDentistUser.phone,
      specialization: 'Orthodontics',
      consultationFee: 700,
      isActive: true,
      weeklyAvailability: [
        { day: 1, slots: [{ startTime: '09:00', endTime: '17:00' }] },
      ],
    });

    patientUser = await User.create({
      name: 'Alice Patient',
      email: 'alice@gmail.com',
      phone: '+919833333333',
      role: 'patient',
      password: 'password123',
      isVerified: true, isEmailVerified: true,
    });

    otherPatientUser = await User.create({
      name: 'Bob Patient',
      email: 'bob@gmail.com',
      phone: '+919844444444',
      role: 'patient',
      password: 'password123',
      isVerified: true, isEmailVerified: true,
    });

    receptionistUser = await User.create({
      name: 'Rita Receptionist',
      email: 'rita@drnutrident.com',
      phone: '+919855555555',
      role: 'receptionist',
      password: 'password123',
      isVerified: true, isEmailVerified: true,
    });

    dentistToken = signAccessToken({ id: dentistUser._id.toString(), role: 'dentist', tv: 0 });
    otherDentistToken = signAccessToken({ id: otherDentistUser._id.toString(), role: 'dentist', tv: 0 });
    patientToken = signAccessToken({ id: patientUser._id.toString(), role: 'patient', tv: 0 });
    receptionistToken = signAccessToken({ id: receptionistUser._id.toString(), role: 'receptionist', tv: 0 });
  });

  describe('§3 Notifications: Delete Endpoints', () => {
    it('deletes a single notification owned by user and returns 404 for others', async () => {
      const notif1 = await Notification.create({
        user: dentistUser._id,
        title: 'Notice 1',
        message: 'Msg 1',
        type: 'general',
      });
      const notif2 = await Notification.create({
        user: patientUser._id,
        title: 'Notice 2',
        message: 'Msg 2',
        type: 'general',
      });

      // Dentist tries to delete patient's notification -> 404
      const failRes = await request(app)
        .delete(`/api/notifications/${notif2._id}`)
        .set('Authorization', `Bearer ${dentistToken}`);
      expect(failRes.status).toBe(404);

      // Dentist deletes own notification -> 200
      const okRes = await request(app)
        .delete(`/api/notifications/${notif1._id}`)
        .set('Authorization', `Bearer ${dentistToken}`);
      expect(okRes.status).toBe(200);
      expect(okRes.body.success).toBe(true);

      const check = await Notification.findById(notif1._id);
      expect(check).toBeNull();
    });

    it('bulk deletes by IDs, scope=read, and scope=all', async () => {
      const n1 = await Notification.create({ user: dentistUser._id, title: 'N1', message: 'M', type: 'general', isRead: false });
      const n2 = await Notification.create({ user: dentistUser._id, title: 'N2', message: 'M', type: 'general', isRead: true });
      const n3 = await Notification.create({ user: dentistUser._id, title: 'N3', message: 'M', type: 'general', isRead: true });
      const n4 = await Notification.create({ user: dentistUser._id, title: 'N4', message: 'M', type: 'general', isRead: false });

      // Bulk delete by ids
      const resIds = await request(app)
        .delete('/api/notifications')
        .set('Authorization', `Bearer ${dentistToken}`)
        .send({ ids: [n1._id.toString()] });
      expect(resIds.status).toBe(200);
      expect(resIds.body.data.deletedCount).toBe(1);

      // Delete by scope=read
      const resRead = await request(app)
        .delete('/api/notifications?scope=read')
        .set('Authorization', `Bearer ${dentistToken}`);
      expect(resRead.status).toBe(200);
      expect(resRead.body.data.deletedCount).toBe(2);

      // Delete remaining by scope=all
      const resAll = await request(app)
        .delete('/api/notifications?scope=all')
        .set('Authorization', `Bearer ${dentistToken}`);
      expect(resAll.status).toBe(200);
      expect(resAll.body.data.deletedCount).toBe(1);

      const remaining = await Notification.countDocuments({ user: dentistUser._id });
      expect(remaining).toBe(0);
    });
  });

  describe('§1 Dentist Reschedule Endpoint', () => {
    it('allows owning dentist to reschedule with future slot and reason', async () => {
      // Create confirmed appointment for next week
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 5);
      const targetDateStr = targetDate.toISOString().slice(0, 10);

      const newDate = new Date();
      newDate.setDate(newDate.getDate() + 6);
      const newDateStr = newDate.toISOString().slice(0, 10);

      const appt = await Appointment.create({
        patient: patientUser._id,
        dentist: dentistProfile._id,
        date: targetDateStr,
        startTime: '10:00',
        endTime: '10:30',
        fees: { consultationFee: 500, totalAmount: 500 },
        paymentStatus: 'paid',
        status: 'confirmed',
        mode: 'in-clinic',
      });

      const res = await request(app)
        .patch(`/api/appointments/${appt._id}/reschedule`)
        .set('Authorization', `Bearer ${dentistToken}`)
        .send({
          date: newDateStr,
          startTime: '11:00',
          reason: 'Doctor surgery schedule conflict',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.date).toContain(newDateStr);
      expect(res.body.data.startTime).toBe('11:00');
      expect(res.body.data.rescheduleReason).toBe('Doctor surgery schedule conflict');
      expect(res.body.data.rescheduledBy).toBe('dentist');

      // Old appointment marked rescheduled
      const oldAppt = await Appointment.findById(appt._id);
      expect(oldAppt.status).toBe('rescheduled');
      expect(oldAppt.rescheduledTo.toString()).toBe(res.body.data._id.toString());

      // Patient received notification
      const patientNotif = await Notification.findOne({ user: patientUser._id, type: 'appointment_rescheduled' });
      expect(patientNotif).not.toBeNull();
      expect(patientNotif.message).toContain('Doctor surgery schedule conflict');

      // Receptionist received notification
      const recepNotif = await Notification.findOne({ user: receptionistUser._id, type: 'appointment_rescheduled' });
      expect(recepNotif).not.toBeNull();
    });

    it('rejects rescheduling by non-owner dentist with 403', async () => {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 5);
      const targetDateStr = targetDate.toISOString().slice(0, 10);

      const appt = await Appointment.create({
        patient: patientUser._id,
        dentist: dentistProfile._id,
        date: targetDateStr,
        startTime: '10:00',
        endTime: '10:30',
        fees: { consultationFee: 500, totalAmount: 500 },
        paymentStatus: 'paid',
        status: 'confirmed',
      });

      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + 6);

      const res = await request(app)
        .patch(`/api/appointments/${appt._id}/reschedule`)
        .set('Authorization', `Bearer ${otherDentistToken}`)
        .send({
          date: nextDate.toISOString().slice(0, 10),
          startTime: '10:00',
        });

      expect(res.status).toBe(403);
    });

    it('rejects rescheduling to the same slot with 400', async () => {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 5);
      const targetDateStr = targetDate.toISOString().slice(0, 10);

      const appt = await Appointment.create({
        patient: patientUser._id,
        dentist: dentistProfile._id,
        date: targetDateStr,
        startTime: '10:00',
        endTime: '10:30',
        fees: { consultationFee: 500, totalAmount: 500 },
        paymentStatus: 'paid',
        status: 'confirmed',
      });

      const res = await request(app)
        .patch(`/api/appointments/${appt._id}/reschedule`)
        .set('Authorization', `Bearer ${dentistToken}`)
        .send({
          date: targetDateStr,
          startTime: '10:00',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('New slot must be different');
    });
  });

  describe('§4 Prescriptions: Creation, Voiding, and PDF Stream', () => {
    it('creates prescription with validation and notifies patient', async () => {
      const res = await request(app)
        .post('/api/prescriptions')
        .set('Authorization', `Bearer ${dentistToken}`)
        .send({
          patientId: patientUser._id.toString(),
          diagnosis: 'Acute Periapical Periodontitis',
          medicines: [
            {
              name: 'Amoxicillin',
              dosage: '500mg',
              frequency: '1-0-1',
              durationDays: 5,
              instructions: 'After food',
            },
          ],
          additionalNotes: 'Drink plenty of water',
          followUpDate: '2026-11-10',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('active');
      expect(res.body.data.diagnosis).toBe('Acute Periapical Periodontitis');

      const notif = await Notification.findOne({ user: patientUser._id, type: 'prescription_ready' });
      expect(notif).not.toBeNull();
      expect(notif.link).toBe('/app/prescriptions');
    });

    it('validates medicines array and durationDays (422)', async () => {
      const emptyMedRes = await request(app)
        .post('/api/prescriptions')
        .set('Authorization', `Bearer ${dentistToken}`)
        .send({
          patientId: patientUser._id.toString(),
          diagnosis: 'Check',
          medicines: [],
        });
      expect(emptyMedRes.status).toBe(422);

      const invalidDurationRes = await request(app)
        .post('/api/prescriptions')
        .set('Authorization', `Bearer ${dentistToken}`)
        .send({
          patientId: patientUser._id.toString(),
          medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: 'SOS', durationDays: 0 }],
        });
      expect(invalidDurationRes.status).toBe(422);
    });

    it('voids a prescription with reason and prevents re-voiding', async () => {
      const p = await Prescription.create({
        patient: patientUser._id,
        dentist: dentistProfile._id,
        diagnosis: 'Cavity',
        medicines: [{ name: 'Painkiller', dosage: '400mg', frequency: '1-0-1', durationDays: 3 }],
        status: 'active',
      });

      const voidRes = await request(app)
        .patch(`/api/prescriptions/${p._id}/void`)
        .set('Authorization', `Bearer ${dentistToken}`)
        .send({ reason: 'Patient allergic to prescribed medication' });

      expect(voidRes.status).toBe(200);
      expect(voidRes.body.data.status).toBe('voided');
      expect(voidRes.body.data.voidReason).toBe('Patient allergic to prescribed medication');

      // Second void attempt should fail
      const repeatRes = await request(app)
        .patch(`/api/prescriptions/${p._id}/void`)
        .set('Authorization', `Bearer ${dentistToken}`)
        .send({ reason: 'Repeat' });
      expect(repeatRes.status).toBe(400);
    });

    it('streams prescription PDF download', async () => {
      const p = await Prescription.create({
        patient: patientUser._id,
        dentist: dentistProfile._id,
        diagnosis: 'Gingivitis',
        medicines: [{ name: 'Chlorhexidine Mouthwash', dosage: '10ml', frequency: '0-0-1', durationDays: 7 }],
        status: 'voided',
        voidReason: 'Discontinued',
      });

      const pdfRes = await request(app)
        .get(`/api/prescriptions/${p._id}/pdf`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(pdfRes.status).toBe(200);
      expect(pdfRes.headers['content-type']).toBe('application/pdf');
    });
  });

  describe('§5 Email System: Templates & Transactional Delivery', () => {
    it('generates escaped HTML and plain text for all email templates', () => {
      const booked = templates.appointmentBooked({
        patientName: 'Jane <script>',
        doctorName: 'Smith & Jones',
        date: '2026-11-01',
        time: '10:00',
      });
      expect(booked.html).toContain('Jane &lt;script&gt;');
      expect(booked.html).toContain('Smith &amp; Jones');
      expect(booked.text).toContain('Jane <script>');

      const cancelled = templates.appointmentCancelled({
        patientName: 'Jane',
        doctorName: 'Smith',
        date: '2026-11-01',
        time: '10:00',
        reason: 'Patient unwell',
      });
      expect(cancelled.html).toContain('Patient unwell');

      const comp = templates.appointmentCompleted({
        patientName: 'Jane',
        doctorName: 'Smith',
        date: '2026-11-01',
        reviewUrl: 'http://localhost:5173/app/appointments?review=123',
      });
      expect(comp.html).toContain('http://localhost:5173/app/appointments?review=123');
    });

    it('records email attempts in EmailLog', async () => {
      const res = await sendTransactionalEmail({
        to: 'patient@example.com',
        template: 'appointmentBooked',
        data: { patientName: 'Test Patient', doctorName: 'Test Doctor', date: '2026-11-05', time: '14:00' },
      });

      expect(res.success).toBe(true);
      const log = await EmailLog.findOne({ to: 'patient@example.com' });
      expect(log).not.toBeNull();
      expect(log.status).toBe('sent');
      expect(log.template).toBe('appointmentBooked');
    });
  });

  describe('§7 Receptionist Completion & Invoicing', () => {
    it('allows receptionist to complete appointment with confirmation and creates invoice', async () => {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 1);
      const targetDateStr = targetDate.toISOString().slice(0, 10);

      const appt = await Appointment.create({
        patient: patientUser._id,
        dentist: dentistProfile._id,
        date: targetDateStr,
        startTime: '10:00',
        endTime: '10:30',
        fees: { consultationFee: 500, totalAmount: 500 },
        paymentStatus: 'paid',
        status: 'confirmed',
      });

      const res = await request(app)
        .patch(`/api/appointments/${appt._id}/complete`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ completionConfirmedByDentist: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.appointment.status).toBe('completed');
      expect(res.body.data.appointment.completedBy).toBe('receptionist');

      // Invoice created
      const invoice = await Invoice.findOne({ appointment: appt._id });
      expect(invoice).not.toBeNull();
      expect(invoice.patient.toString()).toBe(patientUser._id.toString());
      expect(invoice.status).toBe('paid');

      // Notifications sent
      const recepNotif = await Notification.findOne({ user: receptionistUser._id, type: 'invoice_ready' });
      expect(recepNotif).not.toBeNull();

      const patientNotif = await Notification.findOne({ user: patientUser._id, type: 'appointment_completed' });
      expect(patientNotif).not.toBeNull();
    });

    it('rejects receptionist completion without confirmation or check-in (400)', async () => {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 1);

      const appt = await Appointment.create({
        patient: patientUser._id,
        dentist: dentistProfile._id,
        date: targetDate.toISOString().slice(0, 10),
        startTime: '10:00',
        endTime: '10:30',
        fees: { consultationFee: 500, totalAmount: 500 },
        paymentStatus: 'paid',
        status: 'confirmed',
      });

      const res = await request(app)
        .patch(`/api/appointments/${appt._id}/complete`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Front desk completion requires dentist confirmation');
    });
  });

  describe('§6 Reviews Endpoint: GET /api/reviews/mine', () => {
    it('returns reviews submitted by the authenticated patient', async () => {
      const appt = await Appointment.create({
        patient: patientUser._id,
        dentist: dentistProfile._id,
        date: '2026-10-20',
        startTime: '10:00',
        endTime: '10:30',
        fees: { consultationFee: 500, totalAmount: 500 },
        paymentStatus: 'paid',
        status: 'completed',
      });

      await Review.create({
        patient: patientUser._id,
        dentist: dentistProfile._id,
        appointment: appt._id,
        rating: 5,
        comment: 'Great bedside manner and painless cleaning!',
      });

      const res = await request(app)
        .get('/api/reviews/mine')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].comment).toContain('painless cleaning');
    });
  });
});
