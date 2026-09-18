const Coupon = require('../models/Coupon');
const CouponUsage = require('../models/CouponUsage');
const AppError = require('../utils/appError');

/**
 * Validates a coupon code against ALL rules - active, not expired, minimum order amount,
 * global usage limit, AND per-user usage limit - and returns the computed discount.
 * Does NOT record usage (safe to call repeatedly for preview/validation).
 */
const checkCoupon = async (code, userId, orderAmount) => {
  const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
  if (!coupon) throw new AppError('Invalid coupon code.', 404);
  if (coupon.validUntil < new Date()) throw new AppError('Coupon has expired.', 400);
  if (orderAmount < coupon.minOrderAmount) {
    throw new AppError(`Minimum order amount for this coupon is ₹${coupon.minOrderAmount}.`, 400);
  }
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    throw new AppError('This coupon has reached its overall usage limit.', 400);
  }

  if (userId) {
    const usage = await CouponUsage.findOne({ coupon: coupon._id, user: userId });
    if (usage && usage.count >= coupon.usageLimitPerUser) {
      throw new AppError('You have already used this coupon the maximum number of times.', 400);
    }
  }

  const discount =
    coupon.discountType === 'flat'
      ? coupon.discountValue
      : Math.min((orderAmount * coupon.discountValue) / 100, coupon.maxDiscountAmount || Infinity);

  return { coupon, discount: Math.min(discount, orderAmount) };
};

/**
 * Actually applies the coupon - increments both the global counter on Coupon
 * and this user's personal usage count. Call this only when the order/invoice
 * is actually being created, never during a preview/validate call.
 */
const recordCouponUsage = async (couponId, userId) => {
  await Coupon.findByIdAndUpdate(couponId, { $inc: { usedCount: 1 } });
  await CouponUsage.findOneAndUpdate(
    { coupon: couponId, user: userId },
    { $inc: { count: 1 } },
    { upsert: true }
  );
};

module.exports = { checkCoupon, recordCouponUsage };