const Invoice = require('../models/Invoice');
const ClinicSettings = require('../models/ClinicSettings');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');
const generateInvoiceNumber = require('../utils/generateInvoiceNumber');
const { generateInvoicePDF } = require('../services/pdf.service');
const { checkCoupon, recordCouponUsage } = require('../services/coupon.service');

// @route POST /api/invoices  (receptionist/dentist generates an invoice, e.g. after in-clinic treatment)
exports.createInvoice = catchAsync(async (req, res, next) => {
  const { patientId, dentistId, appointmentId, items, couponCode } = req.body;

  const subTotal = items.reduce((sum, i) => sum + i.unitPrice * (i.quantity || 1), 0);
  let discount = 0;
  let appliedCoupon = null;

  if (couponCode) {
    try {
      const result = await checkCoupon(couponCode, patientId, subTotal);
      discount = result.discount;
      appliedCoupon = result.coupon;
    } catch (err) {
      return next(err); // AppError from checkCoupon (invalid/expired/limit reached etc.)
    }
  }

  const settings = (await ClinicSettings.findById('default')) || { taxPercentage: 0 };
  const taxableAmount = subTotal - discount;
  const tax = (taxableAmount * (settings.taxPercentage || 0)) / 100;
  const totalAmount = Math.max(taxableAmount + tax, 0);

  const invoice = await Invoice.create({
    invoiceNumber: generateInvoiceNumber(),
    patient: patientId,
    dentist: dentistId || null,
    appointment: appointmentId || null,
    items: items.map((i) => ({ ...i, amount: i.unitPrice * (i.quantity || 1) })),
    subTotal,
    discount,
    couponCode: couponCode || null,
    tax,
    totalAmount,
  });

  // Only record usage now that the invoice has actually been created successfully
  if (appliedCoupon) await recordCouponUsage(appliedCoupon._id, patientId);

  success(res, 201, 'Invoice created.', invoice);
});

// @route GET /api/invoices/me
exports.getMyInvoices = catchAsync(async (req, res) => {
  const invoices = await Invoice.find({ patient: req.user._id }).sort('-createdAt');
  success(res, 200, 'Invoices fetched.', invoices);
});

// @route GET /api/invoices/:id
exports.getInvoiceById = catchAsync(async (req, res, next) => {
  const invoice = await Invoice.findById(req.params.id).populate('patient', 'name email phone');
  if (!invoice) return next(new AppError('Invoice not found.', 404));

  if (req.user.role === 'patient' && !invoice.patient._id.equals(req.user._id)) {
    return next(new AppError('You do not have access to this invoice.', 403));
  }
  success(res, 200, 'Invoice fetched.', invoice);
});

// @route GET /api/invoices/:id/pdf  - streams a PDF download of the invoice
exports.downloadInvoicePDF = catchAsync(async (req, res, next) => {
  const invoice = await Invoice.findById(req.params.id).populate('patient', 'name email phone');
  if (!invoice) return next(new AppError('Invoice not found.', 404));

  if (req.user.role === 'patient' && !invoice.patient._id.equals(req.user._id)) {
    return next(new AppError('You do not have access to this invoice.', 403));
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
  await generateInvoicePDF(invoice, res);
});