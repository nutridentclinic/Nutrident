const router = require('express').Router();
const ctrl = require('../controllers/staff.controller');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');
const validate = require('../middleware/validate.middleware');
const { createStaffRules } = require('../validators/staff.validator');

router.use(protect, restrictTo('admin'));

router.post('/', createStaffRules, validate, ctrl.createStaff);
router.get('/', ctrl.getAllStaff);
router.patch('/:id/deactivate', ctrl.deactivateStaff);
router.patch('/:id/activate', ctrl.activateStaff);

module.exports = router;