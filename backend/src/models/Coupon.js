const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, default: '' },
    discountType: { type: String, enum: ['flat', 'percentage'], required: true },
    discountValue: { type: Number, required: true },
    maxDiscountAmount: { type: Number, default: null }, // cap for percentage discounts
    minOrderAmount: { type: Number, default: 0 },
    validFrom: { type: Date, default: Date.now },
    validUntil: { type: Date, required: true },
    usageLimit: { type: Number, default: null }, // total uses allowed, null = unlimited
    usageLimitPerUser: { type: Number, default: 1 },
    usedCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Coupon', couponSchema);