/**
 * Formats a clinic date consistently.
 * Calendar appointment dates are stored at UTC midnight (YYYY-MM-DDT00:00:00.000Z),
 * so formatting them with timeZone: 'UTC' ensures the date matches the booked clinic calendar date
 * regardless of the user's browser timezone (e.g. avoiding Sunday shifting to Saturday in US timezones).
 *
 * @param {string|Date} isoOrDateOnly - ISO string or YYYY-MM-DD string
 * @param {Intl.DateTimeFormatOptions} [opts] - formatting options
 * @returns {string} formatted date string
 */
export function formatClinicDate(isoOrDateOnly, opts = {}) {
  if (!isoOrDateOnly) return '';
  const str = String(isoOrDateOnly).trim();
  // If it's a pure 'YYYY-MM-DD', append UTC midnight
  const isoStr = /^\d{4}-\d{2}-\d{2}$/.test(str) ? `${str}T00:00:00.000Z` : str;
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return str;

  const defaultOpts = {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...opts,
  };

  return d.toLocaleDateString(undefined, defaultOpts);
}

export function formatClinicTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = String(timeStr).split(':');
  if (h === undefined || m === undefined) return timeStr;
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m} ${ampm}`;
}

export function getTodayFormatted() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

