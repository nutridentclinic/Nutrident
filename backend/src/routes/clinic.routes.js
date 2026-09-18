const router = require('express').Router();
const ctrl = require('../controllers/clinic.controller');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');
const validate = require('../middleware/validate.middleware');
const { createClinicRules } = require('../validators/clinic.validator');

router.get('/', ctrl.getClinics);
router.get('/nearby', ctrl.getNearbyClinics);
router.get('/:id', ctrl.getClinicById);
router.get('/:id/dentists', ctrl.getClinicDentists);

router.post('/', protect, restrictTo('admin'), createClinicRules, validate, ctrl.createClinic);
router.patch('/:id', protect, restrictTo('admin'), ctrl.updateClinic);
router.patch('/:id/assign-dentist', protect, restrictTo('admin'), ctrl.assignDentist);
router.delete('/:id', protect, restrictTo('admin'), ctrl.deactivateClinic);

module.exports = router;