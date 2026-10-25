/**
 * Clinic-date utility functions.
 * All calendar appointment dates are stored at UTC midnight (00:00:00.000Z) representing a pure 'YYYY-MM-DD' day.
 * Times of day (startTime/endTime) are clinic-local 'HH:MM'.
 */

const CLINIC_TIMEZONE = process.env.CLINIC_TIMEZONE || 'Asia/Kolkata';

function getClinicTimezone() {
  return process.env.CLINIC_TIMEZONE || 'Asia/Kolkata';
}

/**
 * Parses 'YYYY-MM-DD' into a UTC midnight Date object.
 * @param {string} dateStr 'YYYY-MM-DD'
 * @returns {Date} UTC Date at 00:00:00.000Z
 */
function parseDateOnly(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  const clean = dateStr.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    throw new Error(`Invalid date format (expected YYYY-MM-DD): ${dateStr}`);
  }
  return new Date(`${clean}T00:00:00.000Z`);
}

/**
 * Computes day of week (0 = Sunday ... 6 = Saturday) using UTC math.
 * @param {string|Date} dateStr 'YYYY-MM-DD' or Date
 * @returns {number} 0-6
 */
function weekdayOf(dateStr) {
  const d = typeof dateStr === 'string' ? parseDateOnly(dateStr) : dateStr;
  return d.getUTCDay();
}

/**
 * Adds n days to 'YYYY-MM-DD' using UTC arithmetic.
 * @param {string} dateStr 'YYYY-MM-DD'
 * @param {number} n days to add (can be negative)
 * @returns {string} 'YYYY-MM-DD'
 */
function addDays(dateStr, n) {
  const d = parseDateOnly(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns UTC [start, end) range for a given 'YYYY-MM-DD' date string.
 * Start is UTC 00:00:00.000Z, End is next day UTC 00:00:00.000Z.
 * @param {string|Date} dateStr
 * @returns {{ start: Date, end: Date }}
 */
function dayRange(dateStr) {
  const cleanStr = typeof dateStr === 'string'
    ? dateStr.trim().slice(0, 10)
    : dateStr.toISOString().slice(0, 10);
  const start = parseDateOnly(cleanStr);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Returns today's date formatted as 'YYYY-MM-DD' in the clinic timezone.
 * @returns {string} 'YYYY-MM-DD'
 */
function todayInClinic() {
  const tz = getClinicTimezone();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

/**
 * Returns start and end 'YYYY-MM-DD' for a week containing dateStr.
 * @param {string} dateStr 'YYYY-MM-DD'
 * @param {'mon'|'sun'} startsOn
 * @returns {{ from: string, to: string }}
 */
function weekRange(dateStr, startsOn = 'mon') {
  const dow = weekdayOf(dateStr); // 0 = Sun, 1 = Mon ... 6 = Sat
  let diffToStart = 0;
  if (startsOn === 'sun') {
    diffToStart = dow; // 0 days back if Sun, 1 if Mon, etc.
  } else {
    // mon = 1
    diffToStart = dow === 0 ? 6 : dow - 1;
  }
  const from = addDays(dateStr, -diffToStart);
  const to = addDays(from, 6);
  return { from, to };
}

module.exports = {
  getClinicTimezone,
  parseDateOnly,
  weekdayOf,
  addDays,
  dayRange,
  todayInClinic,
  weekRange,
};
