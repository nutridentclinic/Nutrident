const router = require('express').Router();
const ctrl = require('../controllers/treatment.controller');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

router.get('/', ctrl.getTreatments);
router.post('/', protect, restrictTo('admin'), ctrl.createTreatment);
router.patch('/:id', protect, restrictTo('admin'), ctrl.updateTreatment);
router.delete('/:id', protect, restrictTo('admin'), ctrl.deleteTreatment);

module.exports = router;