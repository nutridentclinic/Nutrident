const Notification = require('../models/Notification');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');

// @route GET /api/notifications/me
exports.getMyNotifications = catchAsync(async (req, res) => {
  const { unreadOnly, page = 1, limit = 20 } = req.query;
  const filter = { user: req.user._id };
  if (unreadOnly === 'true') filter.isRead = false;

  const skip = (Number(page) - 1) * Number(limit);
  const [notifications, unreadCount] = await Promise.all([
    Notification.find(filter).sort('-createdAt').skip(skip).limit(Number(limit)),
    Notification.countDocuments({ user: req.user._id, isRead: false }),
  ]);

  success(res, 200, 'Notifications fetched.', notifications, { unreadCount });
});

// @route PATCH /api/notifications/:id/read
exports.markAsRead = catchAsync(async (req, res) => {
  await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { isRead: true });
  success(res, 200, 'Notification marked as read.');
});

// @route PATCH /api/notifications/read-all
exports.markAllAsRead = catchAsync(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, isRead: false }, { isRead: true });
  success(res, 200, 'All notifications marked as read.');
});

// @route PUT /api/notifications/fcm-token  (app calls this once it has a device FCM token)
// Kept ready for when push notifications are enabled - currently just stores the token.
exports.updateFcmToken = catchAsync(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { fcmToken: req.body.fcmToken });
  success(res, 200, 'Device token saved.');
});


exports.getPreferences = catchAsync(async (req, res) => {
  success(res, 200, 'Preferences fetched.', req.user.notificationPreferences);
});

exports.updatePreferences = catchAsync(async (req, res) => {
  const updates = {};
  if (typeof req.body.push === 'boolean') updates['notificationPreferences.push'] = req.body.push;
  if (typeof req.body.email === 'boolean') updates['notificationPreferences.email'] = req.body.email;

  const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select('notificationPreferences');
  success(res, 200, 'Preferences updated.', user.notificationPreferences);
});