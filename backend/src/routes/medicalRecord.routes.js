const router = require('express').Router();
const ctrl = require('../controllers/medicalRecord.controller');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');
const upload = require('../middleware/upload.middleware');

router.use(protect);
router.post('/', upload('medical-records').single('file'), ctrl.uploadRecord);
router.get('/me', restrictTo('patient'), ctrl.getMyRecords);
router.get('/patient/:patientId', restrictTo('dentist', 'receptionist', 'admin'), ctrl.getPatientRecords);
router.delete('/:id', ctrl.deleteRecord);

module.exports = router;