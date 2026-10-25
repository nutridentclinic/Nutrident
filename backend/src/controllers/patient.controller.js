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

const Appointment = require('../models/Appointment');
const Invoice = require('../models/Invoice');
const { todayInClinic, parseDateOnly } = require('../utils/clinicDate');

// @route GET /api/patients (admin/receptionist - list all patients with metrics)
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
  const currentPage = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (currentPage - 1) * pageSize;

  const [users, total] = await Promise.all([
    User.find(userFilter).select('-password').skip(skip).limit(pageSize).sort('-createdAt'),
    User.countDocuments(userFilter),
  ]);

  const todayMidnight = parseDateOnly(todayInClinic());

  const enhancedUsers = await Promise.all(
    users.map(async (u) => {
      const [lastVisitAppt, nextAppt, unpaidInvoices] = await Promise.all([
        Appointment.findOne({ patient: u._id, status: 'completed' }).sort('-date -startTime').select('date startTime'),
        Appointment.findOne({
          patient: u._id,
          date: { $gte: todayMidnight },
          status: { $in: ['confirmed', 'pending'] },
        }).sort('date startTime').select('date startTime mode status'),
        Invoice.find({ patient: u._id, status: 'unpaid' }).select('totalAmount'),
      ]);

      const outstandingBalance = unpaidInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
      const userObj = u.toObject();
      return {
        ...userObj,
        lastVisit: lastVisitAppt ? lastVisitAppt.date : null,
        nextAppointment: nextAppt ? nextAppt.date : null,
        outstandingBalance,
      };
    })
  );

  success(res, 200, 'Patients fetched.', enhancedUsers, { total, page: currentPage, limit: pageSize });
});

// @route GET /api/patients/:id (admin/receptionist/dentist - view a specific patient profile)
exports.getPatientById = catchAsync(async (req, res, next) => {
  const patient = await Patient.findOne({ user: req.params.id }).populate('user', '-password');
  if (!patient) return next(new AppError('Patient not found.', 404));
  success(res, 200, 'Patient fetched.', patient);
});

// @route GET /api/patients/:id/summary (Patient 360 header and profile overview)
exports.getPatientSummary = catchAsync(async (req, res, next) => {
  const patientUser = await User.findOne({ _id: req.params.id, role: 'patient' }).select('-password');
  if (!patientUser) return next(new AppError('Patient not found.', 404));

  const patientProfile = await Patient.findOne({ user: patientUser._id });

  const todayMidnight = parseDateOnly(todayInClinic());

  const [lastVisitAppt, nextAppt, unpaidInvoices] = await Promise.all([
    Appointment.findOne({ patient: patientUser._id, status: 'completed' }).sort('-date -startTime'),
    Appointment.findOne({
      patient: patientUser._id,
      date: { $gte: todayMidnight },
      status: { $in: ['confirmed', 'pending'] },
    }).sort('date startTime'),
    Invoice.find({ patient: patientUser._id, status: 'unpaid' }).select('totalAmount'),
  ]);

  const outstandingBalance = unpaidInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);

  success(res, 200, 'Patient summary fetched.', {
    user: patientUser,
    patient: patientProfile,
    stats: {
      lastVisit: lastVisitAppt ? { date: lastVisitAppt.date, startTime: lastVisitAppt.startTime } : null,
      nextAppointment: nextAppt
        ? { date: nextAppt.date, startTime: nextAppt.startTime, mode: nextAppt.mode, status: nextAppt.status, _id: nextAppt._id }
        : null,
      outstandingBalance,
    },
  });
});

// @route GET /api/patients/:id/appointments (paginated appointment history for patient)
exports.getPatientAppointments = catchAsync(async (req, res, next) => {
  const patientUser = await User.findOne({ _id: req.params.id, role: 'patient' }).select('_id');
  if (!patientUser) return next(new AppError('Patient not found.', 404));

  const { page = 1, limit = 20, status } = req.query;
  const filter = { patient: patientUser._id };
  if (status) filter.status = status;

  const currentPage = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (currentPage - 1) * pageSize;

  const [appointments, total] = await Promise.all([
    Appointment.find(filter)
      .populate('dentist', 'specialization clinicAddress fees')
      .populate('payment', 'status amount method')
      .sort('-date -startTime')
      .skip(skip)
      .limit(pageSize),
    Appointment.countDocuments(filter),
  ]);

  success(res, 200, 'Patient appointments fetched.', appointments, {
    total,
    page: currentPage,
    limit: pageSize,
    pages: Math.ceil(total / pageSize),
  });
});

// @route POST /api/patients (disabled per S1: registration must be done at /register)
exports.createPatientByStaff = catchAsync(async (req, res, next) => {
  return next(new AppError('Staff patient registration is disabled. Patients must register at /register.', 400));
});