const getPendingExpiry = (now = new Date(), ttlMinutes = Number(process.env.PENDING_APPOINTMENT_TTL_MINUTES) || 15) => {
  const cutoff = new Date(new Date(now).getTime() - ttlMinutes * 60_000);
  return {
    filter: {
      status: 'pending',
      paymentStatus: { $in: ['pending', 'failed'] },
      createdAt: { $lt: cutoff },
    },
    update: { $set: { status: 'cancelled', cancelledBy: 'system' } },
  };
};

module.exports = getPendingExpiry;