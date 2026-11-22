import express from 'express';
import { authVerify } from '../middlewares/authVerify.js';
import { adminProtected } from '../middlewares/adminProtected.js';
import { getAdminDashboard } from '../controllers/adminDashboardController.js';
const router = express.Router();
router.get('/dashboard', authVerify, adminProtected, getAdminDashboard);
export default router;
