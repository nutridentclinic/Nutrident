const Invoice = require('../models/Invoice');
const User = require('../models/User');
const ClinicSettings = require('../models/ClinicSettings');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');
const generateInvoiceNumber = require('../utils/generateInvoiceNumber');
const { generateInvoicePDF } = require('../services/pdf.service');
const { checkCoupon, recordCouponUsage } = require('../services/coupon.service');
const escapeRegex = require('../utils/escapeRegex');

// @route POST /api/invoices  (receptionist/dentist generates an invoice, e.g. after in-clinic treatment)
exports.createInvoice = catchAsync(async (req, res, next) => {
  const { patientId, dentistId, appointmentId, items, couponCode } = req.body;
  const patient = await User.findOne({ _id: patientId, role: 'patient' }).select('_id');
  if (!patient) return next(new AppError('Patient not found.', 404));
  if (!Array.isArray(items) || items.length === 0 || items.some((item) => !item.description?.trim() || !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0 || Number(item.quantity ?? 1) <= 0)) {
    return next(new AppError('Invoice items must include a description, a non-negative unit price, and a positive quantity.', 400));
  }

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

// @route GET /api/invoices (E6 - staff invoice search and pagination)
exports.getAllInvoices = catchAsync(async (req, res) => {
  const { status, patientId, dentistId, from, to, search, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (patientId) filter.patient = patientId;
  if (dentistId) filter.dentist = dentistId;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setDate(end.getDate() + 1);
      filter.createdAt.$lt = end;
    }
  }
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    const patients = await User.find({ role: 'patient', $or: [{ name: regex }, { email: regex }, { phone: regex }] }).select('_id');
    filter.$or = [{ invoiceNumber: regex }, { patient: { $in: patients.map((entry) => entry._id) } }];
  }
  const currentPage = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(limit) || 20));
  const [invoices, total] = await Promise.all([
    Invoice.find(filter).populate('patient', 'name email phone').populate('dentist', 'specialization').sort('-createdAt').skip((currentPage - 1) * pageSize).limit(pageSize),
    Invoice.countDocuments(filter),
  ]);
  success(res, 200, 'Invoices fetched.', invoices, { total, page: currentPage, limit: pageSize });
});

// @route PATCH /api/invoices/:id/mark-paid (staff records an externally settled invoice)
exports.markInvoicePaid = catchAsync(async (req, res, next) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) return next(new AppError('Invoice not found.', 404));
  if (invoice.status !== 'unpaid') return next(new AppError('Only unpaid invoices can be marked as paid.', 400));
  invoice.status = 'paid';
  invoice.paymentMethod = req.body.method.trim();
  invoice.paidAt = new Date();
  await invoice.save();
  success(res, 200, 'Invoice marked as paid.', invoice);
});