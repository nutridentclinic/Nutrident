const { getClinicDateTime, isAppointmentParticipant, isWithinVideoWindow, toClinicDate } = require('../appointmentAccess');

const appointment = {
  patient: 'patient-1',
  dentist: { user: 'dentist-user-1' },
  date: '2026-10-23T00:00:00.000Z',
  startTime: '10:00',
  endTime: '10:30',
};

describe('appointment access policies', () => {
  test('allows only the patient or owning dentist to join', () => {
    expect(isAppointmentParticipant(appointment, { _id: 'patient-1', role: 'patient' })).toBe(true);
    expect(isAppointmentParticipant(appointment, { _id: 'dentist-user-1', role: 'dentist' })).toBe(true);
    expect(isAppointmentParticipant(appointment, { _id: 'other-user', role: 'admin' })).toBe(false);
    expect(isAppointmentParticipant(appointment, { _id: 'other-user', role: 'receptionist' })).toBe(false);
  });

  test('converts clinic-local appointment times to UTC instants', () => {
    expect(toClinicDate(appointment.date, appointment.startTime, 'Asia/Kolkata').toISOString()).toBe('2026-10-23T04:30:00.000Z');
  });

  test('reads the current date and time in the configured clinic timezone', () => {
    expect(getClinicDateTime(new Date('2026-10-23T04:30:00.000Z'), 'Asia/Kolkata')).toEqual({ date: '2026-10-23', time: '10:00' });
  });

  test('enforces early and late video join boundaries', () => {
    const start = toClinicDate(appointment.date, appointment.startTime, 'Asia/Kolkata');
    const end = toClinicDate(appointment.date, appointment.endTime, 'Asia/Kolkata');
    expect(isWithinVideoWindow(appointment, new Date(start.getTime() - 15 * 60_000))).toBe(true);
    expect(isWithinVideoWindow(appointment, new Date(start.getTime() - 15 * 60_000 - 1))).toBe(false);
    expect(isWithinVideoWindow(appointment, new Date(end.getTime() + 30 * 60_000))).toBe(true);
    expect(isWithinVideoWindow(appointment, new Date(end.getTime() + 30 * 60_000 + 1))).toBe(false);
  });
});