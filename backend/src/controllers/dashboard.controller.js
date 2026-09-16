const User = require('../models/User');
const Dentist = require('../models/Dentist');
const Appointment = require('../models/Appointment');
const Payment = require('../models/Payment');
const Review = require('../models/Review');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');

// @route GET /api/dashboard/admin  - top-level stats for admin dashboard
exports.getAdminStats = catchAsync(async (req, res) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [totalPatients, totalDentists, todaysAppointments, monthRevenueAgg, pendingDentistApprovals] =
    await Promise.all([
      User.countDocuments({ role: 'patient' }),
      User.countDocuments({ role: 'dentist' }),
      Appointment.countDocuments({ date: { $gte: startOfToday, $lt: endOfToday } }),
      Payment.aggregate([
        { $match: { status: 'paid', createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Dentist.countDocuments({ isVerified: false }),
    ]);

  success(res, 200, 'Dashboard stats fetched.', {
    totalPatients,
    totalDentists,
    todaysAppointments,
    monthRevenue: monthRevenueAgg[0]?.total || 0,
    pendingDentistApprovals,
  });
});

// @route GET /api/dashboard/admin/appointments-weekly  - appointments per day, last 7 days
exports.getWeeklyAppointments = catchAsync(async (req, res) => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const data = await Appointment.aggregate([
    { $match: { date: { $gte: sevenDaysAgo } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  success(res, 200, 'Weekly appointment data fetched.', data);
});

// @route GET /api/dashboard/admin/revenue-monthly  - revenue per month, last 6 months
exports.getMonthlyRevenue = catchAsync(async (req, res) => {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const data = await Payment.aggregate([
    { $match: { status: 'paid', createdAt: { $gte: sixMonthsAgo } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, total: { $sum: '$amount' } } },
    { $sort: { _id: 1 } },
  ]);
  success(res, 200, 'Monthly revenue fetched.', data);
});

// @route GET /api/dashboard/admin/top-specialties
exports.getTopSpecialties = catchAsync(async (req, res) => {
  const data = await Dentist.aggregate([
    { $group: { _id: '$specialization', count: { $sum: 1 }, avgRating: { $avg: '$ratingAverage' } } },
    { $sort: { count: -1 } },
  ]);
  success(res, 200, 'Top specialties fetched.', data);
});

// @route GET /api/dashboard/dentist/me  - a dentist's own earnings & performance
exports.getDentistStats = catchAsync(async (req, res, next) => {
  const dentist = await Dentist.findOne({ user: req.user._id });

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [totalAppointments, completedAppointments, monthEarningsAgg, reviewCount] = await Promise.all([
    Appointment.countDocuments({ dentist: dentist._id }),
    Appointment.countDocuments({ dentist: dentist._id, status: 'completed' }),
    Appointment.aggregate([
      { $match: { dentist: dentist._id, paymentStatus: 'paid', createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$fees.consultationFee' } } },
    ]),
    Review.countDocuments({ dentist: dentist._id }),
  ]);

  success(res, 200, 'Dentist stats fetched.', {
    totalAppointments,
    completedAppointments,
    monthEarnings: monthEarningsAgg[0]?.total || 0,
    ratingAverage: dentist.ratingAverage,
    reviewCount,
  });
});