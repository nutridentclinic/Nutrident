const canAccessDentistQueue = require('../queueAccess');

describe('dentist queue access', () => {
  const dentist = { _id: 'dentist-1', user: 'dentist-user-1' };

  test('allows receptionists and admins', () => {
    expect(canAccessDentistQueue({ role: 'receptionist' }, dentist._id, null)).toBe(true);
    expect(canAccessDentistQueue({ role: 'admin' }, dentist._id, null)).toBe(true);
  });

  test('allows only the dentist who owns the queue', () => {
    expect(canAccessDentistQueue({ _id: dentist.user, role: 'dentist' }, dentist._id, dentist)).toBe(true);
    expect(canAccessDentistQueue({ id: dentist.user, role: 'dentist' }, dentist._id, dentist)).toBe(true);
    expect(canAccessDentistQueue({ _id: 'other-user', role: 'dentist' }, dentist._id, dentist)).toBe(false);
  });

  test('denies patients and unauthenticated users', () => {
    expect(canAccessDentistQueue({ _id: 'patient-1', role: 'patient' }, dentist._id, dentist)).toBe(false);
    expect(canAccessDentistQueue(null, dentist._id, dentist)).toBe(false);
  });
});