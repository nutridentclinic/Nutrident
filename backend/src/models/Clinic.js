const mongoose = require('mongoose');

// A physical clinic/hospital location. Multiple dentists can belong to the same clinic
// (see Dentist.clinic), enabling a single deployment to run several branches.
// This is opt-in: existing single-location setups can ignore it entirely and keep using
// Dentist.clinicAddress directly - nothing breaks if a dentist has no `clinic` set.
const clinicSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    logoUrl: { type: String, default: '' },
    address: {
      addressLine: String,
      city: String,
      state: String,
      pincode: String,
      location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
      },
    },
    contactPhone: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    departments: [{ type: String, trim: true }], // e.g. ["Cardiology", "Orthopedics"] - free-text tags for now
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

clinicSchema.index({ 'address.location': '2dsphere' });

module.exports = mongoose.model('Clinic', clinicSchema);