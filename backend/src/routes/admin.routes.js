const router = require('express').Router();
const ctrl = require('../controllers/admin.controller');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

router.use(protect, restrictTo('admin'));

router.get('/system-status', ctrl.getSystemStatus);

module.exports = router;
