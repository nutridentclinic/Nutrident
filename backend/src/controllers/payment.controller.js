const crypto = require('crypto');
const razorpay = require('../config/razorpay');
const Payment = require('../models/Payment');
const Appointment = require('../models/Appointment');
const Invoice = require('../models/Invoice');
const Dentist = require('../models/Dentist');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');
const { notify } = require('../services/notification.service');
const logger = require('../utils/logger');
const { processRefund } = require('../services/payment.service');
const safeCompareHex = require('../utils/safeCompareHex');

// @route POST /api/payments/create-order
// Body: { appointmentId }  -> creates a Razorpay order for that appointment's total amount
exports.createOrder = catchAsync(async (req, res, next) => {
  const { appointmentId } = req.body;

  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return next(new AppError('Online payments are not configured on the server yet.', 503));
  }

  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) return next(new AppError('Appointment not found.', 404));
  if (!appointment.patient.equals(req.user._id)) {
    return next(new AppError('You can only pay for your own appointments.', 403));
  }
  if (appointment.status !== 'pending' || !['pending', 'failed'].includes(appointment.paymentStatus)) {
    return next(new AppError('Only unpaid pending appointments can be paid.', 400));
  }

  const amountInPaise = Math.round(appointment.fees.totalAmount * 100);
  const existingPayment = await Payment.findOne({
    appointment: appointment._id,
    patient: req.user._id,
    status: { $in: ['created', 'pending'] },
  }).sort('-createdAt');
  if (existingPayment) {
    return success(res, 200, 'Existing payment order reused.', {
      orderId: existingPayment.razorpayOrderId,
      amount: amountInPaise,
      currency: existingPayment.currency || 'INR',
      keyId: process.env.RAZORPAY_KEY_ID,
      paymentId: existingPayment._id,
    });
  }

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
  if (!process.env.RAZORPAY_KEY_SECRET) {
    return next(new AppError('Online payments are not configured on the server yet.', 503));
  }
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return next(new AppError('Payment verification details are required.', 400));
  }

  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (!safeCompareHex(expectedSignature, razorpay_signature)) {
    return next(new AppError('Payment verification failed.', 400));
  }

  const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
  if (!payment) return next(new AppError('Payment record not found.', 404));
  if (!payment.patient.equals(req.user._id)) return next(new AppError('You can only verify your own payment.', 403));

  let providerPayment;
  try {
    providerPayment = await razorpay.payments.fetch(razorpay_payment_id);
  } catch (error) {
    logger.error(`Razorpay payment lookup failed: ${error.message}`);
    return next(new AppError('Payment could not be verified with Razorpay. Please try again.', 503));
  }
  const expectedAmount = Math.round(payment.amount * 100);
  if (
    providerPayment.order_id !== razorpay_order_id ||
    Number(providerPayment.amount) !== expectedAmount ||
    providerPayment.currency !== (payment.currency || 'INR') ||
    providerPayment.status !== 'captured'
  ) {
    return next(new AppError('Razorpay payment details do not match this order.', 400));
  }

  let appointment = null;
  if (payment.appointment) {
    appointment = await Appointment.findById(payment.appointment);
    if (!appointment) return next(new AppError('Appointment not found for this payment.', 404));
    if (['cancelled', 'rescheduled'].includes(appointment.status)) {
      const capturedPayment = await Payment.findOneAndUpdate(
        { _id: payment._id, status: { $in: ['created', 'pending', 'failed'] } },
        { status: 'paid', razorpayPaymentId: razorpay_payment_id, razorpaySignature: razorpay_signature },
        { new: true }
      );
      if (capturedPayment) {
        try { await processRefund(capturedPayment, null, 'Auto-refund: appointment is no longer active') }
        catch (error) { logger.error(`Auto-refund failed for payment ${payment._id}: ${error.message}`) }
      }
      return next(new AppError('This appointment is no longer active. Any captured payment will be refunded.', 409));
    }
    if (!['pending', 'confirmed'].includes(appointment.status)) {
      return next(new AppError('This appointment cannot accept payment.', 409));
    }
  }

  let updatedPayment = payment;
  if (payment.status !== 'paid' || payment.razorpayPaymentId !== razorpay_payment_id) {
    updatedPayment = await Payment.findOneAndUpdate(
      { _id: payment._id, status: { $in: ['created', 'pending', 'failed'] } },
      { razorpayPaymentId: razorpay_payment_id, razorpaySignature: razorpay_signature, status: 'paid', method: providerPayment.method || '' },
      { new: true }
    );
    if (!updatedPayment) {
      const currentPayment = await Payment.findById(payment._id);
      if (currentPayment?.status !== 'paid' || currentPayment.razorpayPaymentId !== razorpay_payment_id) {
        return next(new AppError('Payment state changed while verification was in progress.', 409));
      }
      updatedPayment = currentPayment;
    }
  }

  if (appointment && appointment.paymentStatus !== 'paid') {
    appointment.paymentStatus = 'paid';
    if (appointment.status === 'pending') appointment.status = 'confirmed';
    await appointment.save();
  }
  if (payment.invoice) {
    await Invoice.findByIdAndUpdate(payment.invoice, { status: 'paid', payment: payment._id });
  }

  await notify({
    userId: updatedPayment.patient,
    title: 'Payment Successful',
    message: `Your payment of ₹${updatedPayment.amount} was successful.`,
    type: 'payment_successful',
    relatedId: updatedPayment._id,
  });

  if (appointment) {
    await notify({
      userId: appointment.patient,
      title: 'Appointment Confirmed',
      message: `Your appointment on ${appointment.date.toDateString()} at ${appointment.startTime} is confirmed.`,
      type: 'appointment_confirmed',
      relatedId: appointment._id,
    });

    if (appointment.dentist) {
      const dentistDoc = await Dentist.findById(appointment.dentist);
      if (dentistDoc?.user) {
        await notify({
          userId: dentistDoc.user,
          title: 'Payment Received',
          message: `Payment of ₹${updatedPayment.amount} received for appointment on ${appointment.date.toDateString()} at ${appointment.startTime}.`,
          type: 'payment_received',
          relatedId: updatedPayment._id,
        });
      }
    }
  }

  success(res, 200, 'Payment verified successfully.', { payment: updatedPayment, appointment });
});

