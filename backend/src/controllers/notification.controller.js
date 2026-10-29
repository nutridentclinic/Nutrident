const Notification = require('../models/Notification');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { success } = require('../utils/response');

// @route GET /api/notifications/me
exports.getMyNotifications = catchAsync(async (req, res) => {
  const { unreadOnly, page = 1, limit = 20 } = req.query;
  const filter = { user: req.user._id };
  if (unreadOnly === 'true') filter.isRead = false;

  const currentPage = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (currentPage - 1) * pageSize;

  const [notifications, unreadCount, total] = await Promise.all([
    Notification.find(filter).sort('-createdAt').skip(skip).limit(pageSize),
    Notification.countDocuments({ user: req.user._id, isRead: false }),
    Notification.countDocuments(filter),
  ]);

  success(res, 200, 'Notifications fetched.', notifications, { unreadCount, total, page: currentPage, limit: pageSize });
});

// @route PATCH /api/notifications/:id/read
exports.markAsRead = catchAsync(async (req, res, next) => {
  const notif = await Notification.findOne({ _id: req.params.id, user: req.user._id });
  if (!notif) return next(new AppError('Notification not found.', 404));
  if (!notif.isRead) {
    notif.isRead = true;
    await notif.save();
  }
  success(res, 200, 'Notification marked as read.', notif);
});

// @route PATCH /api/notifications/read-all
exports.markAllAsRead = catchAsync(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, isRead: false }, { isRead: true });
  success(res, 200, 'All notifications marked as read.');
});

// @route PUT /api/notifications/fcm-token  (app calls this once it has a device FCM token)
exports.updateFcmToken = catchAsync(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { fcmToken: req.body.fcmToken });
  success(res, 200, 'Device token saved.');
});

// @route GET /api/notifications/preferences
exports.getPreferences = catchAsync(async (req, res) => {
  success(res, 200, 'Preferences fetched.', req.user.notificationPreferences);
});

// @route PATCH /api/notifications/preferences
exports.updatePreferences = catchAsync(async (req, res) => {
  const updates = {};
  if (typeof req.body.push === 'boolean') updates['notificationPreferences.push'] = req.body.push;
  if (typeof req.body.email === 'boolean') updates['notificationPreferences.email'] = req.body.email;

  const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { returnDocument: 'after' }).select(
    'notificationPreferences'
  );
  success(res, 200, 'Preferences updated.', user.notificationPreferences);
});
