const mongoose = require('mongoose');

const slotHoldSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dentist: { type: mongoose.Schema.Types.ObjectId, ref: 'Dentist', required: true },
    clinic: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', default: null },
    date: { type: Date, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    mode: { type: String, enum: ['in-clinic'], default: 'in-clinic' },
    reasonForVisit: { type: String, trim: true, default: '' },
    familyMemberName: { type: String, default: null },
    fees: {
      consultationFee: { type: Number, required: true },
      platformFee: { type: Number, default: 0 },
      totalAmount: { type: Number, required: true },
    },
    razorpayOrderId: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ['active', 'released', 'converted'],
      default: 'active',
    },
  },
  { timestamps: true }
);

// TTL index: MongoDB automatically cleans up expired slot holds
slotHoldSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Database-level guard ensuring only one active hold exists per slot
slotHoldSchema.index(
  { dentist: 1, date: 1, startTime: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

slotHoldSchema.index({ razorpayOrderId: 1 });
slotHoldSchema.index({ patient: 1, status: 1 });

module.exports = mongoose.model('SlotHold', slotHoldSchema);

