const PDFDocument = require('pdfkit');
const ClinicSettings = require('../models/ClinicSettings');

const CURRENCY_SYMBOL = { INR: 'Rs.' }; // pdfkit's default font can't render '₹' - use text fallback

const money = (amount, currency = 'INR') => `${CURRENCY_SYMBOL[currency] || currency + ' '}${Number(amount || 0).toFixed(2)}`;

const drawHeader = (doc, clinic, title) => {
  doc.fontSize(18).font('Helvetica-Bold').text(clinic.clinicName || 'Dental Clinic', { align: 'left' });
  doc.fontSize(9).font('Helvetica').fillColor('#555');
  if (clinic.address) doc.text(clinic.address);
  const contactLine = [clinic.contactPhone, clinic.contactEmail].filter(Boolean).join('  |  ');
  if (contactLine) doc.text(contactLine);
  doc.fillColor('#000');
  doc.moveDown(0.5);
  doc.fontSize(14).font('Helvetica-Bold').text(title, { align: 'right' });
  doc.moveTo(50, doc.y + 8).lineTo(doc.page.width - 50, doc.y + 8).strokeColor('#ddd').stroke();
  doc.moveDown(1.2);
  doc.fillColor('#000');
};

const drawFooter = (doc) => {
  const bottom = doc.page.height - 60;
  doc.fontSize(8).fillColor('#888').text('This is a system-generated document.', 50, bottom, {
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

  doc.fontSize(10).font('Helvetica-Bold').text(`Invoice #: `, { continued: true }).font('Helvetica').text(invoice.invoiceNumber);
  doc.font('Helvetica-Bold').text('Date: ', { continued: true }).font('Helvetica').text(new Date(invoice.createdAt).toDateString());
  doc.moveDown(0.5);

  if (invoice.patient) {
    doc.font('Helvetica-Bold').text('Billed To:');
    doc.font('Helvetica').text(invoice.patient.name || '');
    if (invoice.patient.phone) doc.text(invoice.patient.phone);
    if (invoice.patient.email) doc.text(invoice.patient.email);
  }
  doc.moveDown(1);

  // Table header
  const tableTop = doc.y;
  const col = { desc: 50, qty: 300, unit: 360, amount: 460 };
  doc.font('Helvetica-Bold').fontSize(10);
  doc.text('Description', col.desc, tableTop);
  doc.text('Qty', col.qty, tableTop);
  doc.text('Unit Price', col.unit, tableTop);
  doc.text('Amount', col.amount, tableTop);
  doc.moveTo(50, tableTop + 15).lineTo(doc.page.width - 50, tableTop + 15).strokeColor('#ddd').stroke();

  let y = tableTop + 22;
  doc.font('Helvetica').fontSize(10);
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
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
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
  doc.font('Helvetica-Bold').fontSize(10).text('Status: ', { continued: true }).font('Helvetica').text(invoice.status.toUpperCase());

  drawFooter(doc);
  doc.end();
};

/**
 * Streams a prescription PDF straight to the given writable stream.
 */
const generatePrescriptionPDF = async (prescription, stream) => {
  const clinic = (await ClinicSettings.findById('default')) || {};
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(stream);

  drawHeader(doc, clinic, 'PRESCRIPTION');

  doc.fontSize(10);
  doc.font('Helvetica-Bold').text('Date: ', { continued: true }).font('Helvetica').text(new Date(prescription.createdAt).toDateString());
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').text('Patient: ', { continued: true }).font('Helvetica').text(prescription.patient?.name || '');
  if (prescription.patient?.phone) {
    doc.font('Helvetica-Bold').text('Phone: ', { continued: true }).font('Helvetica').text(prescription.patient.phone);
  }
  const dentistName = prescription.dentist?.user?.name;
  if (dentistName) {
    doc.font('Helvetica-Bold').text('Dentist: ', { continued: true }).font('Helvetica').text(`Dr. ${dentistName}`);
  }
  doc.moveDown(1);

  if (prescription.diagnosis) {
    doc.font('Helvetica-Bold').text('Diagnosis:');
    doc.font('Helvetica').text(prescription.diagnosis);
    doc.moveDown(0.8);
  }

  doc.font('Helvetica-Bold').fontSize(12).text('Rx', { underline: true });
  doc.moveDown(0.3);

  const tableTop = doc.y;
  const col = { name: 50, dosage: 220, freq: 320, duration: 420, instr: 490 };
  doc.font('Helvetica-Bold').fontSize(9);
  doc.text('Medicine', col.name, tableTop);
  doc.text('Dosage', col.dosage, tableTop);
  doc.text('Frequency', col.freq, tableTop);
  doc.text('Days', col.duration, tableTop);
  doc.moveTo(50, tableTop + 14).lineTo(doc.page.width - 50, tableTop + 14).strokeColor('#ddd').stroke();

  let y = tableTop + 20;
  doc.font('Helvetica').fontSize(9);
  (prescription.medicines || []).forEach((m) => {
    doc.text(m.name, col.name, y, { width: 160 });
    doc.text(m.dosage, col.dosage, y, { width: 90 });
    doc.text(m.frequency, col.freq, y, { width: 90 });
    doc.text(String(m.durationDays), col.duration, y, { width: 60 });
    if (m.instructions) doc.fontSize(8).fillColor('#555').text(m.instructions, col.name, y + 12, { width: 400 }).fillColor('#000').fontSize(9);
    y += m.instructions ? 30 : 20;
  });

  if (prescription.additionalNotes) {
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(10).text('Additional Notes:');
    doc.font('Helvetica').text(prescription.additionalNotes);
  }

  doc.moveDown(3);
  doc.fontSize(9).text('_______________________', { align: 'right' });
  doc.text(dentistName ? `Dr. ${dentistName}` : 'Dentist Signature', { align: 'right' });

  drawFooter(doc);
  doc.end();
};

module.exports = { generateInvoicePDF, generatePrescriptionPDF };