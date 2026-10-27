const request = require('supertest');
const express = require('express');
const { uploadToCloudinary, pingCloudinary, cloudinary } = require('../config/cloudinary');
const upload = require('../middleware/upload.middleware');

describe('Upload Engine & Magic Bytes Validation', () => {
  let testApp;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.CLOUDINARY_CLOUD_NAME = 'test_clinic_cloud';
    process.env.CLOUDINARY_API_KEY = '123456789012345';
    process.env.CLOUDINARY_API_SECRET = 'test_secret_abcdef123456';

    testApp = express();
    testApp.use(express.json());
    testApp.post(
      '/test-upload',
      upload('test-folder').single('file'),
      (req, res) => {
        res.status(200).json({
          success: true,
          file: {
            path: req.file.path,
            filename: req.file.filename,
            detectedMime: req.file.detectedMime,
          },
        });
      }
    );
    testApp.use((err, req, res, next) => {
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('rejects files with invalid magic bytes (e.g. text/exe/fake)', async () => {
    const fakeBuffer = Buffer.from('FAKE-BINARY-CONTENT-NOT-IMAGE');
    const res = await request(testApp)
      .post('/test-upload')
      .attach('file', fakeBuffer, 'fake.png');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Unsupported file type');
  });

  it('accepts valid PNG magic bytes and uploads via stream', async () => {
    // Valid PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

    const mockStream = {
      end: jest.fn((buf) => {}),
    };
    jest.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation((opts, callback) => {
      process.nextTick(() => {
        callback(null, {
          secure_url: 'https://res.cloudinary.com/test_clinic_cloud/image/upload/v12345/sample.png',
          public_id: 'dental_clinic/test-folder/sample_png_123',
          bytes: pngBuffer.length,
          format: 'png',
          resource_type: 'image',
        });
      });
      return mockStream;
    });

    const res = await request(testApp)
      .post('/test-upload')
      .attach('file', pngBuffer, 'sample.png');

    expect(res.status).toBe(200);
    expect(res.body.file.detectedMime).toBe('image/png');
    expect(res.body.file.filename).toBe('dental_clinic/test-folder/sample_png_123');
    expect(mockStream.end).toHaveBeenCalled();
  });

  it('accepts valid PDF magic bytes (%PDF-)', async () => {
    // Valid PDF signature: 25 50 44 46 2D (%PDF-)
    const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);

    const mockStream = {
      end: jest.fn((buf) => {}),
    };
    jest.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation((opts, callback) => {
      process.nextTick(() => {
        callback(null, {
          secure_url: 'https://res.cloudinary.com/test_clinic_cloud/raw/upload/v12345/document.pdf',
          public_id: 'dental_clinic/test-folder/document_pdf_123',
          bytes: pdfBuffer.length,
          format: 'pdf',
          resource_type: 'raw',
        });
      });
      return mockStream;
    });

    const res = await request(testApp)
      .post('/test-upload')
      .attach('file', pdfBuffer, 'document.pdf');

    expect(res.status).toBe(200);
    expect(res.body.file.detectedMime).toBe('application/pdf');
    expect(res.body.file.filename).toBe('dental_clinic/test-folder/document_pdf_123');
    expect(mockStream.end).toHaveBeenCalled();
  });

  it('rejects files larger than 10 MB limit', async () => {
    // 10.5 MB buffer
    const largeBuffer = Buffer.alloc(10.5 * 1024 * 1024);
    // Write valid PNG header
    largeBuffer[0] = 0x89;
    largeBuffer[1] = 0x50;
    largeBuffer[2] = 0x4e;
    largeBuffer[3] = 0x47;
    largeBuffer[4] = 0x0d;
    largeBuffer[5] = 0x0a;
    largeBuffer[6] = 0x1a;
    largeBuffer[7] = 0x0a;

    const res = await request(testApp)
      .post('/test-upload')
      .attach('file', largeBuffer, 'large.png');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('10 MB limit');
  });

  it('pingCloudinary returns status object with no secrets', async () => {
    jest.spyOn(cloudinary.api, 'ping').mockResolvedValueOnce({ status: 'ok' });
    const status = await pingCloudinary();
    expect(status).toHaveProperty('configured');
    expect(status).toHaveProperty('reachable');
    expect(status).toHaveProperty('cloudName');
    expect(status).toHaveProperty('reason');
    // Ensure no secret is exposed
    expect(status).not.toHaveProperty('api_secret');
    expect(status).not.toHaveProperty('secret');
    expect(status.reachable).toBe(true);
  });
});
