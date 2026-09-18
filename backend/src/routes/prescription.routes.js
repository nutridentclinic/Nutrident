const router = require('express').Router();
const ctrl = require('../controllers/prescription.controller');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');


router.use(protect);
router.post('/', restrictTo('dentist'), ctrl.createPrescription);
router.get('/me', restrictTo('patient'), ctrl.getMyPrescriptions);
router.get('/patient/:patientId', restrictTo('dentist', 'receptionist', 'admin'), ctrl.getPatientPrescriptions);
router.get('/:id', ctrl.getPrescriptionById);
router.get('/:id/pdf', ctrl.downloadPrescriptionPDF);

module.exports = router;