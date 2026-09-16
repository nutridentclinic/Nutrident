const router = require('express').Router();
const ctrl = require('../controllers/payment.controller');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

// NOTE: webhook route is mounted separately in app.js (needs raw body), not here.

router.use(protect);
router.post('/create-order', restrictTo('patient'), ctrl.createOrder);
router.post('/verify', restrictTo('patient'), ctrl.verifyPayment);
router.post('/:id/refund', restrictTo('admin', 'dentist'), ctrl.refundPayment);
router.get('/me', restrictTo('patient'), ctrl.getMyPayments);

module.exports = router;