const router = require('express').Router();
const ctrl = require('../controllers/queue.controller');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

router.use(protect);
router.post('/check-in', restrictTo('receptionist', 'admin'), ctrl.checkIn);
router.get('/dentist/:dentistId', ctrl.getQueueForDentist);
router.patch('/:id/call', restrictTo('receptionist', 'dentist', 'admin'), ctrl.callNext);
router.patch('/:id/complete', restrictTo('receptionist', 'dentist', 'admin'), ctrl.completeEntry);
router.patch('/:id/skip', restrictTo('receptionist', 'dentist', 'admin'), ctrl.skipEntry);

module.exports = router;