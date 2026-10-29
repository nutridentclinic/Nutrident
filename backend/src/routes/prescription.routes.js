const router = require('express').Router();
const ctrl = require('../controllers/prescription.controller');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');
const validate = require('../middleware/validate.middleware');
const { createPrescriptionRules, voidPrescriptionRules } = require('../validators/prescription.validator');

router.use(protect);
router.post('/', restrictTo('dentist'), createPrescriptionRules, validate, ctrl.createPrescription);
router.get('/me', restrictTo('patient'), ctrl.getMyPrescriptions);
router.get('/patient/:patientId', restrictTo('dentist', 'receptionist', 'admin'), ctrl.getPatientPrescriptions);
router.get('/:id', ctrl.getPrescriptionById);
router.get('/:id/pdf', ctrl.downloadPrescriptionPDF);
router.patch('/:id/void', restrictTo('dentist', 'admin'), voidPrescriptionRules, validate, ctrl.voidPrescription);

module.exports = router;