// @route POST /api/payments/webhook
// Razorpay server-to-server webhook - the source of truth (works even if client closes browser mid-payment).
// Must be mounted with express.raw() BEFORE express.json() for this route - see app.js.
exports.razorpayWebhook = catchAsync(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    return res.status(503).json({ success: false, message: 'Payment webhooks are not configured.' });
  }
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(req.body) // raw buffer
    .digest('hex');

  if (!safeCompareHex(expectedSignature, signature)) {
    logger.warn('Razorpay webhook signature mismatch.');
    return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch (err) {
    logger.warn(`Razorpay webhook invalid JSON: ${err.message}`);
    return res.status(400).json({ success: false, message: 'Invalid JSON payload' });
  }

  if (event.event === 'payment.captured') {
    const orderId = event.payload.payment.entity.order_id;
    const paymentId = event.payload.payment.entity.id;

    const payment = await Payment.findOneAndUpdate(
      { razorpayOrderId: orderId, status: { $in: ['created', 'pending', 'failed'] } },
      { status: 'paid', razorpayPaymentId: paymentId, method: event.payload.payment.entity.method },
      { new: true }
    );

    if (payment && payment.appointment) {
      const appointment = await Appointment.findById(payment.appointment);
      if (appointment && ['cancelled', 'rescheduled'].includes(appointment.status)) {
        try { await processRefund(payment, null, 'Auto-refund: appointment is no longer active') }
        catch (err) { logger.error(`Auto-refund failed for payment ${payment._id}: ${err.message}`) }
      } else if (appointment && ['pending', 'confirmed'].includes(appointment.status)) {
        appointment.paymentStatus = 'paid';
        if (appointment.status === 'pending') appointment.status = 'confirmed';
        await appointment.save();
      }
    }
  }

  if (event.event === 'payment.failed') {
    const orderId = event.payload.payment.entity.order_id;
    await Payment.findOneAndUpdate(
      { razorpayOrderId: orderId, status: { $in: ['created', 'pending', 'failed'] } },
      { status: 'failed', failureReason: event.payload.payment.entity.error_description || 'Payment failed' }
    );
  }

  if (event.event === 'refund.processed') {
    const refund = event.payload.refund.entity;
    const payment = await Payment.findOne({ razorpayPaymentId: refund.payment_id });
    if (payment && payment.refund?.razorpayRefundId !== refund.id) {
      const totalRefunded = Number(payment.refund?.amount || 0) + Number(refund.amount || 0) / 100;
      payment.refund = { ...payment.refund.toObject?.(), amount: totalRefunded, razorpayRefundId: refund.id, refundedAt: new Date() };
      payment.status = totalRefunded >= payment.amount ? 'refunded' : 'partially_refunded';
      await payment.save();
      if (payment.status === 'refunded' && payment.appointment) {
        await Appointment.findByIdAndUpdate(payment.appointment, { paymentStatus: 'refunded' });
      }
    }
  }

  res.status(200).json({ received: true });
});

