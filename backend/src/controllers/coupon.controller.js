const Coupon = require('../models/Coupon');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');

// @route POST /api/coupons  (admin)
exports.createCoupon = catchAsync(async (req, res) => {
  const coupon = await Coupon.create(req.body);
  success(res, 201, 'Coupon created.', coupon);
});

// @route GET /api/coupons  (admin - list all)
exports.getAllCoupons = catchAsync(async (req, res) => {
  const coupons = await Coupon.find().sort('-createdAt');
  success(res, 200, 'Coupons fetched.', coupons);
});

// @route POST /api/coupons/validate  (patient checks a code before checkout)
exports.validateCoupon = catchAsync(async (req, res, next) => {
  const { code, orderAmount } = req.body;
  const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
  if (!coupon) return next(new AppError('Invalid coupon code.', 404));
  if (coupon.validUntil < new Date()) return next(new AppError('Coupon has expired.', 400));
  if (orderAmount < coupon.minOrderAmount) {
    return next(new AppError(`Minimum order amount for this coupon is ₹${coupon.minOrderAmount}.`, 400));
  }
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    return next(new AppError('This coupon has reached its usage limit.', 400));
  }

  const discount =
    coupon.discountType === 'flat'
      ? coupon.discountValue
      : Math.min((orderAmount * coupon.discountValue) / 100, coupon.maxDiscountAmount || Infinity);

  success(res, 200, 'Coupon is valid.', { discount, finalAmount: Math.max(orderAmount - discount, 0) });
});

// @route PATCH /api/coupons/:id  (admin)
exports.updateCoupon = catchAsync(async (req, res, next) => {
  const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!coupon) return next(new AppError('Coupon not found.', 404));
  success(res, 200, 'Coupon updated.', coupon);
});

// @route DELETE /api/coupons/:id  (admin)
exports.deleteCoupon = catchAsync(async (req, res, next) => {
  const coupon = await Coupon.findByIdAndDelete(req.params.id);
  if (!coupon) return next(new AppError('Coupon not found.', 404));
  success(res, 200, 'Coupon deleted.');
});