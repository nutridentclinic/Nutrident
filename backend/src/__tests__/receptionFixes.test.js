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
const Invoice = require('../models/Invoice');
const Queue = require('../models/Queue');
const ClinicSettings = require('../models/ClinicSettings');
const Notification = require('../models/Notification');
const { signAccessToken } = require('../utils/generateToken');
const { resolveNotificationLink } = require('../services/notification.service');
const { todayInClinic, addDays, parseDateOnly } = require('../utils/clinicDate');

let mongoServer;
let receptionistToken;
let receptionistUser;
let patientUser1;
let patientUser2;
let dentistDoc;
let dentistUser;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test_jwt_secret_at_least_32_characters_long_for_test!';
  process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_at_least_32_chars_long!';
  process.env.SINGLE_DENTIST_MODE = 'true';
  process.env.CLINIC_TIMEZONE = 'Asia/Kolkata';

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  await ClinicSettings.create({
    _id: 'default',
    clinicName: 'DrNutrident Test Clinic',
    cancellationFullRefundHours: 24,
    taxPercentage: 5,
  });

  dentistUser = await User.create({
    name: 'Dr. Siddhesh Patil',
    email: 'doctor@drnutrident.test',
    phone: '9876543210',
    password: 'Password123!',
    role: 'dentist',
    isEmailVerified: true,
    isPhoneVerified: true,
  });

  dentistDoc = await Dentist.create({
    user: dentistUser._id,
    specialization: 'Cosmetic Dentistry',
    consultationFee: 600,
    slotDurationMinutes: 30,
    isVerified: true,
    isActive: true,
    weeklyAvailability: [
      { day: 1, slots: [{ startTime: '09:00', endTime: '13:00' }] },
      { day: 2, slots: [{ startTime: '09:00', endTime: '13:00' }] },
      { day: 3, slots: [{ startTime: '09:00', endTime: '13:00' }] },
      { day: 4, slots: [{ startTime: '09:00', endTime: '13:00' }] },
      { day: 5, slots: [{ startTime: '09:00', endTime: '13:00' }] },
      { day: 6, slots: [{ startTime: '09:00', endTime: '13:00' }] },
    ],
  });

  receptionistUser = await User.create({
    name: 'Front Desk Staff',
    email: 'reception@drnutrident.test',
    phone: '9876543211',
    password: 'Password123!',
    role: 'receptionist',
    isEmailVerified: true,
  });
  receptionistToken = signAccessToken({
    id: receptionistUser._id,
    role: receptionistUser.role,
    tv: receptionistUser.tokenVersion || 0,
  });

  patientUser1 = await User.create({
    name: 'Alice Wonder',
    email: 'alice@example.com',
    phone: '9876500001',
    password: 'Password123!',
    role: 'patient',
    isEmailVerified: true,
  });

  patientUser2 = await User.create({
    name: 'Bob Builder',
    email: 'bob@example.com',
    phone: '9876500002',
    password: 'Password123!',
    role: 'patient',
    isEmailVerified: true,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Area 1: Appointments Lookup & Server-Side Filtering', () => {
  let appt1, appt2, appt3;

  beforeAll(async () => {
    const today = parseDateOnly(todayInClinic());
    const tomorrow = parseDateOnly(addDays(todayInClinic(), 1));
    const nextWeek = parseDateOnly(addDays(todayInClinic(), 7));

    appt1 = await Appointment.create({
      patient: patientUser1._id,
      dentist: dentistDoc._id,
      date: today,
      startTime: '09:00',
      endTime: '09:30',
      mode: 'in-clinic',
      reasonForVisit: 'Routine cleaning',
      status: 'confirmed',
      paymentStatus: 'paid',
      fees: { consultationFee: 600, totalAmount: 600 },
    });

    appt2 = await Appointment.create({
      patient: patientUser2._id,
      dentist: dentistDoc._id,
      date: tomorrow,
      startTime: '10:00',
      endTime: '10:30',
      mode: 'in-clinic',
      reasonForVisit: 'Toothache consultation',
      status: 'pending',
      paymentStatus: 'pending',
      fees: { consultationFee: 600, totalAmount: 600 },
    });

    appt3 = await Appointment.create({
      patient: patientUser1._id,
      dentist: dentistDoc._id,
      date: nextWeek,
      startTime: '11:00',
      endTime: '11:30',
      mode: 'in-clinic',
      reasonForVisit: 'Braces adjustment',
      status: 'completed',
      paymentStatus: 'paid',
      fees: { consultationFee: 600, totalAmount: 600 },
    });
  });

  test('default view with no date filter returns appointments across all dates', async () => {
    const res = await request(app)
      .get('/api/appointments')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    const ids = res.body.data.map((a) => String(a._id));
    expect(ids).toContain(String(appt1._id));
    expect(ids).toContain(String(appt2._id));
    expect(ids).toContain(String(appt3._id));
    expect(res.body.meta).toMatchObject({
      total: expect.any(Number),
      page: 1,
      limit: expect.any(Number),
    });
  });

  test('validates date range: from > to returns 400', async () => {
    const res = await request(app)
      .get('/api/appointments?from=2026-11-10&to=2026-11-05')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/from date cannot be after to date/i);
  });

  test('search matches patient name, phone, and reason', async () => {
    const byName = await request(app)
      .get('/api/appointments?search=Alice')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(200);
    expect(byName.body.data.some((a) => a.patient?.name === 'Alice Wonder')).toBe(true);

    const byPhone = await request(app)
      .get('/api/appointments?search=9876500002')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(200);
    expect(byPhone.body.data.some((a) => a.patient?.name === 'Bob Builder')).toBe(true);

    const byReason = await request(app)
      .get('/api/appointments?search=Toothache')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(200);
    expect(byReason.body.data.some((a) => a.reasonForVisit === 'Toothache consultation')).toBe(true);
  });

  test('pasted 24-hex ObjectId matches exact appointment', async () => {
    const res = await request(app)
      .get(`/api/appointments?search=${appt2._id}`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(200);

    expect(res.body.data.length).toBe(1);
    expect(String(res.body.data[0]._id)).toBe(String(appt2._id));
  });

  test('filters combine with $and: status, mode, and search', async () => {
    const res = await request(app)
      .get('/api/appointments?status=pending&mode=in-clinic&search=Bob')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(200);

    expect(res.body.data.length).toBe(1);
    expect(String(res.body.data[0]._id)).toBe(String(appt2._id));
  });

  test('server pagination returns correct page and limit', async () => {
    const res = await request(app)
      .get('/api/appointments?page=1&limit=2')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(200);

    expect(res.body.data.length).toBe(2);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(2);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(3);
  });
});

