const Invoice = require('../models/Invoice');
const Coupon = require('../models/Coupon');
const ClinicSettings = require('../models/ClinicSettings');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');
const generateInvoiceNumber = require('../utils/generateInvoiceNumber');
const { generateInvoicePDF } = require('../services/pdf.service');

// @route POST /api/invoices  (receptionist/dentist generates an invoice, e.g. after in-clinic treatment)
exports.createInvoice = catchAsync(async (req, res, next) => {
  const { patientId, dentistId, appointmentId, items, couponCode } = req.body;

  const subTotal = items.reduce((sum, i) => sum + i.unitPrice * (i.quantity || 1), 0);
  let discount = 0;

  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
    if (!coupon) return next(new AppError('Invalid or expired coupon code.', 400));
    if (coupon.validUntil < new Date()) return next(new AppError('Coupon has expired.', 400));
    if (subTotal < coupon.minOrderAmount) {
      return next(new AppError(`Minimum order amount for this coupon is ₹${coupon.minOrderAmount}.`, 400));
    }
    discount =
      coupon.discountType === 'flat'
        ? coupon.discountValue
        : Math.min((subTotal * coupon.discountValue) / 100, coupon.maxDiscountAmount || Infinity);
    coupon.usedCount += 1;
    await coupon.save();
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

// NOTE: PDF generation/download endpoint intentionally left out for now -
// would add 'pdfkit' or 'puppeteer' as a new dependency. Flag before adding.