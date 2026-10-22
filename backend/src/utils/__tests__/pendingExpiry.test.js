const getPendingExpiry = require('../pendingExpiry');

test('expires only unpaid pending appointments older than the configured TTL', () => {
  const { filter, update } = getPendingExpiry(new Date('2026-10-22T12:00:00.000Z'), 15);
  expect(filter).toEqual({
    status: 'pending',
    paymentStatus: { $in: ['pending', 'failed'] },
    createdAt: { $lt: new Date('2026-10-22T11:45:00.000Z') },
  });
  expect(update).toEqual({ $set: { status: 'cancelled', cancelledBy: 'system' } });
});