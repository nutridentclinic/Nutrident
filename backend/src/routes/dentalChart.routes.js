const router = require('express').Router();
const ctrl = require('../controllers/dentalChart.controller');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');
const validate = require('../middleware/validate.middleware');
const { updateToothRules } = require('../validators/dentalChart.validator');

router.use(protect);
router.get('/:patientId', ctrl.getChart);
router.patch('/:patientId/tooth/:toothNumber', restrictTo('dentist'), updateToothRules, validate, ctrl.updateTooth);

module.exports = router;