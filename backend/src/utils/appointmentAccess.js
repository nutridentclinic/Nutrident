const sameId = (left, right) => String(left?._id || left) === String(right?._id || right);

const isAppointmentParticipant = (appointment, user) => {
  if (sameId(appointment.patient, user._id)) return true;
  return user.role === 'dentist' && sameId(appointment.dentist?.user, user._id);
};

const toClinicDate = (date, time, timeZone = process.env.CLINIC_TIMEZONE || 'Asia/Kolkata') => {
  const [year, month, day] = new Date(date).toISOString().slice(0, 10).split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let timestamp = desired;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(timestamp));
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const represented = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
    );
    const adjustment = desired - represented;
    timestamp += adjustment;
    if (adjustment === 0) break;
  }

  return new Date(timestamp);
};

const getClinicDateTime = (now = new Date(), timeZone = process.env.CLINIC_TIMEZONE || 'Asia/Kolkata') => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(now));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
};

const isWithinVideoWindow = (appointment, now = new Date(), env = process.env) => {
  const earlyMinutes = Number(env.VIDEO_JOIN_EARLY_MINUTES) || 15;
  const lateMinutes = Number(env.VIDEO_JOIN_LATE_MINUTES) || 30;
  const start = toClinicDate(appointment.date, appointment.startTime).getTime();
  const end = toClinicDate(appointment.date, appointment.endTime).getTime();
  const timestamp = new Date(now).getTime();
  return timestamp >= start - earlyMinutes * 60_000 && timestamp <= end + lateMinutes * 60_000;
};

module.exports = { getClinicDateTime, isAppointmentParticipant, isWithinVideoWindow, toClinicDate };