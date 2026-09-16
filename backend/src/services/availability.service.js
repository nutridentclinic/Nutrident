const Appointment = require('../models/Appointment');
const Dentist = require('../models/Dentist');
const AppError = require('../utils/appError');

// Converts "HH:MM" to minutes since midnight for easy comparison
const toMinutes = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const toTimeStr = (mins) => {
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}`;
};

/**
 * Generates all bookable slots for a dentist on a given date,
 * based on weeklyAvailability, slotDurationMinutes, unavailableDates,
 * and excludes slots already booked (pending/confirmed).
 */
const getAvailableSlots = async (dentistId, dateStr) => {
  const dentist = await Dentist.findById(dentistId);
  if (!dentist) throw new AppError('Dentist not found', 404);

  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0);

  const isUnavailable = dentist.unavailableDates.some(
    (d) => new Date(d).toDateString() === date.toDateString()
  );
  if (isUnavailable || !dentist.isActive) return [];

  const dayOfWeek = date.getDay();
  const dayAvailability = dentist.weeklyAvailability.find((d) => d.day === dayOfWeek);
  if (!dayAvailability || dayAvailability.slots.length === 0) return [];

  const duration = dentist.slotDurationMinutes || 30;

  // Build all possible slots from the day's time windows
  const allSlots = [];
  dayAvailability.slots.forEach(({ startTime, endTime }) => {
    let cursor = toMinutes(startTime);
    const end = toMinutes(endTime);
    while (cursor + duration <= end) {
      allSlots.push({ startTime: toTimeStr(cursor), endTime: toTimeStr(cursor + duration) });
      cursor += duration;
    }
  });

  // Remove already-booked slots
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);

  const booked = await Appointment.find({
    dentist: dentistId,
    date: { $gte: date, $lt: nextDay },
    status: { $in: ['pending', 'confirmed'] },
  }).select('startTime');

  const bookedTimes = new Set(booked.map((b) => b.startTime));

  return allSlots.filter((s) => !bookedTimes.has(s.startTime));
};

/**
 * Atomically checks + reserves a slot to prevent double booking.
 * Call this right before creating the Appointment document.
 */
const assertSlotIsFree = async (dentistId, date, startTime) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const nextDay = new Date(d);
  nextDay.setDate(nextDay.getDate() + 1);

  const clash = await Appointment.findOne({
    dentist: dentistId,
    date: { $gte: d, $lt: nextDay },
    startTime,
    status: { $in: ['pending', 'confirmed'] },
  });

  if (clash) throw new AppError('This slot has just been booked. Please choose another slot.', 409);
};

module.exports = { getAvailableSlots, assertSlotIsFree };