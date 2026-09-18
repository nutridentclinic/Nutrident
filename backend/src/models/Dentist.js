const mongoose = require('mongoose');

// Extra profile info for users with role = 'dentist'
const dentistSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    specialization: { type: String, required: true, trim: true }, // e.g. Orthodontist, Endodontist
    qualifications: [{ type: String, trim: true }], // e.g. BDS, MDS
    experienceYears: { type: Number, default: 0, min: 0 },
    about: { type: String, trim: true, default: '' },
    languages: [{ type: String, trim: true }],
    consultationFee: { type: Number, required: true, min: 0 },
    clinicAddress: {
      addressLine: String,
      city: String,
      state: String,
      pincode: String,
      location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
      },
    },
    clinic: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', default: null },
    isVerified: { type: Boolean, default: false }, // admin approves credentials
    isActive: { type: Boolean, default: true }, // can toggle "accepting appointments"
    ratingAverage: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0 },

    // Weekly recurring availability, e.g. Mon-Sat 09:00-13:00 & 16:00-20:00
    weeklyAvailability: [
      {
        day: { type: Number, min: 0, max: 6 }, // 0 = Sunday ... 6 = Saturday
        slots: [
          {
            startTime: String, // "09:00"
            endTime: String, // "13:00"
          },
        ],
      },
    ],
    slotDurationMinutes: { type: Number, default: 30 },

    // One-off exceptions: leave days, holidays, extra availability
    unavailableDates: [{ type: Date }],
  },
  { timestamps: true }
);

dentistSchema.index({ 'clinicAddress.location': '2dsphere' });
dentistSchema.index({ specialization: 1 });
dentistSchema.index({ clinic: 1 });

module.exports = mongoose.model('Dentist', dentistSchema);