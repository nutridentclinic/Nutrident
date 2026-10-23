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
    cancellationFullRefundHours: { type: Number, default: 24 },
    aboutText: { type: String, default: '' },
    openingHours: { type: String, default: 'Mon - Sat: 9:00 AM - 8:00 PM\nSunday: By appointment only' },
    mapUrl: { type: String, default: '' },
    whatsappNumber: { type: String, default: '' },
    privacyPolicy: { type: String, default: '' },
    termsOfService: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ClinicSettings', clinicSettingsSchema);