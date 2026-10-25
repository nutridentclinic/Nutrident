const router = require('express').Router();
const ctrl = require('../controllers/dentist.controller');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');
const validate = require('../middleware/validate.middleware');
const upload = require('../middleware/upload.middleware');
const { createDentistRules } = require('../validators/dentist.validator');

// Public - discovery
router.get('/', ctrl.getDentists);
router.get('/nearby', ctrl.getNearbyDentists);
router.get('/admin/all', protect, restrictTo('admin'), ctrl.getAllDentistsAdmin);
router.get('/me/patients', protect, restrictTo('dentist'), ctrl.getMyPatients);
router.get('/primary', ctrl.getPrimaryDentist);
router.get('/primary/slots', ctrl.getPrimarySlots);
router.get('/primary/availability', ctrl.getPrimaryAvailability);
router.get('/:id', ctrl.getDentistById);
router.get('/:id/slots', ctrl.getDentistSlots);
router.get('/:id/availability', ctrl.getDentistAvailability);

// Dentist self-service
router.patch('/me', protect, restrictTo('dentist'), ctrl.updateMyProfile);
router.patch('/me/toggle-active', protect, restrictTo('dentist'), ctrl.toggleActive);
router.patch('/me/unavailable-dates', protect, restrictTo('dentist'), ctrl.setUnavailableDates);

// Admin
router.post('/', protect, restrictTo('admin'), createDentistRules, validate, ctrl.createDentist);
router.patch('/:id/verify', protect, restrictTo('admin'), ctrl.verifyDentist);
router.patch('/:id', protect, restrictTo('admin'), ctrl.adminUpdateDentist);
router.patch('/:id/photo', protect, restrictTo('admin'), upload('profile-photos').single('photo'), ctrl.adminUpdateDentistPhoto);
router.post('/:id/reset-password', protect, restrictTo('admin'), ctrl.adminResetDentistPassword);

module.exports = router;