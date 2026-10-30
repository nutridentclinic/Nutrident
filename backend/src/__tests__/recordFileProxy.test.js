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
    isCloudinaryConfigured: () => false,
    cloudinary: {
      ...actual.cloudinary,
      api: { ping: jest.fn().mockResolvedValue({ status: 'ok' }) },
      uploader: { destroy: jest.fn().mockResolvedValue({ result: 'ok' }) },
    },
  };
});

const app = require('../app');
const User = require('../models/User');
const MedicalRecord = require('../models/MedicalRecord');
const { signAccessToken } = require('../utils/generateToken');

describe('Medical Record File Proxy & Access Control', () => {
  let mongoServer;
  let patientA, patientB, dentistStaff, receptionistStaff, adminStaff;
  let tokenA, tokenB, dentistToken, receptionistToken, adminToken;
  let recordA, recordLinkedToProfile;
  const originalFetch = global.fetch;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test_jwt_secret_at_least_32_characters_long_for_test!';
    process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_at_least_32_chars_long!';

    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    patientA = await User.create({
      name: 'Patient Alpha',
      email: 'patienta@example.com',
      phone: '9988776611',
      password: 'Password123!',
      role: 'patient',
      isEmailVerified: true,
    });

    patientB = await User.create({
      name: 'Patient Beta',
      email: 'patientb@example.com',
      phone: '9988776622',
      password: 'Password123!',
      role: 'patient',
      isEmailVerified: true,
    });

    dentistStaff = await User.create({
      name: 'Dr. Smile',
      email: 'dentist@example.com',
      phone: '9988776633',
      password: 'Password123!',
      role: 'dentist',
      isEmailVerified: true,
    });

    receptionistStaff = await User.create({
      name: 'Front Desk',
      email: 'reception@example.com',
      phone: '9988776644',
      password: 'Password123!',
      role: 'receptionist',
      isEmailVerified: true,
    });

    adminStaff = await User.create({
      name: 'Clinic Admin',
      email: 'admin@example.com',
      phone: '9988776655',
      password: 'Password123!',
      role: 'admin',
      isEmailVerified: true,
    });

    tokenA = signAccessToken({ id: patientA._id, role: 'patient', tv: 0 });
    tokenB = signAccessToken({ id: patientB._id, role: 'patient', tv: 0 });
    dentistToken = signAccessToken({ id: dentistStaff._id, role: 'dentist', tv: 0 });
    receptionistToken = signAccessToken({ id: receptionistStaff._id, role: 'receptionist', tv: 0 });
    adminToken = signAccessToken({ id: adminStaff._id, role: 'admin', tv: 0 });

    const Patient = require('../models/Patient');
    const profileA = await Patient.create({
      user: patientA._id,
      dateOfBirth: '1995-01-01',
      gender: 'female',
    });

    recordA = await MedicalRecord.create({
      patient: patientA._id,
      uploadedBy: patientA._id,
      type: 'xray',
      title: 'Molar X-Ray',
      file: {
        url: 'https://res.cloudinary.com/test/image/upload/v12345/molar.pdf',
        publicId: 'dental_clinic/records/molar_123',
        resourceType: 'auto',
        format: 'pdf',
        mimeType: 'application/pdf',
        originalName: 'molar_scan.pdf',
      },
    });

    // Record uploaded with Patient model ID instead of User ID
    recordLinkedToProfile = await MedicalRecord.create({
      patient: profileA._id,
      uploadedBy: dentistStaff._id,
      type: 'scan',
      title: 'CBCT 3D Scan',
      file: {
        url: 'https://res.cloudinary.com/test/image/upload/v12345/cbct.pdf',
        publicId: 'dental_clinic/records/cbct_456',
        resourceType: 'auto',
        format: 'pdf',
        mimeType: 'application/pdf',
        originalName: 'cbct_scan.pdf',
      },
    });
  });

  afterAll(async () => {
    global.fetch = originalFetch;
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('serves 200 PDF bytes starting with %PDF for patient owner', async () => {
    const fakePdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      arrayBuffer: async () => fakePdfBytes,
    });

    const res = await request(app)
      .get(`/api/medical-records/${recordA._id}/file`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('inline; filename="molar_scan.pdf"');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(res.body.slice(0, 4).toString()).toBe('%PDF');
  });

  it('allows receptionist to view any patient medical record file', async () => {
    const fakePdfBytes = Buffer.from('%PDF-1.4 receptionist test');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      arrayBuffer: async () => fakePdfBytes,
    });

    const res = await request(app)
      .get(`/api/medical-records/${recordA._id}/file`)
      .set('Authorization', `Bearer ${receptionistToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.body.slice(0, 4).toString()).toBe('%PDF');
  });

  it('allows admin to view any patient medical record file', async () => {
    const fakePdfBytes = Buffer.from('%PDF-1.4 admin test');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      arrayBuffer: async () => fakePdfBytes,
    });

    const res = await request(app)
      .get(`/api/medical-records/${recordA._id}/file`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.body.slice(0, 4).toString()).toBe('%PDF');
  });

  it('allows patient to view record even if patient field was linked via Patient profile ID', async () => {
    const fakePdfBytes = Buffer.from('%PDF-1.4 cbct scan');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      arrayBuffer: async () => fakePdfBytes,
    });

    const res = await request(app)
      .get(`/api/medical-records/${recordLinkedToProfile._id}/file`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });

  it('allows staff to list all records via GET /api/medical-records', async () => {
    const res = await request(app)
      .get('/api/medical-records')
      .set('Authorization', `Bearer ${receptionistToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('allows patient to retrieve records via GET /api/medical-records/me including profile-linked records', async () => {
    const res = await request(app)
      .get('/api/medical-records/me')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const titles = res.body.data.map((r) => r.title);
    expect(titles).toContain('Molar X-Ray');
    expect(titles).toContain('CBCT 3D Scan');
  });

  it('serves 200 attachment for ?download=1', async () => {
    const fakePdfBytes = Buffer.from('%PDF-1.4 sample content');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      arrayBuffer: async () => fakePdfBytes,
    });

    const res = await request(app)
      .get(`/api/medical-records/${recordA._id}/file?download=1`)
      .set('Authorization', `Bearer ${dentistToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment; filename="molar_scan.pdf"');
  });

  it('returns 403 when another patient attempts to access the record', async () => {
    const res = await request(app)
      .get(`/api/medical-records/${recordA._id}/file`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('You do not have access to this medical record');
  });

  it('returns 502 JSON error when upstream storage fails or returns 404/500', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      arrayBuffer: async () => Buffer.from('Access Denied'),
    });

    const res = await request(app)
      .get(`/api/medical-records/${recordA._id}/file`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Unable to retrieve file from storage provider');
  });

  it('returns 502 JSON error when upstream network request throws or times out', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Connection timed out'));

    const res = await request(app)
      .get(`/api/medical-records/${recordA._id}/file`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('timed out or is unreachable');
  });
});
