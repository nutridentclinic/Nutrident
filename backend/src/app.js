const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const sanitizeInput = require('./middleware/sanitize.middleware');

const errorMiddleware = require('./middleware/error.middleware');
const notFound = require('./middleware/notFound.middleware');
const { apiLimiter } = require('./middleware/rateLimit.middleware');
const { razorpayWebhook } = require('./controllers/payment.controller');

const app = express();

// --- Security & core middleware ---
app.use(helmet());
app.use(
  cors({
    origin: [process.env.CLIENT_URL, process.env.DENTIST_PANEL_URL].filter(Boolean),
    credentials: true,
  })
);
app.use(compression());
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// --- Razorpay webhook needs the RAW body for signature verification.
// This MUST be registered BEFORE express.json() and only for this exact path. ---
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), razorpayWebhook);

// --- Standard body parsing for every other route ---
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(sanitizeInput);

app.use('/api', apiLimiter);

// --- Health check ---
app.get('/api/health', (req, res) => res.status(200).json({ success: true, message: 'API is running' }));

// --- Routes ---
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/patients', require('./routes/patient.routes'));
app.use('/api/dentists', require('./routes/dentist.routes'));
app.use('/api/appointments', require('./routes/appointment.routes'));
app.use('/api/treatments', require('./routes/treatment.routes'));
app.use('/api/treatment-plans', require('./routes/treatmentPlan.routes'));
app.use('/api/dental-charts', require('./routes/dentalChart.routes'));
app.use('/api/prescriptions', require('./routes/prescription.routes'));
app.use('/api/medical-records', require('./routes/medicalRecord.routes'));
app.use('/api/payments', require('./routes/payment.routes')); // webhook already mounted above; other payment routes here
app.use('/api/invoices', require('./routes/invoice.routes'));
app.use('/api/coupons', require('./routes/coupon.routes'));
app.use('/api/reviews', require('./routes/review.routes'));
app.use('/api/notifications', require('./routes/notification.routes'));
app.use('/api/queue', require('./routes/queue.routes'));
app.use('/api/dashboard', require('./routes/dashboard.routes'));
app.use('/api/clinic-settings', require('./routes/clinicSettings.routes'));
app.use('/api/staff', require('./routes/staff.routes'));
app.use('/api/clinics', require('./routes/clinic.routes'));

app.use(notFound);
app.use(errorMiddleware);

module.exports = app;