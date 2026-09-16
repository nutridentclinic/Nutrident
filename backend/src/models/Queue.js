const mongoose = require('mongoose');

// Live walk-in / same-day waiting queue per dentist per day
const queueEntrySchema = new mongoose.Schema(
  {
    dentist: { type: mongoose.Schema.Types.ObjectId, ref: 'Dentist', required: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null for walk-in without account
    walkInName: { type: String, default: null },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
    tokenNumber: { type: Number, required: true },
    date: { type: Date, required: true },
    status: {
      type: String,
      enum: ['waiting', 'in-progress', 'completed', 'skipped', 'cancelled'],
      default: 'waiting',
    },
    checkedInAt: { type: Date, default: Date.now },
    calledAt: Date,
    completedAt: Date,
    estimatedWaitMinutes: { type: Number, default: 0 },
  },
  { timestamps: true }
);

queueEntrySchema.index({ dentist: 1, date: 1, tokenNumber: 1 });

module.exports = mongoose.model('Queue', queueEntrySchema);