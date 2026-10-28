const router = require('express').Router();
const ctrl = require('../controllers/treatmentPlan.controller');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

const validate = require('../middleware/validate.middleware');
const { createTreatmentPlanRules } = require('../validators/treatmentPlan.validator');

router.use(protect);
router.post('/', restrictTo('dentist'), createTreatmentPlanRules, validate, ctrl.createPlan);
router.get('/me', restrictTo('patient'), ctrl.getMyPlans);
router.get('/patient/:patientId', restrictTo('dentist', 'receptionist', 'admin'), ctrl.getPatientPlans);
router.patch('/:id/steps/:stepId', restrictTo('dentist'), ctrl.updateStep);

module.exports = router;