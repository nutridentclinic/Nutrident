const router = require('express').Router();
const ctrl = require('../controllers/appointment.controller');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');
const validate = require('../middleware/validate.middleware');
const { createAppointmentRules, rescheduleRules } = require('../validators/appointment.validator');

router.use(protect);

router.post('/', restrictTo('patient'), createAppointmentRules, validate, ctrl.createAppointment);
router.get('/me', restrictTo('patient'), ctrl.getMyAppointments);
router.get('/dentist/me', restrictTo('dentist'), ctrl.getDentistAppointments);
router.get('/:id', ctrl.getAppointmentById);

router.patch('/:id/confirm', restrictTo('dentist', 'receptionist', 'admin'), ctrl.confirmAppointment);
router.patch('/:id/cancel', ctrl.cancelAppointment); // patient/dentist/admin - ownership checked in controller
router.patch('/:id/reschedule', rescheduleRules, validate, ctrl.rescheduleAppointment);
router.patch('/:id/complete', restrictTo('dentist'), ctrl.completeAppointment);
router.patch('/:id/no-show', restrictTo('dentist', 'receptionist'), ctrl.markNoShow);
router.post('/:id/video/join', ctrl.joinVideoCall);

module.exports = router;