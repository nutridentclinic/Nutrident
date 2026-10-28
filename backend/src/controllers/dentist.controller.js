const User = require('../models/User');
const Dentist = require('../models/Dentist');
const Review = require('../models/Review');
const Appointment = require('../models/Appointment');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');
const { getAvailableSlots, getDentistAvailabilityRange } = require('../services/availability.service');
const { deleteCloudinaryFile } = require('../utils/cloudinaryCleanup');
const escapeRegex = require('../utils/escapeRegex');
const { getClinicDentist } = require('../utils/clinicDentist');

function computeBookableChecklist(dentist) {
  const reasons = [];
  const checks = {
    verified: Boolean(dentist.isVerified),
    accepting: Boolean(dentist.isActive && (!dentist.pausedUntil || new Date(dentist.pausedUntil) <= new Date())),
    weeklyHoursSet: Boolean(dentist.weeklyAvailability && dentist.weeklyAvailability.some((d) => d.slots && d.slots.length > 0)),
    slotLengthSet: Boolean(dentist.slotDurationMinutes && dentist.slotDurationMinutes > 0),
    feeSet: Boolean(dentist.consultationFee && dentist.consultationFee > 0),
  };

  if (!checks.verified) reasons.push('Credentials not verified');
  if (!checks.accepting) reasons.push(dentist.pausedReason ? `Appointments paused: ${dentist.pausedReason}` : 'Not accepting new appointments');
  if (!checks.weeklyHoursSet) reasons.push('Weekly hours not set');
  if (!checks.slotLengthSet) reasons.push('Slot duration not set');
  if (!checks.feeSet) reasons.push('Consultation fee not set');

  return {
    bookable: reasons.length === 0,
    isBookable: reasons.length === 0,
    checks,
    reasons,
  };
}

exports.computeBookableChecklist = computeBookableChecklist;

// @route POST /api/dentists  (admin only) - onboard a new dentist
exports.createDentist = catchAsync(async (req, res, next) => {
  if (process.env.SINGLE_DENTIST_MODE !== 'false') {
    const count = await Dentist.countDocuments();
    if (count > 0) {
      return next(new AppError('This clinic already has its dentist. Edit the existing profile.', 409));
    }
  }

  const { name, email, phone, password, specialization, qualifications, experienceYears, consultationFee, about, languages, clinicAddress, slotDurationMinutes } = req.body;

  const existing = await User.findOne({ $or: [{ email }, { phone }] });
  if (existing) return next(new AppError('A user with this email or phone already exists.', 409));

  const user = await User.create({ name, email, phone, password, role: 'dentist', isEmailVerified: true, active: true });
  const dentist = await Dentist.create({
    user: user._id,
    specialization,
    qualifications,
    experienceYears,
    consultationFee,
    about,
    languages,
    clinicAddress,
    isVerified: true,
    isActive: true,
    pausedUntil: null,
    pausedReason: '',
    slotDurationMinutes: slotDurationMinutes || 30,
  });

  const safeUser = user.toObject();
  delete safeUser.password;
  success(res, 201, 'Dentist onboarded successfully.', { user: safeUser, dentist });
});

