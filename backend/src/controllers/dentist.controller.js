const User = require('../models/User');
const Dentist = require('../models/Dentist');
const Review = require('../models/Review');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');
const { getAvailableSlots } = require('../services/availability.service');

// @route POST /api/dentists  (admin only) - onboard a new dentist
exports.createDentist = catchAsync(async (req, res, next) => {
  const { name, email, phone, password, specialization, qualifications, experienceYears, consultationFee, about, languages, clinicAddress } = req.body;

  const existing = await User.findOne({ $or: [{ email }, { phone }] });
  if (existing) return next(new AppError('A user with this email or phone already exists.', 409));

  const user = await User.create({ name, email, phone, password, role: 'dentist', isEmailVerified: true });
  const dentist = await Dentist.create({
    user: user._id,
    specialization,
    qualifications,
    experienceYears,
    consultationFee,
    about,
    languages,
    clinicAddress,
  });

  success(res, 201, 'Dentist onboarded successfully. Pending credential verification.', { user, dentist });
});

// @route GET /api/dentists  - search/filter/discover dentists
exports.getDentists = catchAsync(async (req, res) => {
  const { specialization, city, minRating, maxFee, search, sort = '-ratingAverage', page = 1, limit = 10 } = req.query;

  const filter = { isActive: true, isVerified: true };
  if (specialization) filter.specialization = new RegExp(specialization, 'i');
  if (city) filter['clinicAddress.city'] = new RegExp(city, 'i');
  if (minRating) filter.ratingAverage = { $gte: Number(minRating) };
  if (maxFee) filter.consultationFee = { ...(filter.consultationFee || {}), $lte: Number(maxFee) };

  let query = Dentist.find(filter).populate('user', 'name profilePhoto phone email');

  if (search) {
    // basic name search via populated user - fetch matching user ids first
    const users = await User.find({ name: new RegExp(search, 'i'), role: 'dentist' }).select('_id');
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

// @route GET /api/dentists/:id
exports.getDentistById = catchAsync(async (req, res, next) => {
  const dentist = await Dentist.findById(req.params.id).populate('user', 'name profilePhoto phone email');
  if (!dentist) return next(new AppError('Dentist not found.', 404));

  const reviews = await Review.find({ dentist: dentist._id })
    .populate('patient', 'name profilePhoto')
    .sort('-createdAt')
    .limit(20);

  success(res, 200, 'Dentist details fetched.', { dentist, reviews });
});

// @route GET /api/dentists/:id/slots?date=YYYY-MM-DD
exports.getDentistSlots = catchAsync(async (req, res, next) => {
  const { date } = req.query;
  if (!date) return next(new AppError('date query param is required (YYYY-MM-DD).', 400));

  const slots = await getAvailableSlots(req.params.id, date);
  success(res, 200, 'Available slots fetched.', slots);
});

// @route PATCH /api/dentists/me  (dentist updates own profile)
exports.updateMyProfile = catchAsync(async (req, res, next) => {
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
  dentist.isActive = !dentist.isActive;
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