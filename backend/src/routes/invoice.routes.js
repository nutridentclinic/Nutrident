const router = require('express').Router();
const ctrl = require('../controllers/invoice.controller');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

router.use(protect);
router.post('/', restrictTo('dentist', 'receptionist', 'admin'), ctrl.createInvoice);
router.get('/me', restrictTo('patient'), ctrl.getMyInvoices);
router.get('/:id', ctrl.getInvoiceById);

module.exports = router;