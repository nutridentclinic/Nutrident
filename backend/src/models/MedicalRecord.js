const mongoose = require('mongoose');

// Generic bucket for X-rays, lab reports, scans, doctor notes/files
const medicalRecordSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['xray', 'lab-report', 'scan', 'doctor-note', 'other'],
      default: 'other',
    },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    file: {
      url: { type: String, required: true },
      publicId: { type: String, required: true },
    },
    relatedAppointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MedicalRecord', medicalRecordSchema);