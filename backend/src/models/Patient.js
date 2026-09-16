const mongoose = require('mongoose');

// Extra profile info for users with role = 'patient'
const patientSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    dateOfBirth: Date,
    gender: { type: String, enum: ['male', 'female', 'other'] },
    bloodGroup: String,
    address: {
      addressLine: String,
      city: String,
      state: String,
      pincode: String,
    },
    emergencyContact: {
      name: String,
      phone: String,
      relation: String,
    },
    allergies: [{ type: String, trim: true }],
    chronicConditions: [{ type: String, trim: true }],

    // Family members booked/managed under this primary account
    familyMembers: [
      {
        name: String,
        relation: String, // spouse, child, parent...
        dateOfBirth: Date,
        gender: { type: String, enum: ['male', 'female', 'other'] },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Patient', patientSchema);