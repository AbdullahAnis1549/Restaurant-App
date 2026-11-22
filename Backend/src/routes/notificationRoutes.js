import express from 'express';
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsRead,
  deleteNotification,
} from '../controllers/notificationController.js';
import { authVerify } from '../middlewares/authVerify.js';

import { adminProtected } from '../middlewares/adminProtected.js';
import { registerDevice, unregisterDevice, getCampaigns, createCampaign, getRecipients } from '../controllers/pushController.js';

const router = express.Router();

router.use(authVerify);

router.post('/devices', registerDevice);
router.post('/devices/unregister', unregisterDevice);
router.get('/campaigns/recipients', adminProtected, getRecipients);
router.get('/campaigns', adminProtected, getCampaigns);
router.post('/campaigns', adminProtected, createCampaign);
router.get('/', getNotifications);
router.put('/read-all', markAllNotificationsRead);
router.put('/:id/read', markNotificationAsRead);
router.delete('/:id', deleteNotification);

export default router;
