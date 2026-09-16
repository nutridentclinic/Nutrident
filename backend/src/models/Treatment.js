const mongoose = require('mongoose');

// Master catalog of treatments/services offered by the clinic (used in TreatmentPlan)
const treatmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. Root Canal, Scaling
    category: { type: String, trim: true },
    description: { type: String, default: '' },
    defaultCost: { type: Number, required: true, min: 0 },
    estimatedDurationMinutes: { type: Number, default: 30 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Treatment', treatmentSchema);