// @route POST /api/payments/:id/refund  (admin/dentist initiates refund, e.g. on cancellation)
exports.refundPayment = catchAsync(async (req, res, next) => {
  const { amount, reason } = req.body;
  const payment = await Payment.findById(req.params.id);
  if (!payment) return next(new AppError('Payment not found.', 404));

  if (req.user.role === 'dentist') {
    const dentist = await Dentist.findOne({ user: req.user._id });
    const appointment = payment.appointment ? await Appointment.findById(payment.appointment) : null;
    if (!dentist || !appointment || !appointment.dentist.equals(dentist._id)) {
      return next(new AppError('You can only refund payments for your own appointments.', 403));
    }
  }
  if (!['paid', 'partially_refunded'].includes(payment.status)) {
    return next(new AppError('Only paid payments can be refunded.', 400));
  }
  const remaining = Math.max(0, payment.amount - Number(payment.refund?.amount || 0));
  if (amount != null && (!Number.isFinite(Number(amount)) || Number(amount) <= 0 || Number(amount) > remaining)) {
    return next(new AppError('Refund amount must be greater than zero and no more than the remaining balance.', 400));
  }

  let updated;
  try {
    updated = await processRefund(payment, amount, reason || 'Requested by clinic');
  } catch (err) {
    try {
      const staffUsers = await User.find({ role: { $in: ['admin', 'receptionist'] } }).select('_id');
      for (const staff of staffUsers) {
        await notify({
          userId: staff._id,
          title: 'Refund Processing Failed',
          message: `Refund of ₹${amount || payment.amount} for payment ${payment._id} failed: ${err.message}`,
          type: 'payment_failed',
          relatedId: payment._id,
        });
      }
    } catch (notifyErr) {
      logger.error(`Failed to notify staff about refund failure: ${notifyErr.message}`);
    }
    return next(err);
  }

  success(res, 200, 'Refund processed.', updated);
});

// @route GET /api/payments/me
exports.getMyPayments = catchAsync(async (req, res) => {
  const payments = await Payment.find({ patient: req.user._id }).sort('-createdAt');
  success(res, 200, 'Payments fetched.', payments);
});

// @route GET /api/payments (E5 - admin payments list with filters, pagination, and population)
exports.getAllPayments = catchAsync(async (req, res) => {
  const { status, patientId, from, to, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (patientId) filter.patient = patientId;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setDate(end.getDate() + 1);
      filter.createdAt.$lt = end;
    }
  }

  const currentPage = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(limit) || 20));

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .populate('patient', 'name email phone')
      .populate('appointment', 'date startTime endTime mode status')
      .sort('-createdAt')
      .skip((currentPage - 1) * pageSize)
      .limit(pageSize),
    Payment.countDocuments(filter),
  ]);

  success(res, 200, 'Payments fetched.', payments, { total, page: currentPage, limit: pageSize });
});