const router = require('express').Router();
const ctrl = require('../controllers/coupon.controller');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

router.use(protect);
router.post('/validate', ctrl.validateCoupon);
router.post('/', restrictTo('admin'), ctrl.createCoupon);
router.get('/', restrictTo('admin'), ctrl.getAllCoupons);
router.patch('/:id', restrictTo('admin'), ctrl.updateCoupon);
router.delete('/:id', restrictTo('admin'), ctrl.deleteCoupon);

module.exports = router;