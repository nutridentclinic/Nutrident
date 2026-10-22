const router = require('express').Router();
const ctrl = require('../controllers/invoice.controller');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');
const validate = require('../middleware/validate.middleware');
const { createInvoiceRules, markInvoicePaidRules } = require('../validators/invoice.validator');

router.use(protect);
router.post('/', restrictTo('dentist', 'receptionist', 'admin'), createInvoiceRules, validate, ctrl.createInvoice);
router.get('/me', restrictTo('patient'), ctrl.getMyInvoices);
router.get('/', restrictTo('dentist', 'receptionist', 'admin'), ctrl.getAllInvoices);
router.patch('/:id/mark-paid', restrictTo('dentist', 'receptionist', 'admin'), markInvoicePaidRules, validate, ctrl.markInvoicePaid);
router.get('/:id', ctrl.getInvoiceById);
router.get('/:id/pdf', ctrl.downloadInvoicePDF);

module.exports = router;