describe('Area 2: Appointment Cancellation Rules', () => {
  let apptToCancel;

  beforeEach(async () => {
    const tomorrow = parseDateOnly(addDays(todayInClinic(), 1));
    apptToCancel = await Appointment.create({
      patient: patientUser1._id,
      dentist: dentistDoc._id,
      date: tomorrow,
      startTime: '12:00',
      endTime: '12:30',
      mode: 'in-clinic',
      reasonForVisit: 'Consultation',
      status: 'confirmed',
      fees: { consultationFee: 600, totalAmount: 600 },
    });
  });

  test('cancelling appointment records cancellationReason and cancelledBy receptionist', async () => {
    const res = await request(app)
      .patch(`/api/appointments/${apptToCancel._id}/cancel`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ reason: 'Patient called to reschedule' })
      .expect(200);

    expect(res.body.success).toBe(true);
    const updated = await Appointment.findById(apptToCancel._id);
    expect(updated.status).toBe('cancelled');
    expect(updated.cancelledBy).toBe('receptionist');
    expect(updated.cancellationReason).toBe('Patient called to reschedule');
  });

  test('cannot cancel already cancelled appointment', async () => {
    await Appointment.findByIdAndUpdate(apptToCancel._id, { status: 'cancelled' });

    const res = await request(app)
      .patch(`/api/appointments/${apptToCancel._id}/cancel`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ reason: 'Try again' })
      .expect(400);

    expect(res.body.success).toBe(false);
  });
});

