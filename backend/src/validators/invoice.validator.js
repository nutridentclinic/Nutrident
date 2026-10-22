const { body } = require('express-validator');

exports.createInvoiceRules = [
  body('patientId').isMongoId().withMessage('Valid patientId is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one invoice item is required'),
  body('items.*.description').trim().notEmpty().withMessage('Each item needs a description'),
  body('items.*.quantity').optional().isFloat({ gt: 0 }).withMessage('Item quantity must be greater than zero'),
  body('items.*.unitPrice').isFloat({ min: 0 }).withMessage('Item unitPrice must be zero or greater'),
];

exports.markInvoicePaidRules = [
  body('method').trim().notEmpty().withMessage('Payment method is required'),
];