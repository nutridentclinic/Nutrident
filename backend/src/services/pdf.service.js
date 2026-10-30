const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const ClinicSettings = require('../models/ClinicSettings');

const BUNDLED_FONT = path.join(__dirname, '../assets/fonts/AppFont.ttf');
const hasBundledFont = fs.existsSync(BUNDLED_FONT);

const getFont = (bold = false) => {
  if (hasBundledFont) return BUNDLED_FONT;
  return bold ? 'Helvetica-Bold' : 'Helvetica';
};

const CURRENCY_SYMBOL = { INR: hasBundledFont ? '₹ ' : 'Rs. ' };

const money = (amount, currency = 'INR') => `${CURRENCY_SYMBOL[currency] || currency + ' '}${Number(amount || 0).toFixed(2)}`;

const drawHeader = (doc, clinic, title) => {
  doc.fontSize(18).font(getFont(true)).text(clinic.clinicName || 'Dental Clinic', { align: 'left' });
  doc.fontSize(9).font(getFont(false)).fillColor('#555');
  if (clinic.address) doc.text(clinic.address);
  const contactLine = [clinic.contactPhone, clinic.contactEmail].filter(Boolean).join('  |  ');
  if (contactLine) doc.text(contactLine);
  doc.fillColor('#000');
  doc.moveDown(0.5);
  doc.fontSize(14).font(getFont(true)).text(title, { align: 'right' });
  doc.moveTo(50, doc.y + 8).lineTo(doc.page.width - 50, doc.y + 8).strokeColor('#ddd').stroke();
  doc.moveDown(1.2);
  doc.fillColor('#000');
};

const drawFooter = (doc) => {
  const bottom = doc.page.height - 60;
  doc.fontSize(8).font(getFont(false)).fillColor('#888').text('This is a system-generated document.', 50, bottom, {
    align: 'center',
    width: doc.page.width - 100,
  });
  doc.fillColor('#000');
};

/**
 * Streams an invoice PDF straight to the given writable stream (typically the Express `res`).
 * Caller is responsible for setting response headers before calling this.
 */
const generateInvoicePDF = async (invoice, stream) => {
  const clinic = (await ClinicSettings.findById('default')) || {};
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(stream);

  drawHeader(doc, clinic, 'INVOICE');

  doc.fontSize(10).font(getFont(true)).text(`Invoice #: `, { continued: true }).font(getFont(false)).text(invoice.invoiceNumber);
  doc.font(getFont(true)).text('Date: ', { continued: true }).font(getFont(false)).text(new Date(invoice.createdAt).toDateString());
  doc.moveDown(0.5);

  if (invoice.patient) {
    doc.font(getFont(true)).text('Billed To:');
    doc.font(getFont(false)).text(invoice.patient.name || '');
    if (invoice.patient.phone) doc.text(invoice.patient.phone);
    if (invoice.patient.email) doc.text(invoice.patient.email);
  }
  doc.moveDown(1);

  // Table header
  const tableTop = doc.y;
  const col = { desc: 50, qty: 300, unit: 360, amount: 460 };
  doc.font(getFont(true)).fontSize(10);
  doc.text('Description', col.desc, tableTop);
  doc.text('Qty', col.qty, tableTop);
  doc.text('Unit Price', col.unit, tableTop);
  doc.text('Amount', col.amount, tableTop);
  doc.moveTo(50, tableTop + 15).lineTo(doc.page.width - 50, tableTop + 15).strokeColor('#ddd').stroke();

  let y = tableTop + 22;
  doc.font(getFont(false)).fontSize(10);
  invoice.items.forEach((item) => {
    doc.text(item.description, col.desc, y, { width: 240 });
    doc.text(String(item.quantity || 1), col.qty, y);
    doc.text(money(item.unitPrice, invoice.currency), col.unit, y);
    doc.text(money(item.amount, invoice.currency), col.amount, y);
    y += 20;
  });

  doc.moveTo(50, y + 4).lineTo(doc.page.width - 50, y + 4).strokeColor('#ddd').stroke();
  y += 14;

  const totalsLine = (label, value, bold = false) => {
    doc.font(getFont(bold)).fontSize(10);
    doc.text(label, 360, y);
    doc.text(value, col.amount, y);
    y += 18;
  };

  totalsLine('Subtotal', money(invoice.subTotal));
  if (invoice.discount) totalsLine(`Discount${invoice.couponCode ? ` (${invoice.couponCode})` : ''}`, `-${money(invoice.discount)}`);
  if (invoice.tax) totalsLine('Tax', money(invoice.tax));
  y += 4;
  doc.moveTo(360, y).lineTo(doc.page.width - 50, y).strokeColor('#ddd').stroke();
  y += 8;
  totalsLine('Total', money(invoice.totalAmount), true);

  doc.y = y + 20;
  doc.font(getFont(true)).fontSize(10).text('Status: ', { continued: true }).font(getFont(false)).text(invoice.status.toUpperCase());

  drawFooter(doc);
  doc.end();
};

module.exports = { generateInvoicePDF };
