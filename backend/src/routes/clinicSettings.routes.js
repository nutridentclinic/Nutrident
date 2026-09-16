const router = require('express').Router();
const ctrl = require('../controllers/clinicSettings.controller');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

router.get('/', ctrl.getSettings);
router.patch('/', protect, restrictTo('admin'), ctrl.updateSettings);

module.exports = router;