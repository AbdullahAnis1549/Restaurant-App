import express from 'express';
import {
  createDishReview,
  getDishReviews,
  deleteReview,
} from '../controllers/reviewController.js';
import { authVerify } from '../middlewares/authVerify.js';

const router = express.Router();

router.get('/:dishId', getDishReviews);
router.post('/:dishId', authVerify, createDishReview);
router.delete('/:id', authVerify, deleteReview);

export default router;
