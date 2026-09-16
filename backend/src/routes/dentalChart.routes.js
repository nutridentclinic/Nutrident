const router = require('express').Router();
const ctrl = require('../controllers/dentalChart.controller');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

router.use(protect);
router.get('/:patientId', ctrl.getChart);
router.patch('/:patientId/tooth/:toothNumber', restrictTo('dentist'), ctrl.updateTooth);

module.exports = router;