const Patient = require('../models/Patient');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');
const { deleteCloudinaryFile } = require('../utils/cloudinaryCleanup');

// @route GET /api/patients/me
exports.getMyProfile = catchAsync(async (req, res, next) => {
  const patient = await Patient.findOne({ user: req.user._id }).populate('user', '-password');
  if (!patient) return next(new AppError('Patient profile not found.', 404));
  success(res, 200, 'Profile fetched.', patient);
});

// @route PATCH /api/patients/me
exports.updateMyProfile = catchAsync(async (req, res) => {
  const allowed = ['dateOfBirth', 'gender', 'bloodGroup', 'address', 'emergencyContact', 'allergies', 'chronicConditions'];
  const updates = {};
  allowed.forEach((f) => {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  });

  const patient = await Patient.findOneAndUpdate({ user: req.user._id }, updates, {
    new: true,
    runValidators: true,
    upsert: true,
  });
  success(res, 200, 'Profile updated.', patient);
});

// @route PATCH /api/patients/me/basic-info (name / profile photo, on the User doc)
exports.updateBasicInfo = catchAsync(async (req, res) => {
  const allowed = ['name'];
  const updates = {};
  allowed.forEach((f) => {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  });

  let oldPhotoPublicId = null;
  if (req.file) {
    oldPhotoPublicId = req.user.profilePhoto?.publicId || null;
    updates.profilePhoto = { url: req.file.path, publicId: req.file.filename };
  }

  const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select('-password');
  if (oldPhotoPublicId) await deleteCloudinaryFile(oldPhotoPublicId);
  success(res, 200, 'Basic info updated.', user);
});

// @route POST /api/patients/me/family-members
exports.addFamilyMember = catchAsync(async (req, res) => {
  const { name, relation, dateOfBirth, gender } = req.body;
  const patient = await Patient.findOneAndUpdate(
    { user: req.user._id },
    { $push: { familyMembers: { name, relation, dateOfBirth, gender } } },
    { new: true, upsert: true }
  );
  success(res, 201, 'Family member added.', patient);
});

// @route DELETE /api/patients/me/family-members/:memberId
exports.removeFamilyMember = catchAsync(async (req, res) => {
  const patient = await Patient.findOneAndUpdate(
    { user: req.user._id },
    { $pull: { familyMembers: { _id: req.params.memberId } } },
    { new: true }
  );
  success(res, 200, 'Family member removed.', patient);
});

// @route GET /api/patients (admin/receptionist - list all patients)
exports.getAllPatients = catchAsync(async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;
  const userFilter = { role: 'patient' };
  if (search) {
    userFilter.$or = [{ name: new RegExp(search, 'i') }, { phone: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }];
  }
  const skip = (Number(page) - 1) * Number(limit);
  const [users, total] = await Promise.all([
    User.find(userFilter).select('-password').skip(skip).limit(Number(limit)).sort('-createdAt'),
    User.countDocuments(userFilter),
  ]);
  success(res, 200, 'Patients fetched.', users, { total, page: Number(page), limit: Number(limit) });
});

// @route GET /api/patients/:id (admin/receptionist/dentist - view a specific patient)
exports.getPatientById = catchAsync(async (req, res, next) => {
  const patient = await Patient.findOne({ user: req.params.id }).populate('user', '-password');
  if (!patient) return next(new AppError('Patient not found.', 404));
  success(res, 200, 'Patient fetched.', patient);
});