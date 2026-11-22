import { sendCrudError } from '../utils/crudErrors.js';
import Notification from '../models/Notification.js';

// @route   GET /api/notifications
// @access  Private (authVerify)
export const getNotifications = async (req, res) => {
  try {
    const filter = req.user.role === 'admin'
      ? { recipientRole: 'admin' }
      : { user: req.user._id };

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({
      ...filter,
      isRead: false,
    });

    res.status(200).json({
      success: true,
      count: notifications.length,
      unreadCount,
      data: notifications,
    });
  } catch (error) {
    sendCrudError(res, error);
  }
};

// @route   PUT /api/notifications/:id/read
// @access  Private (authVerify)
export const markNotificationAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOne({ _id: req.params.id, ...(req.user.role === 'admin' ? { recipientRole: 'admin' } : { user: req.user._id, recipientRole: 'user' }) });
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    notification.isRead = true;
    await notification.save();

    res.status(200).json({ success: true, message: 'Notification marked as read', data: notification });
  } catch (error) {
    sendCrudError(res, error);
  }
};

// @route   PUT /api/notifications/read-all
// @access  Private (authVerify)
export const markAllNotificationsRead = async (req, res) => {
  try {
    const filter = req.user.role === 'admin'
      ? { recipientRole: 'admin', isRead: false }
      : { user: req.user._id, isRead: false };

    await Notification.updateMany(filter, { $set: { isRead: true } });

    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    sendCrudError(res, error);
  }
};

// @route   DELETE /api/notifications/:id
// @access  Private (authVerify)
export const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findOne({ _id: req.params.id, ...(req.user.role === 'admin' ? { recipientRole: 'admin' } : { user: req.user._id, recipientRole: 'user' }) });
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    await notification.deleteOne();
    res.status(200).json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    sendCrudError(res, error);
  }
};
