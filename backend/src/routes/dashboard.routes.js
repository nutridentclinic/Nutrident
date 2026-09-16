const router = require('express').Router();
const ctrl = require('../controllers/dashboard.controller');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

router.use(protect);
router.get('/admin', restrictTo('admin'), ctrl.getAdminStats);
router.get('/admin/appointments-weekly', restrictTo('admin'), ctrl.getWeeklyAppointments);
router.get('/admin/revenue-monthly', restrictTo('admin'), ctrl.getMonthlyRevenue);
router.get('/admin/top-specialties', restrictTo('admin'), ctrl.getTopSpecialties);
router.get('/dentist/me', restrictTo('dentist'), ctrl.getDentistStats);

module.exports = router;