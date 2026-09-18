const crypto = require('crypto');
const razorpay = require('../config/razorpay');
const Payment = require('../models/Payment');
const Appointment = require('../models/Appointment');
const Invoice = require('../models/Invoice');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');
const { notify } = require('../services/notification.service');
const logger = require('../utils/logger');
const { processRefund } = require('../services/payment.service');

// @route POST /api/payments/create-order
// Body: { appointmentId }  -> creates a Razorpay order for that appointment's total amount
exports.createOrder = catchAsync(async (req, res, next) => {
  const { appointmentId } = req.body;

  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) return next(new AppError('Appointment not found.', 404));
  if (!appointment.patient.equals(req.user._id)) {
    return next(new AppError('You can only pay for your own appointments.', 403));
  }
  if (appointment.paymentStatus === 'paid') {
    return next(new AppError('This appointment is already paid for.', 400));
  }

  const amountInPaise = Math.round(appointment.fees.totalAmount * 100);

  const order = await razorpay.orders.create({
    amount: amountInPaise,
    currency: 'INR',
    receipt: `appt_${appointment._id}`,
    notes: { appointmentId: String(appointment._id), patientId: String(req.user._id) },
  });

  const payment = await Payment.create({
    patient: req.user._id,
    appointment: appointment._id,
    amount: appointment.fees.totalAmount,
    razorpayOrderId: order.id,
    status: 'created',
  });

  appointment.payment = payment._id;
  await appointment.save();

  success(res, 201, 'Order created.', {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: process.env.RAZORPAY_KEY_ID, // frontend needs this to open Razorpay checkout
    paymentId: payment._id,
  });
});

// @route POST /api/payments/verify
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
// Called by the client right after Razorpay checkout succeeds.
exports.verifyPayment = catchAsync(async (req, res, next) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    await Payment.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      { status: 'failed', failureReason: 'Signature verification failed' }
    );
    return next(new AppError('Payment verification failed.', 400));
  }

  const payment = await Payment.findOneAndUpdate(
    { razorpayOrderId: razorpay_order_id },
    {
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      status: 'paid',
    },
    { new: true }
  );
  if (!payment) return next(new AppError('Payment record not found.', 404));

  let appointment = null;
  if (payment.appointment) {
    appointment = await Appointment.findByIdAndUpdate(
      payment.appointment,
      { paymentStatus: 'paid', status: 'confirmed' },
      { new: true }
    );
  }
  if (payment.invoice) {
    await Invoice.findByIdAndUpdate(payment.invoice, { status: 'paid', payment: payment._id });
  }

  await notify({
    userId: payment.patient,
    title: 'Payment Successful',
    message: `Your payment of ₹${payment.amount} was successful.`,
    type: 'payment_successful',
    relatedId: payment._id,
  });

  if (appointment) {
    await notify({
      userId: appointment.patient,
      title: 'Appointment Confirmed',
      message: `Your appointment on ${appointment.date.toDateString()} at ${appointment.startTime} is confirmed.`,
      type: 'appointment_confirmed',
      relatedId: appointment._id,
    });
  }

  success(res, 200, 'Payment verified successfully.', { payment, appointment });
});

// @route POST /api/payments/webhook
// Razorpay server-to-server webhook - the source of truth (works even if client closes browser mid-payment).
// Must be mounted with express.raw() BEFORE express.json() for this route - see app.js.
exports.razorpayWebhook = catchAsync(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(req.body) // raw buffer
    .digest('hex');

  if (signature !== expectedSignature) {
    logger.warn('Razorpay webhook signature mismatch.');
    return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
  }

  const event = JSON.parse(req.body.toString());

  if (event.event === 'payment.captured') {
    const orderId = event.payload.payment.entity.order_id;
    const paymentId = event.payload.payment.entity.id;

    const payment = await Payment.findOneAndUpdate(
      { razorpayOrderId: orderId },
      { status: 'paid', razorpayPaymentId: paymentId, method: event.payload.payment.entity.method },
      { new: true }
    );

    if (payment && payment.appointment) {
      await Appointment.findByIdAndUpdate(payment.appointment, { paymentStatus: 'paid', status: 'confirmed' });
    }
  }

  if (event.event === 'payment.failed') {
    const orderId = event.payload.payment.entity.order_id;
    await Payment.findOneAndUpdate(
      { razorpayOrderId: orderId },
      { status: 'failed', failureReason: event.payload.payment.entity.error_description || 'Payment failed' }
    );
  }

  res.status(200).json({ received: true });
});

// @route POST /api/payments/:id/refund  (admin/dentist initiates refund, e.g. on cancellation)
exports.refundPayment = catchAsync(async (req, res, next) => {
  const { amount, reason } = req.body;
  const payment = await Payment.findById(req.params.id);
  if (!payment) return next(new AppError('Payment not found.', 404));

  let updated;
  try {
    updated = await processRefund(payment, amount, reason || 'Requested by clinic');
  } catch (err) {
    return next(err);
  }

  success(res, 200, 'Refund processed.', updated);
});

// @route GET /api/payments/me
exports.getMyPayments = catchAsync(async (req, res) => {
  const payments = await Payment.find({ patient: req.user._id }).sort('-createdAt');
  success(res, 200, 'Payments fetched.', payments);
});