describe('Area 3: Live Queue & Check-In Rules', () => {
  let todayAppt;

  beforeEach(async () => {
    await Appointment.deleteMany({});
    await Queue.deleteMany({});
    const today = parseDateOnly(todayInClinic());
    todayAppt = await Appointment.create({
      patient: patientUser1._id,
      dentist: dentistDoc._id,
      date: today,
      startTime: '09:30',
      endTime: '10:00',
      mode: 'in-clinic',
      status: 'confirmed',
      fees: { consultationFee: 600, totalAmount: 600 },
    });
  });

  test('check-in sets appointment status to checked-in and assigns token', async () => {
    const res = await request(app)
      .post('/api/queue/check-in')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        appointmentId: todayAppt._id,
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.tokenNumber).toBe(1);

    const appt = await Appointment.findById(todayAppt._id);
    expect(appt.status).toBe('checked-in');
    expect(appt.checkedInAt).toBeDefined();
  });

  test('duplicate check-in returns existing active token instead of creating duplicate', async () => {
    const first = await request(app)
      .post('/api/queue/check-in')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ patientId: patientUser2._id })
      .expect(201);

    const token1 = first.body.data.tokenNumber;

    const second = await request(app)
      .post('/api/queue/check-in')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ patientId: patientUser2._id })
      .expect(200);

    expect(second.body.data.tokenNumber).toBe(token1);
    const count = await Queue.countDocuments({ patient: patientUser2._id });
    expect(count).toBe(1);
  });

  test('cannot check in cancelled appointment', async () => {
    await Appointment.findByIdAndUpdate(todayAppt._id, { status: 'cancelled' });

    const res = await request(app)
      .post('/api/queue/check-in')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ appointmentId: todayAppt._id })
      .expect(400);

    expect(res.body.message).toMatch(/cannot check in an appointment that is already cancelled/i);
  });

  test('cannot check in appointment on different date', async () => {
    const tomorrow = parseDateOnly(addDays(todayInClinic(), 1));
    const tomAppt = await Appointment.create({
      patient: patientUser1._id,
      dentist: dentistDoc._id,
      date: tomorrow,
      startTime: '10:00',
      endTime: '10:30',
      mode: 'in-clinic',
      status: 'confirmed',
      fees: { consultationFee: 600, totalAmount: 600 },
    });

    const res = await request(app)
      .post('/api/queue/check-in')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ appointmentId: tomAppt._id })
      .expect(400);

    expect(res.body.message).toMatch(/scheduled for a different date/i);
  });

  test('completing queue entry completes linked appointment and generates invoice', async () => {
    const checkInRes = await request(app)
      .post('/api/queue/check-in')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ appointmentId: todayAppt._id })
      .expect(201);

    const entryId = checkInRes.body.data._id;

    const completeRes = await request(app)
      .patch(`/api/queue/${entryId}/complete`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(200);

    expect(completeRes.body.success).toBe(true);

    const appt = await Appointment.findById(todayAppt._id);
    expect(appt.status).toBe('completed');

    const inv = await Invoice.findOne({ appointment: todayAppt._id });
    expect(inv).toBeDefined();
    expect(inv.status).toBe('unpaid');
  });

  test('removing queue entry marks it cancelled', async () => {
    const checkInRes = await request(app)
      .post('/api/queue/check-in')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ patientId: patientUser2._id })
      .expect(201);

    const entryId = checkInRes.body.data._id;

    const deleteRes = await request(app)
      .delete(`/api/queue/${entryId}`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(200);

    expect(deleteRes.body.data.status).toBe('cancelled');
  });
});

