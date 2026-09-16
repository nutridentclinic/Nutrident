// Simple sequential-looking invoice number: INV-YYYYMMDD-XXXX
const generateInvoiceNumber = () => {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INV-${y}${m}${d}-${rand}`;
};

module.exports = generateInvoiceNumber;