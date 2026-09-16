const mongoose = require('mongoose');

// Singleton-style document holding clinic-wide config (fetched by _id: 'default')
const clinicSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'default' },
    clinicName: { type: String, default: 'ABC Dental Clinic' },
    logoUrl: { type: String, default: '' },
    address: { type: String, default: '' },
    contactPhone: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    platformFee: { type: Number, default: 20 }, // flat fee added to bookings
    taxPercentage: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    reminderHoursBefore: { type: Number, default: 24 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ClinicSettings', clinicSettingsSchema);