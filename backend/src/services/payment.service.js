const razorpay = require('../config/razorpay');
const Appointment = require('../models/Appointment');
const AppError = require('../utils/appError');
const { notify } = require('./notification.service');

const processRefund = async (payment, amount, reason) => {
  if (!['paid', 'partially_refunded'].includes(payment.status)) {
    throw new AppError('Only paid payments can be refunded.', 400);
  }

  const alreadyRefunded = Number(payment.refund?.amount || 0);
  const remaining = Math.max(0, Number(payment.amount) - alreadyRefunded);
  const requestedAmount = amount == null ? remaining : Number(amount);
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0 || requestedAmount > remaining) {
    throw new AppError('Refund amount must be greater than zero and no more than the remaining balance.', 400);
  }
  const refundAmountPaise = Math.round(requestedAmount * 100);

  const refund = await razorpay.payments.refund(payment.razorpayPaymentId, {
    amount: refundAmountPaise,
    notes: { reason: reason || 'Refund' },
  });

  const totalRefunded = alreadyRefunded + requestedAmount;
  payment.status = totalRefunded >= payment.amount ? 'refunded' : 'partially_refunded';
  payment.refund = {
    amount: totalRefunded,
    razorpayRefundId: refund.id,
    reason: reason || '',
    refundedAt: new Date(),
  };
  await payment.save();

  if (payment.appointment) {
    if (payment.status === 'refunded') {
      await Appointment.findByIdAndUpdate(payment.appointment, { paymentStatus: 'refunded' });
    }
  }

  await notify({
    userId: payment.patient,
    title: 'Payment Refunded',
    message: `₹${requestedAmount} has been refunded to your original payment method.`,
    type: 'payment_refund',
    relatedId: payment._id,
  });

  return payment;
};

module.exports = { processRefund };