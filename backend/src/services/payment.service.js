const razorpay = require('../config/razorpay');
const Appointment = require('../models/Appointment');
const AppError = require('../utils/appError');
const { notify } = require('./notification.service');

const processRefund = async (payment, amount, reason) => {
  if (payment.status !== 'paid') {
    throw new AppError('Only completed payments can be refunded.', 400);
  }

  const refundAmountPaise = amount ? Math.round(amount * 100) : undefined;

  const refund = await razorpay.payments.refund(payment.razorpayPaymentId, {
    amount: refundAmountPaise,
    notes: { reason: reason || 'Refund' },
  });

  payment.status = amount && amount < payment.amount ? 'partially_refunded' : 'refunded';
  payment.refund = {
    amount: amount || payment.amount,
    razorpayRefundId: refund.id,
    reason: reason || '',
    refundedAt: new Date(),
  };
  await payment.save();

  if (payment.appointment) {
    await Appointment.findByIdAndUpdate(payment.appointment, { paymentStatus: 'refunded' });
  }

  await notify({
    userId: payment.patient,
    title: 'Payment Refunded',
    message: `₹${amount || payment.amount} has been refunded to your original payment method.`,
    type: 'payment_refund',
    relatedId: payment._id,
  });

  return payment;
};

module.exports = { processRefund };