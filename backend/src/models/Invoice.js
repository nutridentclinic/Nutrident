const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dentist: { type: mongoose.Schema.Types.ObjectId, ref: 'Dentist', default: null },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },

    items: [
      {
        description: { type: String, required: true },
        quantity: { type: Number, default: 1 },
        unitPrice: { type: Number, required: true },
        amount: { type: Number, required: true },
      },
    ],
    subTotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    couponCode: { type: String, default: null },
    tax: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },

    status: { type: String, enum: ['unpaid', 'paid', 'refunded'], default: 'unpaid' },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
    pdfUrl: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Invoice', invoiceSchema);