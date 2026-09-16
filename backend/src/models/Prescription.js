const mongoose = require('mongoose');

const prescriptionSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dentist: { type: mongoose.Schema.Types.ObjectId, ref: 'Dentist', required: true },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
    diagnosis: { type: String, default: '' },
    medicines: [
      {
        name: { type: String, required: true },
        dosage: { type: String, required: true }, // e.g. "500mg"
        frequency: { type: String, required: true }, // e.g. "1-0-1"
        durationDays: { type: Number, required: true },
        instructions: { type: String, default: '' }, // e.g. "After food"
      },
    ],
    additionalNotes: { type: String, default: '' },
    pdfUrl: { type: String, default: '' }, // generated/exported PDF stored on Cloudinary
  },
  { timestamps: true }
);

module.exports = mongoose.model('Prescription', prescriptionSchema);