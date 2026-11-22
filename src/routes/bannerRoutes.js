import express from 'express';
import {
  getActiveBanners,
  getAllBanners,
  createBanner,
  updateBanner,
  deleteBanner,
} from '../controllers/bannerController.js';
import { authVerify } from '../middlewares/authVerify.js';
import { adminProtected } from '../middlewares/adminProtected.js';
import { upload } from '../middlewares/upload.js';
import { validateImage } from '../middlewares/validateImage.js';

const router = express.Router();

// Public: Get active promotional banners for App Home
router.get('/', getActiveBanners);

// Admin-only management endpoints
router.get('/admin', authVerify, adminProtected, getAllBanners);
router.post('/', authVerify, adminProtected, upload.single('image'), validateImage, createBanner);
router.put('/:id', authVerify, adminProtected, upload.single('image'), validateImage, updateBanner);
router.delete('/:id', authVerify, adminProtected, deleteBanner);

export default router;