// @route GET /api/dentists  - search/filter/discover dentists
exports.getDentists = catchAsync(async (req, res) => {
  const { specialization, city, minRating, maxFee, search, sort = '-ratingAverage', page = 1, limit = 10 } = req.query;

  const filter = { isActive: true, isVerified: true };
  if (specialization) filter.specialization = new RegExp(escapeRegex(specialization), 'i');
  if (city) filter['clinicAddress.city'] = new RegExp(escapeRegex(city), 'i');
  if (minRating) filter.ratingAverage = { $gte: Number(minRating) };
  if (maxFee) filter.consultationFee = { ...(filter.consultationFee || {}), $lte: Number(maxFee) };

  let query = Dentist.find(filter).populate('user', 'name profilePhoto phone email');

  if (search) {
    const users = await User.find({ name: new RegExp(escapeRegex(search), 'i'), role: 'dentist' }).select('_id');
    query = Dentist.find({ ...filter, user: { $in: users.map((u) => u._id) } }).populate(
      'user',
      'name profilePhoto phone email'
    );
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [dentists, total] = await Promise.all([
    query.sort(sort).skip(skip).limit(Number(limit)),
    Dentist.countDocuments(filter),
  ]);

  success(res, 200, 'Dentists fetched.', dentists, { total, page: Number(page), limit: Number(limit) });
});

// @route GET /api/dentists/nearby?lng=..&lat=..&radiusKm=5
exports.getNearbyDentists = catchAsync(async (req, res, next) => {
  const { lng, lat, radiusKm = 5 } = req.query;
  if (!lng || !lat) return next(new AppError('lng and lat query params are required.', 400));

  const dentists = await Dentist.find({
    isActive: true,
    isVerified: true,
    'clinicAddress.location': {
      $near: {
        $geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
        $maxDistance: Number(radiusKm) * 1000,
      },
    },
  }).populate('user', 'name profilePhoto');

  success(res, 200, 'Nearby dentists fetched.', dentists);
});

// @route GET /api/dentists/primary (public) - single-dentist profile and reviews
exports.getPrimaryDentist = catchAsync(async (req, res, next) => {
  const dentist = await getClinicDentist({ populateUser: true, populateSelect: 'name profilePhoto phone email active' });
  if (!dentist) {
    return next(new AppError('No dentist has been set up for this clinic yet.', 404));
  }

  const isPaused = !dentist.isActive || (dentist.pausedUntil && new Date(dentist.pausedUntil) > new Date());
  const acceptingAppointments = !isPaused;
  const checklist = computeBookableChecklist(dentist);

  const reviews = await Review.find({ dentist: dentist._id })
    .populate('patient', 'name profilePhoto')
    .sort('-createdAt')
    .limit(20);

  const dentistObj = dentist.toObject();
  dentistObj.acceptingAppointments = acceptingAppointments;
  dentistObj.isVerified = Boolean(dentist.isVerified);
  dentistObj.pausedReason = dentist.pausedReason || '';
  dentistObj.pausedUntil = dentist.pausedUntil || null;
  dentistObj.checklist = checklist;
  dentistObj.bookableChecklist = checklist;

  success(res, 200, 'Primary dentist fetched.', {
    ...dentistObj,
    dentist: dentistObj,
    reviews,
    bookableChecklist: checklist,
  });
});

// @route GET /api/dentists/primary/slots?date=YYYY-MM-DD
exports.getPrimarySlots = catchAsync(async (req, res, next) => {
  const { date } = req.query;
  if (!date) return next(new AppError('date query param is required (YYYY-MM-DD).', 400));

  const dentist = await getClinicDentist({ populateUser: false });
  if (!dentist) {
    return next(new AppError('No dentist has been set up for this clinic yet.', 404));
  }

  const slots = await getAvailableSlots(dentist._id, date);
  success(res, 200, 'Available slots fetched.', slots);
});

// @route GET /api/dentists/primary/availability?from=YYYY-MM-DD&to=YYYY-MM-DD
exports.getPrimaryAvailability = catchAsync(async (req, res, next) => {
  const dentist = await getClinicDentist({ populateUser: false });
  if (!dentist) {
    return next(new AppError('No dentist has been set up for this clinic yet.', 404));
  }
  const { from, to } = req.query;
  const range = await getDentistAvailabilityRange(dentist._id, from, to);
  success(res, 200, 'Availability range fetched.', range);
});

// @route GET /api/dentists/:id
exports.getDentistById = catchAsync(async (req, res, next) => {
  const dentist = await Dentist.findById(req.params.id).populate('user', 'name profilePhoto phone email active');
  if (!dentist) return next(new AppError('Dentist not found.', 404));

  const isPaused = !dentist.isActive || (dentist.pausedUntil && new Date(dentist.pausedUntil) > new Date());
  const acceptingAppointments = !isPaused;
  const checklist = computeBookableChecklist(dentist);

  const reviews = await Review.find({ dentist: dentist._id })
    .populate('patient', 'name profilePhoto')
    .sort('-createdAt')
    .limit(20);

  const dentistObj = dentist.toObject();
  dentistObj.acceptingAppointments = acceptingAppointments;
  dentistObj.isVerified = Boolean(dentist.isVerified);
  dentistObj.pausedReason = dentist.pausedReason || '';
  dentistObj.pausedUntil = dentist.pausedUntil || null;
  dentistObj.checklist = checklist;

  success(res, 200, 'Dentist details fetched.', { dentist: dentistObj, reviews });
});

// @route GET /api/dentists/:id/slots?date=YYYY-MM-DD
exports.getDentistSlots = catchAsync(async (req, res, next) => {
  const { date } = req.query;
  if (!date) return next(new AppError('date query param is required (YYYY-MM-DD).', 400));

  const slots = await getAvailableSlots(req.params.id, date);
  success(res, 200, 'Available slots fetched.', slots);
});

// @route GET /api/dentists/:id/availability?from=YYYY-MM-DD&to=YYYY-MM-DD
exports.getDentistAvailability = catchAsync(async (req, res, next) => {
  const { from, to } = req.query;
  const range = await getDentistAvailabilityRange(req.params.id, from, to);
  success(res, 200, 'Availability range fetched.', range);
});

// @route PATCH /api/dentists/me  (dentist updates own profile)
exports.updateMyProfile = catchAsync(async (req, res, next) => {
  if (req.body.weeklyAvailability !== undefined) {
    if (!Array.isArray(req.body.weeklyAvailability)) {
      return next(new AppError('weeklyAvailability must be an array.', 400));
    }
    for (const daySchedule of req.body.weeklyAvailability) {
      if (daySchedule.slots && Array.isArray(daySchedule.slots)) {
        const sorted = [...daySchedule.slots].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
        for (let i = 0; i < sorted.length; i++) {
          const slot = sorted[i];
          if (!slot.startTime || !slot.endTime || slot.startTime >= slot.endTime) {
            return next(new AppError(`Slot start time (${slot.startTime}) must be strictly before end time (${slot.endTime}).`, 400));
          }
          if (i > 0) {
            const prev = sorted[i - 1];
            if (slot.startTime < prev.endTime) {
              return next(new AppError(`Overlapping slots detected: ${prev.startTime}-${prev.endTime} and ${slot.startTime}-${slot.endTime}.`, 400));
            }
          }
        }
      }
    }
  }

  const allowedFields = [
    'about', 'languages', 'consultationFee', 'clinicAddress',
    'weeklyAvailability', 'slotDurationMinutes', 'qualifications', 'experienceYears',
  ];
  const updates = {};
  allowedFields.forEach((f) => {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  });

  const dentist = await Dentist.findOneAndUpdate({ user: req.user._id }, updates, {
    new: true,
    runValidators: true,
  });
  if (!dentist) return next(new AppError('Dentist profile not found.', 404));

  success(res, 200, 'Profile updated.', dentist);
});

// @route PATCH /api/dentists/me/toggle-active  (accept/pause new appointments)
exports.toggleActive = catchAsync(async (req, res) => {
  const dentist = await Dentist.findOne({ user: req.user._id });
  if (!dentist) throw new AppError('Dentist profile not found.', 404);

  const { reason, pausedUntil, resumeDate } = req.body || {};

  const isCurrentlyPaused = !dentist.isActive || (dentist.pausedUntil && new Date(dentist.pausedUntil) > new Date());

  if (!isCurrentlyPaused) {
    // Pause
    dentist.isActive = false;
    dentist.pausedReason = reason || '';
    dentist.pausedUntil = pausedUntil || resumeDate || null;
  } else {
    // Resume
    dentist.isActive = true;
    dentist.pausedReason = '';
    dentist.pausedUntil = null;
  }

  await dentist.save();
  success(res, 200, `You are now ${dentist.isActive ? 'accepting' : 'not accepting'} new appointments.`, dentist);
});

// @route PATCH /api/dentists/me/unavailable-dates
exports.setUnavailableDates = catchAsync(async (req, res) => {
  const { dates } = req.body; // array of ISO date strings
  const dentist = await Dentist.findOneAndUpdate(
    { user: req.user._id },
    { unavailableDates: dates },
    { new: true }
  );
  success(res, 200, 'Unavailable dates updated.', dentist);
});

// @route PATCH /api/dentists/:id/verify (admin only)
exports.verifyDentist = catchAsync(async (req, res, next) => {
  const dentist = await Dentist.findByIdAndUpdate(req.params.id, { isVerified: true }, { new: true });
  if (!dentist) return next(new AppError('Dentist not found.', 404));
  success(res, 200, 'Dentist verified.', dentist);
});

// @route PATCH /api/dentists/:id (admin updates dentist profile + user info)
exports.adminUpdateDentist = catchAsync(async (req, res, next) => {
  const dentist = await Dentist.findById(req.params.id);
  if (!dentist) return next(new AppError('Dentist not found.', 404));

  const {
    name, email, phone,
    specialization, qualifications, experienceYears, about, languages,
    consultationFee, clinicAddress, weeklyAvailability, slotDurationMinutes,
    unavailableDates, isActive, pausedReason, pausedUntil, isVerified,
  } = req.body;

  if (name || email || phone) {
    const userUpdates = {};
    if (name) userUpdates.name = name;
    if (email) {
      const emailClash = await User.findOne({ email, _id: { $ne: dentist.user } });
      if (emailClash) return next(new AppError('A user with this email already exists.', 409));
      userUpdates.email = email;
    }
    if (phone) {
      const phoneClash = await User.findOne({ phone, _id: { $ne: dentist.user } });
      if (phoneClash) return next(new AppError('A user with this phone already exists.', 409));
      userUpdates.phone = phone;
    }
    await User.findByIdAndUpdate(dentist.user, userUpdates);
  }

  const allowedFields = [
    'specialization', 'qualifications', 'experienceYears', 'about', 'languages',
    'consultationFee', 'clinicAddress', 'weeklyAvailability', 'slotDurationMinutes',
    'unavailableDates', 'isActive', 'pausedReason', 'pausedUntil', 'isVerified',
  ];

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) dentist[field] = req.body[field];
  });

  await dentist.save();
  const populated = await Dentist.findById(dentist._id).populate('user', 'name profilePhoto phone email active');
  const dentistObj = populated.toObject();
  dentistObj.checklist = computeBookableChecklist(populated);
  success(res, 200, 'Dentist profile updated by admin.', dentistObj);
});

