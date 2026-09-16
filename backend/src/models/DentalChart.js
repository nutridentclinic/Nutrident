const mongoose = require('mongoose');

// One odontogram per patient - tracks condition of each tooth (FDI numbering 11-48)
const toothConditionSchema = new mongoose.Schema(
  {
    toothNumber: { type: Number, required: true },
    condition: {
      type: String,
      enum: ['healthy', 'decayed', 'filled', 'missing', 'crowned', 'root-canal', 'implant', 'extracted'],
      default: 'healthy',
    },
    notes: { type: String, default: '' },
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const dentalChartSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    teeth: [toothConditionSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('DentalChart', dentalChartSchema);