const mongoose = require('mongoose');

// A dentist creates a multi-step treatment plan for a patient (e.g. full mouth rehab)
const treatmentPlanSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dentist: { type: mongoose.Schema.Types.ObjectId, ref: 'Dentist', required: true },
    title: { type: String, required: true },
    notes: { type: String, default: '' },
    steps: [
      {
        treatment: { type: mongoose.Schema.Types.ObjectId, ref: 'Treatment' },
        toothNumbers: [{ type: Number }], // FDI notation e.g. 11, 21, 36
        cost: { type: Number, required: true },
        status: {
          type: String,
          enum: ['planned', 'in-progress', 'completed', 'cancelled'],
          default: 'planned',
        },
        appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
        completedAt: Date,
      },
    ],
    totalEstimatedCost: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['active', 'completed', 'cancelled'],
      default: 'active',
    },
    followUpRequired: { type: Boolean, default: false },
    followUpDate: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('TreatmentPlan', treatmentPlanSchema);