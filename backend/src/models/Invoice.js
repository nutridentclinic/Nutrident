const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dentist: { type: mongoose.Schema.Types.ObjectId, ref: 'Dentist', default: null },
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
      index: {
        unique: true,
        partialFilterExpression: { appointment: { $type: 'objectId' } },
      },
    },

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
    paidAmount: { type: Number, default: 0 },
    payments: [
      {
        amount: { type: Number, required: true },
        method: { type: String, default: 'cash' },
        reference: { type: String, default: '' },
        paidAt: { type: Date, default: Date.now },
      },
    ],
    paidAt: { type: Date, default: null },
    paymentMethod: { type: String, default: '' },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
    pdfUrl: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Invoice', invoiceSchema);
