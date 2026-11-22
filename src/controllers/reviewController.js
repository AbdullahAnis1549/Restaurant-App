import { sendCrudError } from '../utils/crudErrors.js';
import Review from '../models/Review.js';
import Dish from '../models/Dish.js';

// Helper function to update average rating on Dish
const updateDishRating = async (dishId) => {
  const reviews = await Review.find({ dish: dishId });
  const numReviews = reviews.length;
  const rating =
    numReviews > 0
      ? Number((reviews.reduce((acc, item) => item.rating + acc, 0) / numReviews).toFixed(1))
      : 5.0;

  await Dish.findByIdAndUpdate(dishId, { rating, numReviews });
};

// @route   POST /api/reviews/:dishId
// @access  Private (authVerify)
export const createDishReview = async (req, res) => {
  try {
    const { dishId } = req.params;
    const { rating, comment } = req.body;
    if (!Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5 || typeof comment !== 'string' || !comment.trim() || comment.length > 2000) return res.status(400).json({ message: 'Provide a rating from 1 to 5 and a comment up to 2000 characters.' });

    const dish = await Dish.findById(dishId);
    if (!dish) {
      return res.status(404).json({ success: false, message: 'Dish not found' });
    }

    // Check if already reviewed
    const alreadyReviewed = await Review.findOne({
      dish: dishId,
      user: req.user._id,
    });

    if (alreadyReviewed) {
      // Update existing review
      alreadyReviewed.rating = Number(rating);
      alreadyReviewed.comment = comment;
      await alreadyReviewed.save();
      await updateDishRating(dishId);

      return res.status(200).json({
        success: true,
        message: 'Review updated successfully',
        data: alreadyReviewed,
      });
    }

    const review = await Review.create({
      dish: dishId,
      user: req.user._id,
      userName: req.user.name,
      rating: Number(rating),
      comment,
    });

    await updateDishRating(dishId);

    res.status(201).json({
      success: true,
      message: 'Review added successfully',
      data: review,
    });
  } catch (error) {
    sendCrudError(res, error);
  }
};

// @route   GET /api/reviews/:dishId
// @access  Public
export const getDishReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ dish: req.params.dishId })
      .populate('user', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reviews.length,
      data: reviews.map(review => ({ _id: review._id, dish: review.dish, userName: review.userName || review.user?.name || 'Customer', rating: review.rating, comment: review.comment, createdAt: review.createdAt, updatedAt: review.updatedAt })),
    });
  } catch (error) {
    sendCrudError(res, error);
  }
};

// @route   DELETE /api/reviews/:id
// @access  Private (Author or Admin)
export const deleteReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    // Check authorization: must be review author or admin
    if (review.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this review' });
    }

    const dishId = review.dish;
    await review.deleteOne();
    await updateDishRating(dishId);

    res.status(200).json({ success: true, message: 'Review deleted successfully' });
  } catch (error) {
    sendCrudError(res, error);
  }
};
