const router = require('express').Router();
const ctrl = require('../controllers/dentist.controller');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');
const validate = require('../middleware/validate.middleware');
const { createDentistRules } = require('../validators/dentist.validator');

// Public - discovery
router.get('/', ctrl.getDentists);
router.get('/nearby', ctrl.getNearbyDentists);
router.get('/:id', ctrl.getDentistById);
router.get('/:id/slots', ctrl.getDentistSlots);

// Dentist self-service
router.patch('/me', protect, restrictTo('dentist'), ctrl.updateMyProfile);
router.patch('/me/toggle-active', protect, restrictTo('dentist'), ctrl.toggleActive);
router.patch('/me/unavailable-dates', protect, restrictTo('dentist'), ctrl.setUnavailableDates);

// Admin
router.post('/', protect, restrictTo('admin'), createDentistRules, validate, ctrl.createDentist);
router.patch('/:id/verify', protect, restrictTo('admin'), ctrl.verifyDentist);

module.exports = router;