describe('Area 4: Invoices & Payment Recording', () => {
  let apptForInvoice;

  beforeEach(async () => {
    await Invoice.deleteMany({});
    await Appointment.deleteMany({});
    const today = parseDateOnly(todayInClinic());
    apptForInvoice = await Appointment.create({
      patient: patientUser1._id,
      dentist: dentistDoc._id,
      date: today,
      startTime: '14:00',
      endTime: '14:30',
      mode: 'in-clinic',
      status: 'completed',
      fees: { consultationFee: 600, totalAmount: 600 },
    });
  });

  test('creating invoice for appointment creates invoice and prevents duplicates (409)', async () => {
    const first = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        patientId: patientUser1._id,
        appointmentId: apptForInvoice._id,
        items: [{ description: 'Consultation', quantity: 1, unitPrice: 600 }],
      })
      .expect(201);

    expect(first.body.success).toBe(true);
    expect(first.body.data.invoiceNumber).toBeDefined();

    // Second attempt should return 409
    const second = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        patientId: patientUser1._id,
        appointmentId: apptForInvoice._id,
        items: [{ description: 'Consultation', quantity: 1, unitPrice: 600 }],
      })
      .expect(409);

    expect(second.body.success).toBe(false);
    expect(second.body.message).toMatch(/already exists for this appointment/i);
    expect(second.body.data._id).toBe(first.body.data._id);
  });

  test('records partial payment without marking invoice fully paid', async () => {
    const inv = await Invoice.create({
      invoiceNumber: `INV-PARTIAL-${Date.now()}`,
      patient: patientUser1._id,
      items: [{ description: 'Scaling', quantity: 1, unitPrice: 1500, amount: 1500 }],
      subTotal: 1500,
      totalAmount: 1500,
      status: 'unpaid',
      paidAmount: 0,
    });

    const res = await request(app)
      .patch(`/api/invoices/${inv._id}/mark-paid`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        method: 'cash',
        amount: 500,
        reference: 'Cash advance',
      })
      .expect(200);

    expect(res.body.data.paidAmount).toBe(500);
    expect(res.body.data.status).toBe('unpaid');
    expect(res.body.data.payments.length).toBe(1);

    // Now pay remaining 1000
    const settle = await request(app)
      .patch(`/api/invoices/${inv._id}/mark-paid`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        method: 'upi',
        amount: 1000,
        reference: 'UPI remaining',
      })
      .expect(200);

    expect(settle.body.data.paidAmount).toBe(1500);
    expect(settle.body.data.status).toBe('paid');
  });

  test('GET /api/invoices/:id/pdf responds with pdf content-type', async () => {
    const inv = await Invoice.create({
      invoiceNumber: `INV-PDF-${Date.now()}`,
      patient: patientUser1._id,
      items: [{ description: 'Consultation', quantity: 1, unitPrice: 600, amount: 600 }],
      subTotal: 600,
      totalAmount: 600,
      status: 'paid',
    });

    const res = await request(app)
      .get(`/api/invoices/${inv._id}/pdf`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(200);

    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });
});

describe('Area 5: Settings & Profile Management', () => {
  test('PATCH /api/auth/me updates receptionist name and phone', async () => {
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        name: 'Chief Receptionist',
        phone: '9876543999',
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Chief Receptionist');
    expect(res.body.data.phone).toBe('9876543999');

    const updated = await User.findById(receptionistUser._id);
    expect(updated.name).toBe('Chief Receptionist');
  });

  test('PATCH /api/auth/me rejects phone number already taken by another account', async () => {
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        phone: patientUser1.phone,
      })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/phone number is already in use/i);
  });

  test('PATCH /api/notifications/preferences saves for receptionist', async () => {
    const res = await request(app)
      .patch('/api/notifications/preferences')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        email: false,
        push: true,
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(false);
    expect(res.body.data.push).toBe(true);
  });
});

describe('Area 6: Notifications & Deep Linking', () => {
  test('resolveNotificationLink builds valid receptionist deep links', () => {
    const testId = '66f000000000000000000001';
    expect(resolveNotificationLink('appointment_confirmed', testId, 'receptionist')).toBe(
      `/reception/appointments?open=${testId}`
    );
    expect(resolveNotificationLink('new_booking', testId, 'receptionist')).toBe(
      `/reception/appointments?open=${testId}`
    );
    expect(resolveNotificationLink('invoice_ready', testId, 'receptionist')).toBe(
      `/reception/invoices?open=${testId}`
    );
    expect(resolveNotificationLink('payment_received', testId, 'receptionist')).toBe(
      `/reception/invoices?open=${testId}`
    );
    expect(resolveNotificationLink('queue_update', testId, 'receptionist')).toBe('/reception/queue');
    expect(resolveNotificationLink('new_patient_registered', testId, 'receptionist')).toBe(
      `/reception/patients/${testId}`
    );
    expect(resolveNotificationLink('general', null, 'receptionist')).toBe('/reception/notifications');
  });

  test('marking notification as read returns 404 for non-existent or foreign ID', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .patch(`/api/notifications/${fakeId}/read`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not found/i);
  });

  test('marking user own notification as read is successful and idempotent', async () => {
    const notif = await Notification.create({
      user: receptionistUser._id,
      title: 'Test Notification',
      message: 'New patient registered',
      type: 'general',
      isRead: false,
    });

    const first = await request(app)
      .patch(`/api/notifications/${notif._id}/read`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(200);

    expect(first.body.success).toBe(true);
    const updated = await Notification.findById(notif._id);
    expect(updated.isRead).toBe(true);

    // Second call is idempotent
    const second = await request(app)
      .patch(`/api/notifications/${notif._id}/read`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(200);

    expect(second.body.success).toBe(true);
  });
});
