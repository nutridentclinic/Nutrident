const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    familyMemberName: { type: String, default: null }, // if booked for a family member
    dentist: { type: mongoose.Schema.Types.ObjectId, ref: 'Dentist', required: true },

    date: { type: Date, required: true }, // date-only (midnight UTC of appointment day)
    startTime: { type: String, required: true }, // "10:00"
    endTime: { type: String, required: true }, // "10:30"

    mode: { type: String, enum: ['in-clinic', 'video', 'audio'], default: 'in-clinic' },
    reasonForVisit: { type: String, trim: true, default: '' },

    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled', 'rescheduled', 'completed', 'no-show'],
      default: 'pending',
    },
    cancelledBy: { type: String, enum: ['patient', 'dentist', 'admin', null], default: null },
    cancellationReason: { type: String, default: '' },

    // If rescheduled, link to the new appointment doc
    rescheduledTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
    rescheduledFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },

    fees: {
      consultationFee: { type: Number, required: true },
      platformFee: { type: Number, default: 0 },
      totalAmount: { type: Number, required: true },
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },

    videoCall: {
      roomId: { type: String, default: null },
      joinedByPatientAt: Date,
      joinedByDentistAt: Date,
    },

    reminderSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Prevent exact duplicate slot booking for the same dentist
appointmentSchema.index({ dentist: 1, date: 1, startTime: 1, status: 1 });
appointmentSchema.index({ patient: 1, date: -1 });

module.exports = mongoose.model('Appointment', appointmentSchema);