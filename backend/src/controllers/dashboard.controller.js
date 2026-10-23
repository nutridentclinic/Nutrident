const User = require('../models/User');
const Dentist = require('../models/Dentist');
const Appointment = require('../models/Appointment');
const Payment = require('../models/Payment');
const Review = require('../models/Review');
const Queue = require('../models/Queue');
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

// @route GET /api/dashboard/admin/appointments-weekly  - appointments per day, last 7 days (zero-filled, no future dates)
exports.getWeeklyAppointments = catchAsync(async (req, res) => {
  const timeZone = process.env.CLINIC_TIMEZONE || 'Asia/Kolkata';
  const now = new Date();
  
  // Compute past 7 days strings in clinic timezone
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone }).format(d);
    if (!days.includes(dateStr)) days.push(dateStr);
  }

  const startUtc = new Date(`${days[0]}T00:00:00.000Z`);
  const endUtc = new Date(`${days[days.length - 1]}T23:59:59.999Z`);

  const rawData = await Appointment.aggregate([
    { $match: { date: { $gte: startUtc, $lte: endUtc } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, count: { $sum: 1 } } },
  ]);

  const countMap = Object.fromEntries(rawData.map((item) => [item._id, item.count]));
  const data = days.map((day) => ({
    _id: day,
    count: countMap[day] || 0,
  }));

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

// @route GET /api/dashboard/receptionist (E4 - front-desk daily workload)
exports.getReceptionistStats = catchAsync(async (req, res) => {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.CLINIC_TIMEZONE || 'Asia/Kolkata',
  }).format(new Date());
  const startOfDay = new Date(`${today}T00:00:00.000Z`);
  const endOfDay = new Date(startOfDay);
  endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
  const [appointmentsToday, confirmedToday, pendingToday, waitingQueue, totalPatients, nextQueueEntry] = await Promise.all([
    Appointment.countDocuments({ date: { $gte: startOfDay, $lt: endOfDay } }),
    Appointment.countDocuments({ date: { $gte: startOfDay, $lt: endOfDay }, status: 'confirmed' }),
    Appointment.countDocuments({ date: { $gte: startOfDay, $lt: endOfDay }, status: 'pending' }),
    Queue.countDocuments({ date: { $gte: startOfDay, $lt: endOfDay }, status: 'waiting' }),
    User.countDocuments({ role: 'patient' }),
    Queue.findOne({ date: { $gte: startOfDay, $lt: endOfDay }, status: 'waiting' })
      .sort('tokenNumber')
      .populate('patient', 'name phone'),
  ]);

  const nextPatient = nextQueueEntry
    ? {
        tokenNumber: nextQueueEntry.tokenNumber,
        name: nextQueueEntry.patient?.name || nextQueueEntry.walkInName || 'Walk-in Patient',
        phone: nextQueueEntry.patient?.phone || '',
        estimatedWaitMinutes: nextQueueEntry.estimatedWaitMinutes,
      }
    : null;

  success(res, 200, 'Receptionist dashboard fetched.', {
    appointmentsToday,
    confirmedToday,
    pendingToday,
    waitingQueue,
    totalPatients,
    nextPatient,
  });
});