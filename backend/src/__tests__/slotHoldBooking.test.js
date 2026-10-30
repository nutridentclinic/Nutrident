const request = require('supertest');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('../config/firebase', () => ({
  auth: () => ({ verifyIdToken: jest.fn() }),
  messaging: () => ({ send: jest.fn().mockResolvedValue('fake-msg-id') }),
  isConfigured: () => false,
}));

let mockLastCreatedOrderId = 'order_mock_123';

jest.mock('../config/razorpay', () => ({
  orders: {
    create: jest.fn().mockImplementation(async (opts) => {
      mockLastCreatedOrderId = `order_mock_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      return {
        id: mockLastCreatedOrderId,
        amount: opts.amount || 50000,
        currency: opts.currency || 'INR',
      };
    }),
  },
  payments: {
    fetch: jest.fn().mockImplementation(async (id) => ({
      id,
      order_id: mockLastCreatedOrderId,
      amount: 50000,
      currency: 'INR',
      status: 'captured',
    })),
    refund: jest.fn().mockResolvedValue({ id: 'rfnd_mock_123', amount: 50000, status: 'processed' }),
  },
}));

jest.mock('../config/email', () => ({
  sendEmail: jest.fn().mockResolvedValue({ messageId: 'mock-msg' }),
}));

const app = require('../app');
const User = require('../models/User');
const Dentist = require('../models/Dentist');
const Appointment = require('../models/Appointment');
const SlotHold = require('../models/SlotHold');
const Payment = require('../models/Payment');
const Invoice = require('../models/Invoice');
const ClinicSettings = require('../models/ClinicSettings');
const { signAccessToken } = require('../utils/generateToken');

let mongoServer;
let patientUser;
let patientToken;
let patient2User;
let patient2Token;
let dentistUser;
let dentistDoc;

const TEST_SECRET = 'test_razorpay_secret_key_12345';

jest.setTimeout(60000);

beforeAll(async () => {
  process.env.JWT_SECRET = 'test_jwt_secret_at_least_32_characters_long_for_test!';
  process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_at_least_32_chars_long!';
  process.env.RAZORPAY_KEY_ID = 'rzp_test_mock123';
  process.env.RAZORPAY_KEY_SECRET = TEST_SECRET;
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
  await SlotHold.deleteMany({});
  await Payment.deleteMany({});
  await Invoice.deleteMany({});
  await ClinicSettings.deleteMany({});

  patientUser = await User.create({
    name: 'Jayesh Patient',
    email: 'patient@test.com',
    password: 'Password123!',
    phone: '9876543210',
    role: 'patient',
    isEmailVerified: true,
  });
  patientToken = signAccessToken({ id: patientUser._id, role: 'patient' });

  patient2User = await User.create({
    name: 'Second Patient',
    email: 'patient2@test.com',
    password: 'Password123!',
    phone: '9876543211',
    role: 'patient',
    isEmailVerified: true,
  });
  patient2Token = signAccessToken({ id: patient2User._id, role: 'patient' });

  dentistUser = await User.create({
    name: 'Dr. Shraddha',
    email: 'dentist@test.com',
    password: 'Password123!',
    phone: '9876543222',
    role: 'dentist',
    isEmailVerified: true,
  });
  dentistDoc = await Dentist.create({
    user: dentistUser._id,
    specialization: 'Orthodontics',
    consultationFee: 500,
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
      { day: 0, slots: [{ startTime: '09:00', endTime: '13:00' }] },
    ],
  });

  await ClinicSettings.create({
    allowPayAtClinic: true,
    consultationFee: 500,
  });
});

function computeSignature(orderId, paymentId) {
  return crypto
    .createHmac('sha256', TEST_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

describe('SlotHold & Zero Pending Online Appointments', () => {
  const targetDate = '2026-11-10';
  const targetTime = '10:00';

  it('1. Online booking creates a SlotHold + Razorpay Order and NO Appointment document', async () => {
    const res = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        dentistId: dentistDoc._id,
        date: targetDate,
        startTime: targetTime,
        mode: 'in-clinic',
        reasonForVisit: 'Toothache checkup',
        payAtClinic: false,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('holdId');
    expect(res.body.data).toHaveProperty('order');
    expect(res.body.data.order).toHaveProperty('orderId');

    // Crucial requirement: No appointment document must exist
    const appointmentCount = await Appointment.countDocuments();
    expect(appointmentCount).toBe(0);

    // SlotHold must be active
    const hold = await SlotHold.findById(res.body.data.holdId);
    expect(hold).not.toBeNull();
    expect(hold.status).toBe('active');
    expect(hold.startTime).toBe(targetTime);
    expect(new Date(hold.date).toISOString().slice(0, 10)).toBe(targetDate);

    // Payment must exist in 'created' state referencing the hold
    const payment = await Payment.findOne({ hold: hold._id });
    expect(payment).not.toBeNull();
    expect(payment.status).toBe('created');
  });

  it('2. Active hold marks slot as unavailable in availability query', async () => {
    // Before hold: slot is available
    const beforeRes = await request(app)
      .get(`/api/dentists/${dentistDoc._id}/slots?date=${targetDate}`)
      .set('Authorization', `Bearer ${patientToken}`);
    expect(beforeRes.status).toBe(200);
    const availableBefore = beforeRes.body.data.map((s) => s.startTime);
    expect(availableBefore).toContain(targetTime);

    // Create hold
    await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        dentistId: dentistDoc._id,
        date: targetDate,
        startTime: targetTime,
        mode: 'in-clinic',
        payAtClinic: false,
      });

    // After hold: slot is excluded
    const afterRes = await request(app)
      .get(`/api/dentists/${dentistDoc._id}/slots?date=${targetDate}`)
      .set('Authorization', `Bearer ${patientToken}`);
    expect(afterRes.status).toBe(200);
    const availableAfter = afterRes.body.data.map((s) => s.startTime);
    expect(availableAfter).not.toContain(targetTime);
  });

  it('3. Racing condition: Second patient cannot hold the same slot (returns 409 Conflict)', async () => {
    // Patient 1 holds the slot
    const p1Res = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        dentistId: dentistDoc._id,
        date: targetDate,
        startTime: targetTime,
        mode: 'in-clinic',
        payAtClinic: false,
      });
    expect(p1Res.status).toBe(201);

    // Patient 2 tries holding the exact same slot
    const p2Res = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patient2Token}`)
      .send({
        dentistId: dentistDoc._id,
        date: targetDate,
        startTime: targetTime,
        mode: 'in-clinic',
        payAtClinic: false,
      });

    expect([400, 409]).toContain(p2Res.status);
    expect(await Appointment.countDocuments()).toBe(0);
  });

  it('4. Cancelling checkout releases the hold immediately and frees slot', async () => {
    // Hold slot
    const createRes = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        dentistId: dentistDoc._id,
        date: targetDate,
        startTime: targetTime,
        mode: 'in-clinic',
        payAtClinic: false,
      });
    const { holdId } = createRes.body.data;

    // Cancel hold
    const cancelRes = await request(app)
      .post(`/api/appointments/holds/${holdId}/cancel`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send();

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.success).toBe(true);

    // Hold should be deleted/cancelled
    const hold = await SlotHold.findById(holdId);
    expect(hold).toBeNull();

    // Slot is immediately available again
    const availRes = await request(app)
      .get(`/api/dentists/${dentistDoc._id}/slots?date=${targetDate}`)
      .set('Authorization', `Bearer ${patientToken}`);
    const availableSlots = availRes.body.data.map((s) => s.startTime);
    expect(availableSlots).toContain(targetTime);
    expect(await Appointment.countDocuments()).toBe(0);
  });

  it('5. Successful payment verification atomically creates confirmed + paid appointment', async () => {
    // Step 1: Hold slot
    const createRes = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        dentistId: dentistDoc._id,
        date: targetDate,
        startTime: targetTime,
        mode: 'in-clinic',
        reasonForVisit: 'Cleaning',
        payAtClinic: false,
      });
    const { holdId, order } = createRes.body.data;
    const paymentId = 'pay_mock_123456';
    const signature = computeSignature(order.orderId, paymentId);

    // Step 2: Verify payment
    const verifyRes = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        razorpay_order_id: order.orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
      });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.data.appointment).toBeDefined();
    expect(verifyRes.body.data.appointment.status).toBe('confirmed');
    expect(verifyRes.body.data.appointment.paymentStatus).toBe('paid');

    // Database assertions: exactly 1 appointment
    const appointments = await Appointment.find();
    expect(appointments).toHaveLength(1);
    expect(appointments[0].status).toBe('confirmed');
    expect(appointments[0].paymentStatus).toBe('paid');
    expect(new Date(appointments[0].date).toISOString().slice(0, 10)).toBe(targetDate);
    expect(appointments[0].startTime).toBe(targetTime);

    // Hold must be cleaned up
    const hold = await SlotHold.findById(holdId);
    expect(hold).toBeNull();

    // Invoice must have been generated
    const invoice = await Invoice.findOne({ appointment: appointments[0]._id });
    expect(invoice).not.toBeNull();
    expect(invoice.status).toBe('paid');
  });

  it('6. Payment verification is idempotent', async () => {
    const createRes = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        dentistId: dentistDoc._id,
        date: targetDate,
        startTime: targetTime,
        mode: 'in-clinic',
        payAtClinic: false,
      });
    const { order } = createRes.body.data;
    const paymentId = 'pay_mock_repeat_123';
    const signature = computeSignature(order.orderId, paymentId);

    // First verify
    const res1 = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        razorpay_order_id: order.orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
      });
    expect(res1.status).toBe(200);

    // Second verify with same params
    const res2 = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        razorpay_order_id: order.orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
      });
    expect(res2.status).toBe(200);
    expect(res2.body.data.appointment._id).toBe(res1.body.data.appointment._id);

    // Ensure still exactly 1 appointment
    expect(await Appointment.countDocuments()).toBe(1);
  });

  it('7. Razorpay webhook (payment.captured) converts hold into confirmed appointment', async () => {
    const createRes = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        dentistId: dentistDoc._id,
        date: targetDate,
        startTime: targetTime,
        mode: 'in-clinic',
        payAtClinic: false,
      });
    const { order } = createRes.body.data;
    const webhookPayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_webhook_999',
            order_id: order.orderId,
            status: 'captured',
            amount: 50000,
          },
        },
      },
    };

    const webhookBody = JSON.stringify(webhookPayload);
    const webhookSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || TEST_SECRET)
      .update(webhookBody)
      .digest('hex');

    process.env.RAZORPAY_WEBHOOK_SECRET = TEST_SECRET;

    const webhookRes = await request(app)
      .post('/api/payments/webhook')
      .set('x-razorpay-signature', webhookSignature)
      .set('Content-Type', 'application/json')
      .send(webhookPayload);

    expect(webhookRes.status).toBe(200);

    const appointments = await Appointment.find();
    expect(appointments).toHaveLength(1);
    expect(appointments[0].status).toBe('confirmed');
    expect(appointments[0].paymentStatus).toBe('paid');
  });

  it('8. Pay-at-clinic path creates confirmed appointment with pending paymentStatus', async () => {
    const res = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        dentistId: dentistDoc._id,
        date: targetDate,
        startTime: targetTime,
        mode: 'in-clinic',
        payAtClinic: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('confirmed');
    expect(res.body.data.paymentStatus).toBe('pending');
    expect(res.body.data.payAtClinic).toBe(true);

    const appointments = await Appointment.find();
    expect(appointments).toHaveLength(1);
    expect(appointments[0].status).toBe('confirmed');
    expect(appointments[0].paymentStatus).toBe('pending');
  });
});
