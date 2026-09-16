const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dentist: { type: mongoose.Schema.Types.ObjectId, ref: 'Dentist', required: true },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, default: '' },
    isVerifiedPatient: { type: Boolean, default: true }, // true since tied to a real appointment
    reply: {
      text: String,
      repliedAt: Date,
    },
  },
  { timestamps: true }
);

// One review per appointment
reviewSchema.index({ appointment: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);