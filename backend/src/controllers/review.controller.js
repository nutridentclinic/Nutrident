const Review = require('../models/Review');
const Appointment = require('../models/Appointment');
const Dentist = require('../models/Dentist');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');

const recalculateRating = async (dentistId) => {
  const stats = await Review.aggregate([
    { $match: { dentist: dentistId } },
    { $group: { _id: '$dentist', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const { avg = 0, count = 0 } = stats[0] || {};
  await Dentist.findByIdAndUpdate(dentistId, { ratingAverage: Math.round(avg * 10) / 10, ratingCount: count });
};

// @route POST /api/reviews  (patient - only after a completed appointment)
exports.createReview = catchAsync(async (req, res, next) => {
  const { appointmentId, rating, comment } = req.body;

  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) return next(new AppError('Appointment not found.', 404));
  if (!appointment.patient.equals(req.user._id)) {
    return next(new AppError('You can only review your own appointments.', 403));
  }
  if (appointment.status !== 'completed') {
    return next(new AppError('You can only review completed appointments.', 400));
  }

  const existing = await Review.findOne({ appointment: appointmentId });
  if (existing) return next(new AppError('You have already reviewed this appointment.', 409));

  const review = await Review.create({
    patient: req.user._id,
    dentist: appointment.dentist,
    appointment: appointmentId,
    rating,
    comment,
  });

  await recalculateRating(appointment.dentist);
  success(res, 201, 'Review submitted.', review);
});

// @route GET /api/reviews/dentist/:dentistId
exports.getDentistReviews = catchAsync(async (req, res) => {
  const reviews = await Review.find({ dentist: req.params.dentistId })
    .populate('patient', 'name profilePhoto')
    .sort('-createdAt');
  success(res, 200, 'Reviews fetched.', reviews);
});

// @route POST /api/reviews/:id/reply  (dentist replies to a review)
exports.replyToReview = catchAsync(async (req, res, next) => {
  const review = await Review.findByIdAndUpdate(
    req.params.id,
    { reply: { text: req.body.text, repliedAt: new Date() } },
    { new: true }
  );
  if (!review) return next(new AppError('Review not found.', 404));
  success(res, 200, 'Reply posted.', review);
});