// @route PATCH /api/dentists/:id/photo (admin updates doctor photo)
exports.adminUpdateDentistPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next(new AppError('Photo file is required.', 400));
  const dentist = await Dentist.findById(req.params.id).populate('user');
  if (!dentist) return next(new AppError('Dentist not found.', 404));

  const oldPhotoPublicId = dentist.user?.profilePhoto?.publicId;
  const updates = {
    profilePhoto: { url: req.file.path, publicId: req.file.filename },
  };
  await User.findByIdAndUpdate(dentist.user._id, updates);
  if (oldPhotoPublicId) {
    await deleteCloudinaryFile(oldPhotoPublicId);
  }

  const refreshed = await Dentist.findById(dentist._id).populate('user', 'name profilePhoto phone email active');
  success(res, 200, 'Dentist photo updated.', refreshed);
});

// @route POST /api/dentists/:id/reset-password (admin sets temporary password)
exports.adminResetDentistPassword = catchAsync(async (req, res, next) => {
  const { temporaryPassword } = req.body;
  if (!temporaryPassword || temporaryPassword.length < 6) {
    return next(new AppError('temporaryPassword must be at least 6 characters.', 400));
  }
  const dentist = await Dentist.findById(req.params.id);
  if (!dentist) return next(new AppError('Dentist not found.', 404));

  const user = await User.findById(dentist.user).select('+password +mustChangePassword +tokenVersion');
  if (!user) return next(new AppError('User not found.', 404));

  user.password = temporaryPassword;
  user.mustChangePassword = true;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();

  success(res, 200, 'Dentist password reset successfully. Doctor will be required to change password on next login.');
});

