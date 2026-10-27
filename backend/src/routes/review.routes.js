const router = require('express').Router();
const ctrl = require('../controllers/review.controller');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

router.get('/dentist/:dentistId', ctrl.getDentistReviews);
router.get('/', protect, restrictTo('admin'), ctrl.getAllReviews);
router.post('/', protect, restrictTo('patient'), ctrl.createReview);
router.post('/:id/reply', protect, restrictTo('dentist'), ctrl.replyToReview);
router.patch('/:id/toggle-hide', protect, restrictTo('admin'), ctrl.toggleHideReview);

module.exports = router;