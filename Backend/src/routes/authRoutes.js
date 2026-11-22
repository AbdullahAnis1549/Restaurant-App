import { securityStatus,beginMfa,enableMfa,disableMfa,finishMfaLogin,requestEmailVerification,verifyEmail } from '../controllers/accountSecurityController.js';
import express from 'express';
import {
  logoutSession,
  register,
  login,
  getProfile,
  updateProfile,
  getAllUsers,
  getUserOrderHistory,
  toggleBlockUser,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
} from '../controllers/authController.js';
import { authVerify } from '../middlewares/authVerify.js';
import { adminProtected } from '../middlewares/adminProtected.js';

import { googleLogin, linkGoogle } from '../controllers/googleAuthController.js';
import { authLimiter } from '../middlewares/security.js';

const router = express.Router();
for (const path of ['/login','/register','/google','/google/link','/forgot-password','/verify-reset-otp','/reset-password']) router.post(path, authLimiter);

router.post('/mfa/verify', authLimiter, finishMfaLogin);
router.get('/security', authVerify, securityStatus);
router.post('/mfa/setup', authVerify, authLimiter, beginMfa);
router.post('/mfa/enable', authVerify, authLimiter, enableMfa);
router.post('/mfa/disable', authVerify, authLimiter, disableMfa);
router.post('/email/request', authVerify, authLimiter, requestEmailVerification);
router.post('/email/verify', authVerify, authLimiter, verifyEmail);
router.post('/register', register);
router.post('/login', login);
router.post('/google', googleLogin);
router.post('/google/link', authVerify, linkGoogle);
router.post('/forgot-password', forgotPassword);
router.post('/verify-reset-otp', verifyResetOtp);
router.post('/reset-password', resetPassword);
router.post('/logout', authVerify, logoutSession);
router.get('/profile', authVerify, getProfile);
router.put('/profile', authVerify, authLimiter, updateProfile);

// Admin Customer Management
router.get('/users', authVerify, adminProtected, getAllUsers);
router.get('/users/:id/orders', authVerify, adminProtected, getUserOrderHistory);
router.patch('/users/:id/block', authVerify, adminProtected, toggleBlockUser);

export default router;
