const router = require('express').Router();
const ctrl = require('../controllers/patient.controller');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');
const upload = require('../middleware/upload.middleware');

router.get('/me', protect, restrictTo('patient'), ctrl.getMyProfile);
router.patch('/me', protect, restrictTo('patient'), ctrl.updateMyProfile);
router.patch('/me/basic-info', protect, restrictTo('patient'), upload('profile-photos').single('photo'), ctrl.updateBasicInfo);
router.post('/me/family-members', protect, restrictTo('patient'), ctrl.addFamilyMember);
router.delete('/me/family-members/:memberId', protect, restrictTo('patient'), ctrl.removeFamilyMember);

router.get('/', protect, restrictTo('admin', 'receptionist'), ctrl.getAllPatients);
router.get('/:id', protect, restrictTo('admin', 'receptionist', 'dentist'), ctrl.getPatientById);

module.exports = router;