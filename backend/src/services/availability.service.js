const Appointment = require('../models/Appointment');
const Dentist = require('../models/Dentist');
const SlotHold = require('../models/SlotHold');
const AppError = require('../utils/appError');
const { getClinicDateTime } = require('../utils/appointmentAccess');
const { parseDateOnly, dayRange, weekdayOf, todayInClinic, addDays } = require('../utils/clinicDate');

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
 * Checks if dentist is currently paused (either isActive=false or pausedUntil > now)
 */
const isDentistPaused = (dentist) => {
  if (!dentist.isActive) return true;
  if (dentist.pausedUntil && new Date(dentist.pausedUntil) > new Date()) return true;
  return false;
};

/**
 * Generates all bookable slots for a dentist on a given date,
 * based on weeklyAvailability, slotDurationMinutes, unavailableDates,
 * and excludes slots already booked (pending/confirmed) or currently held.
 */
const getAvailableSlots = async (dentistId, dateStr) => {
  const dentist = await Dentist.findById(dentistId);
  if (!dentist) throw new AppError('Dentist not found', 404);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return [];
  let date;
  try {
    date = parseDateOnly(dateStr);
  } catch {
    return [];
  }

  const today = todayInClinic();
  const { time: currentTime } = getClinicDateTime();
  if (dateStr < today) return [];

  const isUnavailable = dentist.unavailableDates.some(
    (unavailableDate) => new Date(unavailableDate).toISOString().slice(0, 10) === dateStr
  );
  if (isUnavailable || isDentistPaused(dentist)) return [];

  const dayOfWeek = weekdayOf(date);
  const dayAvailability = (dentist.weeklyAvailability || []).find((d) => d.day === dayOfWeek);
  if (!dayAvailability || !dayAvailability.slots || dayAvailability.slots.length === 0) return [];

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

  // Remove already-booked slots using timezone-safe UTC dayRange
  const { start, end } = dayRange(dateStr);

  const booked = await Appointment.find({
    dentist: dentistId,
    date: { $gte: start, $lt: end },
    status: { $in: ['pending', 'confirmed', 'checked-in'] },
  }).select('startTime');

  const activeHolds = await SlotHold.find({
    dentist: dentistId,
    date: { $gte: start, $lt: end },
    status: 'active',
    expiresAt: { $gt: new Date() },
  }).select('startTime');

  const bookedTimes = new Set([
    ...booked.map((b) => b.startTime),
    ...activeHolds.map((h) => h.startTime),
  ]);

  return allSlots.filter((slot) =>
    !bookedTimes.has(slot.startTime) && !(dateStr === today && slot.startTime <= currentTime)
  );
};

/**
 * Returns a day-by-day availability status strip for a dentist.
 * Statuses: 'open' | 'closed' | 'leave' | 'paused' | 'full' | 'past'
 */
const getDentistAvailabilityRange = async (dentistId, fromDateStr, toDateStr) => {
  const dentist = await Dentist.findById(dentistId);
  if (!dentist) throw new AppError('Dentist not found', 404);

  const today = todayInClinic();
  const from = fromDateStr || today;
  // Default to 14 days ahead if to is not specified
  const to = toDateStr || addDays(from, 13);

  const result = [];
  let curr = from;

  while (curr <= to) {
    let status = 'open';
    let slots = [];
    let dateObj;

    try {
      dateObj = parseDateOnly(curr);
    } catch {
      curr = addDays(curr, 1);
      continue;
    }

    const weekday = weekdayOf(dateObj);

    if (curr < today) {
      status = 'past';
    } else if (!dentist.isActive) {
      status = 'paused';
    } else if (dentist.pausedUntil && new Date(dentist.pausedUntil) > new Date()) {
      status = 'paused';
    } else {
      const isLeave = (dentist.unavailableDates || []).some(
        (d) => new Date(d).toISOString().slice(0, 10) === curr
      );

      if (isLeave) {
        status = 'leave';
      } else {
        const dayAvail = (dentist.weeklyAvailability || []).find((d) => d.day === weekday);
        if (!dayAvail || !dayAvail.slots || dayAvail.slots.length === 0) {
          status = 'closed';
        } else {
          try {
            slots = await getAvailableSlots(dentistId, curr);
            if (slots.length === 0) {
              status = 'full';
            }
          } catch {
            status = 'closed';
          }
        }
      }
    }

    result.push({
      date: curr,
      weekday,
      status,
      slots,
    });

    curr = addDays(curr, 1);
  }

  return result;
};

/**
 * Atomically checks + reserves a slot to prevent double booking.
 * Call this right before creating the Appointment or SlotHold document.
 */
const assertSlotIsFree = async (dentistId, date, startTime) => {
  const dateStr = typeof date === 'string' ? date.slice(0, 10) : date.toISOString().slice(0, 10);
  const { start, end } = dayRange(dateStr);

  const clash = await Appointment.findOne({
    dentist: dentistId,
    date: { $gte: start, $lt: end },
    startTime,
    status: { $in: ['pending', 'confirmed', 'checked-in'] },
  });

  if (clash) throw new AppError('This slot has just been booked. Please choose another slot.', 409);

  const holdClash = await SlotHold.findOne({
    dentist: dentistId,
    date: { $gte: start, $lt: end },
    startTime,
    status: 'active',
    expiresAt: { $gt: new Date() },
  });

  if (holdClash) {
    throw new AppError('This slot is currently held by someone completing payment. Please choose another slot.', 409);
  }
};

module.exports = {
  getAvailableSlots,
  getDentistAvailabilityRange,
  assertSlotIsFree,
  isDentistPaused,
};
