const Counter = require('../models/Counter');
const { todayInClinic } = require('./clinicDate');

/**
 * Generates an atomic sequential invoice number: INV-YYYY-000123
 */
const generateInvoiceNumber = async () => {
  const year = todayInClinic().slice(0, 4);
  const seq = await Counter.getNextSequence(`invoice_${year}`);
  return `INV-${year}-${String(seq).padStart(6, '0')}`;
};

module.exports = generateInvoiceNumber;