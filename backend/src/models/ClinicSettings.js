const mongoose = require('mongoose');

// Singleton-style document holding clinic-wide config (fetched by _id: 'default')
const clinicSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'default' },
    clinicName: { type: String, default: 'Nutrident Dental & Diet Clinic' },
    logoUrl: { type: String, default: '' },
    address: { type: String, default: 'Takli Rd, Godavari MIDC, Shankar Nagar, Dwarka, Nashik, Maharashtra 422011' },
    contactPhone: { type: String, default: '+91-9420080771' },
    contactEmail: { type: String, default: 'nutridentclinic01@gmail.com' },
    platformFee: { type: Number, default: 0 },
    allowPayAtClinic: { type: Boolean, default: true },
    taxPercentage: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    reminderHoursBefore: { type: Number, default: 24 },
    cancellationFullRefundHours: { type: Number, default: 24 },
    aboutText: { type: String, default: '' },
    openingHours: { type: String, default: 'Mon - Sat: 9:00 AM - 8:00 PM\nSunday: By appointment only' },
    mapUrl: { type: String, default: 'https://maps.google.com/?q=Takli+Rd,+Godavari+MIDC,+Shankar+Nagar,+Dwarka,+Nashik,+Maharashtra+422011' },
    whatsappNumber: { type: String, default: '+91-9420080771' },
    privacyPolicy: { type: String, default: '' },
    termsOfService: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ClinicSettings', clinicSettingsSchema);