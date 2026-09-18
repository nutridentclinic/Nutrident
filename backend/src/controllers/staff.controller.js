const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');

// @route POST /api/staff  (admin only) - onboard a receptionist or another admin
// Dentists have their own richer onboarding flow (see dentist.controller.js) since they
// need a Dentist profile too. Receptionist/admin just need a User account with a role.
exports.createStaff = catchAsync(async (req, res, next) => {
  const { name, email, phone, password, role } = req.body;

  if (!['receptionist', 'admin'].includes(role)) {
    return next(new AppError("role must be 'receptionist' or 'admin'.", 400));
  }

  const existing = await User.findOne({ $or: [{ email }, { phone }] });
  if (existing) return next(new AppError('A user with this email or phone already exists.', 409));

  const user = await User.create({ name, email, phone, password, role, isEmailVerified: true });

  success(res, 201, `${role === 'admin' ? 'Admin' : 'Receptionist'} account created.`, user);
});

// @route GET /api/staff  (admin only) - list receptionists and admins
exports.getAllStaff = catchAsync(async (req, res) => {
  const { role, search, page = 1, limit = 20 } = req.query;

  const filter = { role: { $in: ['receptionist', 'admin'] } };
  if (role && ['receptionist', 'admin'].includes(role)) filter.role = role;
  if (search) {
    filter.$or = [
      { name: new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
      { phone: new RegExp(search, 'i') },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [staff, total] = await Promise.all([
    User.find(filter).select('-password').skip(skip).limit(Number(limit)).sort('-createdAt'),
    User.countDocuments(filter),
  ]);

  success(res, 200, 'Staff fetched.', staff, { total, page: Number(page), limit: Number(limit) });
});

// @route PATCH /api/staff/:id/deactivate  (admin only) - revoke access without deleting the account
exports.deactivateStaff = catchAsync(async (req, res, next) => {
  if (req.params.id === String(req.user._id)) {
    return next(new AppError('You cannot deactivate your own account.', 400));
  }
  const user = await User.findByIdAndUpdate(req.params.id, { active: false }, { new: true }).select('+active');
  if (!user) return next(new AppError('Staff member not found.', 404));
  success(res, 200, 'Staff account deactivated.', user);
});

// @route PATCH /api/staff/:id/activate  (admin only)
exports.activateStaff = catchAsync(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(req.params.id, { active: true }, { new: true }).select('+active');
  if (!user) return next(new AppError('Staff member not found.', 404));
  success(res, 200, 'Staff account activated.', user);
});