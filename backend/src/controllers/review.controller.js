const Review = require('../models/Review');
const Appointment = require('../models/Appointment');
const Dentist = require('../models/Dentist');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');

const { notify } = require('../services/notification.service');

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

  const dentistDoc = await Dentist.findById(appointment.dentist);
  if (dentistDoc?.user) {
    await notify({
      userId: dentistDoc.user,
      title: 'New Patient Review',
      message: `You received a ${rating}-star review: "${comment?.slice(0, 50) || ''}"`,
      type: 'review_received',
      relatedId: review._id,
    });
  }

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
  const review = await Review.findById(req.params.id);
  if (!review) return next(new AppError('Review not found.', 404));

  if (req.user.role === 'dentist') {
    const dentist = await Dentist.findOne({ user: req.user._id });
    if (!dentist || !review.dentist.equals(dentist._id)) {
      return next(new AppError('You can only reply to reviews for your clinic.', 403));
    }
  }

  review.reply = { text: req.body.text, repliedAt: new Date() };
  await review.save();

  if (review.patient) {
    await notify({
      userId: review.patient,
      title: 'Doctor Replied to Your Review',
      message: 'The clinic doctor responded to your feedback.',
      type: 'review_reply',
      relatedId: review._id,
    });
  }

  success(res, 200, 'Reply posted.', review);
});