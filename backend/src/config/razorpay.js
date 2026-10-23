const Razorpay = require('razorpay');

let razorpayInstance;
try {
  razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder_key',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'rzp_test_placeholder_secret',
  });
} catch {
  razorpayInstance = {
    orders: { create: async () => ({ id: 'order_test_mock' }) },
    payments: { fetch: async () => ({ status: 'captured' }) },
  };
}

module.exports = razorpayInstance;