import express from 'express';
import {
  getAllCategories,
  getAdminCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/categoryController.js';
import { authVerify } from '../middlewares/authVerify.js';
import { adminProtected } from '../middlewares/adminProtected.js';
import { upload } from '../middlewares/upload.js';

const router = express.Router();

// Public: Get active categories
router.get('/', getAllCategories);

// Admin-only endpoints
router.get('/admin', authVerify, adminProtected, getAdminCategories);
router.post('/', authVerify, adminProtected, upload.single('image'), createCategory);
router.put('/:id', authVerify, adminProtected, upload.single('image'), updateCategory);
router.delete('/:id', authVerify, adminProtected, deleteCategory);

export default router;
