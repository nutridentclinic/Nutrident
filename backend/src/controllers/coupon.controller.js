const Coupon = require('../models/Coupon');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');
const { checkCoupon } = require('../services/coupon.service');

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
// Note: this only PREVIEWS the discount - it does not consume usage. Usage is
// only recorded when the coupon is actually applied via invoice creation.
exports.validateCoupon = catchAsync(async (req, res, next) => {
  const { code, orderAmount } = req.body;

  let result;
  try {
    result = await checkCoupon(code, req.user._id, orderAmount);
  } catch (err) {
    return next(err);
  }

  success(res, 200, 'Coupon is valid.', {
    discount: result.discount,
    finalAmount: Math.max(orderAmount - result.discount, 0),
  });
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