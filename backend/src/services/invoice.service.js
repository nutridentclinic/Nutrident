const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const TreatmentPlan = require('../models/TreatmentPlan');
const generateInvoiceNumber = require('../utils/generateInvoiceNumber');
const { notifyUser, notifyRoles } = require('./notification.service');

/**
 * Creates an invoice automatically when an appointment is completed.
 * Idempotent: checks for existing invoice by appointment and handles unique index conflicts.
 *
 * @param {Object} appointment
 * @returns {Promise<Object>} The created or existing Invoice document
 */
const createInvoiceForAppointment = async (appointment) => {
  if (!appointment || !appointment._id) {
    throw new Error('Appointment is required to create invoice.');
  }

  // 1. Idempotency check: Return existing invoice if one was already created
  const existing = await Invoice.findOne({ appointment: appointment._id });
  if (existing) return existing;

  // 2. Build line items
  const items = [];
  const consultFee = appointment.fees?.consultationFee ?? appointment.feeBreakdown?.consultationFee ?? appointment.consultationFee ?? 0;
  items.push({
    description: 'Dental Consultation',
    quantity: 1,
    unitPrice: consultFee,
    amount: consultFee,
  });

  // Find any treatment plan steps linked to this appointment and marked completed
  const treatmentPlans = await TreatmentPlan.find({
    patient: appointment.patient,
    'steps.appointment': appointment._id,
  });

  treatmentPlans.forEach((plan) => {
    (plan.steps || []).forEach((step) => {
      if (
        step.appointment &&
        String(step.appointment) === String(appointment._id) &&
        step.status === 'completed'
      ) {
        items.push({
          description: step.name || 'Treatment Procedure Step',
          quantity: 1,
          unitPrice: step.cost,
          amount: step.cost,
        });
      }
    });
  });

  const subTotal = items.reduce((sum, item) => sum + item.amount, 0);

  // 3. Payment linkage
  const isPaid = appointment.paymentStatus === 'paid';
  let payment = null;
  if (isPaid) {
    payment = await Payment.findOne({ appointment: appointment._id, status: 'paid' });
  }

  const totalAmount = isPaid && payment ? payment.amount : subTotal;

  // 4. Generate sequential atomic invoice number
  const invoiceNumber = await generateInvoiceNumber();

  try {
    const invoice = await Invoice.create({
      invoiceNumber,
      patient: appointment.patient,
      dentist: appointment.dentist,
      appointment: appointment._id,
      items,
      subTotal,
      discount: 0,
      tax: 0,
      totalAmount,
      status: isPaid ? 'paid' : 'unpaid',
      paidAt: isPaid ? (payment?.updatedAt || new Date()) : null,
      paymentMethod: isPaid ? (payment?.method || 'razorpay') : '',
      payment: payment?._id || null,
    });

    if (payment && !payment.invoice) {
      payment.invoice = invoice._id;
      await payment.save();
    }

    // 5. Notifications
    await notifyUser(appointment.patient, {
      title: 'Invoice Ready',
      message: `Your visit invoice ${invoiceNumber} is ready. Total: ₹${totalAmount}.`,
      type: 'invoice_ready',
      relatedId: invoice._id,
    });

    await notifyRoles(['receptionist'], {
      title: 'Invoice Ready',
      message: `Invoice ${invoiceNumber} created for appointment visit (${isPaid ? 'Paid' : 'Unpaid'}).`,
      type: isPaid ? 'invoice_ready' : 'invoice_unpaid',
      relatedId: invoice._id,
    });

    return invoice;
  } catch (err) {
    if (err.code === 11000) {
      // Handled duplicate key under concurrent execution
      return await Invoice.findOne({ appointment: appointment._id });
    }
    throw err;
  }
};

module.exports = {
  createInvoiceForAppointment,
};
