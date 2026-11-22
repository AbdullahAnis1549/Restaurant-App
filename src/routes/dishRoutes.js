import express from 'express';
import {
  getAllDishes,
  getDishById,
  createDish,
  updateDish,
  deleteDish,
} from '../controllers/dishController.js';
import { authVerify } from '../middlewares/authVerify.js';
import { adminProtected } from '../middlewares/adminProtected.js';
import { upload } from '../middlewares/upload.js';
import { validateImage } from '../middlewares/validateImage.js';

const router = express.Router();

// Public routes: Browsing menu and dish details
router.get('/', getAllDishes);
router.get('/:id', getDishById);

// Admin-protected routes: create, update, delete
router.post(
  '/',
  authVerify,
  adminProtected,
  upload.single('image'),
  validateImage,
  createDish
);

router.put(
  '/:id',
  authVerify,
  adminProtected,
  upload.single('image'),
  validateImage,
  updateDish
);

router.delete(
  '/:id',
  authVerify,
  adminProtected,
  deleteDish
);

export default router;