// @route GET /api/dentists/admin/all (admin-only directory with unverified profiles)
exports.getAllDentistsAdmin = catchAsync(async (req, res) => {
  const { isVerified, isActive, search, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (isVerified === 'true' || isVerified === 'false') filter.isVerified = isVerified === 'true';
  if (isActive === 'true' || isActive === 'false') filter.isActive = isActive === 'true';
  if (search) {
    const users = await User.find({ name: new RegExp(escapeRegex(search), 'i'), role: 'dentist' }).select('_id');
    filter.user = { $in: users.map((user) => user._id) };
  }

  const currentPage = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(limit) || 20));
  const [dentists, total] = await Promise.all([
    Dentist.find(filter)
      .populate('user', 'name profilePhoto phone email active')
      .sort('-createdAt')
      .skip((currentPage - 1) * pageSize)
      .limit(pageSize),
    Dentist.countDocuments(filter),
  ]);

  const enhanced = dentists.map((d) => {
    const obj = d.toObject();
    obj.checklist = computeBookableChecklist(d);
    return obj;
  });

  success(res, 200, 'Dentists fetched.', enhanced, { total, page: currentPage, limit: pageSize });
});

// @route GET /api/dentists/me/patients (E2 - unique patients in this dentist's schedule)
exports.getMyPatients = catchAsync(async (req, res, next) => {
  const dentist = await Dentist.findOne({ user: req.user._id });
  if (!dentist) return next(new AppError('Dentist profile not found.', 404));
  const patientIds = await Appointment.distinct('patient', { dentist: dentist._id });
  const patients = await User.find({ _id: { $in: patientIds }, role: 'patient' })
    .select('name email phone profilePhoto')
    .sort('name');
  success(res, 200, 'Patients fetched.', patients);
});