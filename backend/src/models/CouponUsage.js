const mongoose = require('mongoose');

// Tracks how many times each user has used each coupon, so usageLimitPerUser can be enforced
// (the Coupon model's usedCount is a global counter only - this is the per-user breakdown).
const couponUsageSchema = new mongoose.Schema(
  {
    coupon: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    count: { type: Number, default: 1 },
  },
  { timestamps: true }
);

couponUsageSchema.index({ coupon: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('CouponUsage', couponUsageSchema);