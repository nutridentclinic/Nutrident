const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');
const escapeRegex = require('../utils/escapeRegex');

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

  const safeUser = user.toObject();
  delete safeUser.password;
  success(res, 201, `${role === 'admin' ? 'Admin' : 'Receptionist'} account created.`, safeUser);
});

// @route GET /api/staff  (admin only) - list receptionists and admins
exports.getAllStaff = catchAsync(async (req, res) => {
  const { role, search, page = 1, limit = 20 } = req.query;

  const filter = { role: { $in: ['receptionist', 'admin'] } };
  if (role && ['receptionist', 'admin'].includes(role)) filter.role = role;
  if (search) {
    filter.$or = [
      { name: new RegExp(escapeRegex(search), 'i') },
      { email: new RegExp(escapeRegex(search), 'i') },
      { phone: new RegExp(escapeRegex(search), 'i') },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [staff, total] = await Promise.all([
    User.find(filter).select('-password +active').skip(skip).limit(Number(limit)).sort('-createdAt'),
    User.countDocuments(filter),
  ]);

  success(res, 200, 'Staff fetched.', staff, { total, page: Number(page), limit: Number(limit) });
});

// @route PATCH /api/staff/:id/deactivate  (admin only) - revoke access without deleting the account
exports.deactivateStaff = catchAsync(async (req, res, next) => {
  if (req.params.id === String(req.user._id)) {
    return next(new AppError('You cannot deactivate your own account.', 400));
  }
  const targetUser = await User.findById(req.params.id).select('+active +tokenVersion');
  if (!targetUser) return next(new AppError('Staff member not found.', 404));

  if (targetUser.role === 'admin') {
    const activeAdmins = await User.countDocuments({ role: 'admin', active: { $ne: false } });
    if (activeAdmins <= 1) {
      return next(new AppError('Cannot deactivate the last active administrator.', 400));
    }
  }

  if (targetUser.role === 'dentist') {
    const activeDentists = await User.countDocuments({ role: 'dentist', active: { $ne: false } });
    if (activeDentists <= 1) {
      return next(new AppError("Cannot deactivate the clinic's only dentist account.", 400));
    }
  }

  targetUser.active = false;
  targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
  await targetUser.save({ validateBeforeSave: false });

  success(res, 200, 'Staff account deactivated.', targetUser);
});

// @route PATCH /api/staff/:id/activate  (admin only)
exports.activateStaff = catchAsync(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(req.params.id, { active: true }, { new: true }).select('+active');
  if (!user) return next(new AppError('Staff member not found.', 404));
  success(res, 200, 'Staff account activated.', user);
});

// @route PATCH /api/staff/:id  (admin only)
exports.updateStaff = catchAsync(async (req, res, next) => {
  const { name, phone, role } = req.body;
  const staff = await User.findById(req.params.id);
  if (!staff) return next(new AppError('Staff member not found.', 404));

  if (role && !['receptionist', 'admin'].includes(role)) {
    return next(new AppError("role must be 'receptionist' or 'admin'.", 400));
  }

  if (role && role !== 'admin' && staff.role === 'admin') {
    const activeAdmins = await User.countDocuments({ role: 'admin', active: { $ne: false } });
    if (activeAdmins <= 1) {
      return next(new AppError('Cannot remove admin role from the last active administrator.', 400));
    }
  }

  if (phone && phone !== staff.phone) {
    const existing = await User.findOne({ phone, _id: { $ne: staff._id } });
    if (existing) return next(new AppError('Another user is already registered with this phone number.', 409));
    staff.phone = phone;
  }

  if (name) staff.name = name;
  if (role) staff.role = role;

  await staff.save();
  const safe = staff.toObject();
  delete safe.password;
  success(res, 200, 'Staff details updated.', safe);
});

// @route POST /api/staff/:id/reset-password  (admin only)
exports.resetStaffPassword = catchAsync(async (req, res, next) => {
  const { temporaryPassword } = req.body;
  if (!temporaryPassword || temporaryPassword.length < 6) {
    return next(new AppError('Temporary password must be at least 6 characters.', 400));
  }

  const staff = await User.findById(req.params.id).select('+password +tokenVersion');
  if (!staff) return next(new AppError('Staff member not found.', 404));

  staff.password = temporaryPassword;
  staff.mustChangePassword = true;
  staff.tokenVersion = (staff.tokenVersion || 0) + 1;
  staff.refreshSessions = [];
  await staff.save();

  success(res, 200, 'Staff password has been reset. They will be required to change it upon login.');
});