const User = require('../models/User');
const Dentist = require('../models/Dentist');
const Appointment = require('../models/Appointment');
const Payment = require('../models/Payment');
const Review = require('../models/Review');
const Queue = require('../models/Queue');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');

const { todayInClinic, dayRange, weekRange, addDays, parseDateOnly, weekdayOf, getClinicTimezone } = require('../utils/clinicDate');

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// @route GET /api/dashboard/admin  - top-level stats for admin dashboard
exports.getAdminStats = catchAsync(async (req, res) => {
  const todayStr = todayInClinic();
  const range = dayRange(todayStr);

  const startOfMonthStr = `${todayStr.slice(0, 7)}-01`;
  const startOfMonth = parseDateOnly(startOfMonthStr);

  const [totalPatients, totalDentists, todaysAppointments, monthRevenueAgg, pendingDentistApprovals] =
    await Promise.all([
      User.countDocuments({ role: 'patient' }),
      User.countDocuments({ role: 'dentist' }),
      Appointment.countDocuments({
        date: { $gte: range.start, $lt: range.end },
        status: { $in: ['pending', 'confirmed', 'completed', 'no-show'] },
      }),
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

// @route GET /api/dashboard/admin/appointments-weekly  - appointments per day (range=week|7d|30d, startsOn=mon|sun)
exports.getWeeklyAppointments = catchAsync(async (req, res) => {
  const { range = '7d', startsOn = 'mon' } = req.query;
  const clinicTz = getClinicTimezone();
  const todayStr = todayInClinic();

  let fromDateStr;
  let toDateStr;

  if (range === 'week') {
    const wr = weekRange(todayStr, startsOn === 'sun' ? 'sun' : 'mon');
    fromDateStr = wr.from;
    toDateStr = wr.to;
  } else if (range === '30d') {
    fromDateStr = addDays(todayStr, -29);
    toDateStr = todayStr;
  } else {
    // default 7d
    fromDateStr = addDays(todayStr, -6);
    toDateStr = todayStr;
  }

  // Generate list of date strings
  const dateList = [];
  let curr = fromDateStr;
  while (curr <= toDateStr) {
    dateList.push(curr);
    curr = addDays(curr, 1);
  }

  const startUtc = parseDateOnly(fromDateStr);
  const endUtc = dayRange(toDateStr).end;

  const rawAppointments = await Appointment.find({
    date: { $gte: startUtc, $lt: endUtc },
  }).select('date status');

  // Group by date string YYYY-MM-DD
  const countsByDate = {};
  for (const dateStr of dateList) {
    countsByDate[dateStr] = {
      confirmed: 0,
      completed: 0,
      pending: 0,
      noShow: 0,
      cancelled: 0,
      rescheduled: 0,
    };
  }

  for (const appt of rawAppointments) {
    const dStr = appt.date.toISOString().slice(0, 10);
    if (!countsByDate[dStr]) continue;
    const st = appt.status;
    if (st === 'confirmed') countsByDate[dStr].confirmed += 1;
    else if (st === 'completed') countsByDate[dStr].completed += 1;
    else if (st === 'pending') countsByDate[dStr].pending += 1;
    else if (st === 'no-show') countsByDate[dStr].noShow += 1;
    else if (st === 'cancelled') countsByDate[dStr].cancelled += 1;
    else if (st === 'rescheduled') countsByDate[dStr].rescheduled += 1;
  }

  const series = dateList.map((dStr) => {
    const c = countsByDate[dStr];
    const dow = weekdayOf(dStr);
    const label = WEEKDAY_NAMES[dow];
    const total = c.confirmed + c.completed + c.pending + c.noShow;
    return {
      date: dStr,
      _id: dStr,
      label,
      total,
      count: total,
      confirmed: c.confirmed,
      completed: c.completed,
      pending: c.pending,
      noShow: c.noShow,
      cancelled: c.cancelled,
      rescheduled: c.rescheduled,
    };
  });

  success(res, 200, 'Weekly appointment data fetched.', {
    from: fromDateStr,
    to: toDateStr,
    timezone: clinicTz,
    series,
  });
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