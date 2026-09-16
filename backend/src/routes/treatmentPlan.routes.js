const router = require('express').Router();
const ctrl = require('../controllers/treatmentPlan.controller');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

router.use(protect);
router.post('/', restrictTo('dentist'), ctrl.createPlan);
router.get('/me', restrictTo('patient'), ctrl.getMyPlans);
router.get('/patient/:patientId', restrictTo('dentist', 'receptionist', 'admin'), ctrl.getPatientPlans);
router.patch('/:id/steps/:stepId', restrictTo('dentist'), ctrl.updateStep);

module.exports = router;