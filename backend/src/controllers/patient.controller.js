const crypto = require('crypto');
const Patient = require('../models/Patient');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');
const { deleteCloudinaryFile } = require('../utils/cloudinaryCleanup');
const escapeRegex = require('../utils/escapeRegex');

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
    userFilter.$or = [
      { name: new RegExp(escapeRegex(search), 'i') },
      { phone: new RegExp(escapeRegex(search), 'i') },
      { email: new RegExp(escapeRegex(search), 'i') },
    ];
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

// @route POST /api/patients (admin/receptionist registers a walk-in/phone patient)
exports.createPatientByStaff = catchAsync(async (req, res, next) => {
  const { name, phone, email, gender, dateOfBirth, address } = req.body;
  if (!name || !phone) {
    return next(new AppError('Name and phone are required.', 400));
  }

  const cleanPhone = String(phone).trim();
  const existingUser = await User.findOne({
    $or: [
      { phone: cleanPhone },
      ...(email ? [{ email: email.toLowerCase().trim() }] : []),
    ],
  });
  if (existingUser) {
    return next(new AppError('A patient with this phone or email already exists.', 409));
  }

  const patientEmail = email ? email.toLowerCase().trim() : `${cleanPhone.replace(/\D/g, '')}@walkin.drnutrident.com`;
  const tempPassword = crypto.randomBytes(8).toString('hex') + 'A1!';

  const user = await User.create({
    name: name.trim(),
    phone: cleanPhone,
    email: patientEmail,
    password: tempPassword,
    role: 'patient',
    isEmailVerified: true,
    isPhoneVerified: true,
  });

  const patient = await Patient.create({
    user: user._id,
    gender: gender || 'other',
    dateOfBirth: dateOfBirth || null,
    address: address || '',
  });

  const safeUser = user.toObject();
  delete safeUser.password;

  success(res, 201, 'Patient registered successfully.', { user: safeUser, patient });
});