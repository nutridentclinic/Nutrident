const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },

    amount: { type: Number, required: true }, // in INR (rupees, not paise)
    currency: { type: String, default: 'INR' },

    razorpayOrderId: { type: String, required: true },
    razorpayPaymentId: { type: String, default: null },
    razorpaySignature: { type: String, default: null },

    status: {
      type: String,
      enum: ['created', 'pending', 'paid', 'failed', 'refunded', 'partially_refunded'],
      default: 'created',
    },
    method: { type: String, default: '' }, // card, upi, netbanking, wallet
    failureReason: { type: String, default: '' },

    refund: {
      amount: { type: Number, default: 0 },
      razorpayRefundId: { type: String, default: null },
      reason: { type: String, default: '' },
      refundedAt: Date,
    },
  },
  { timestamps: true }
);

paymentSchema.index({ razorpayOrderId: 1 });
paymentSchema.index({ patient: 1, createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);