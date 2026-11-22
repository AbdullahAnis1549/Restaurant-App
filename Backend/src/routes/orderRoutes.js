import express from 'express';
import {
  createOrder,
  quoteOrder,
  getMyOrders,
  getOrderById,
  getAllOrders,
  updateOrderStatus,
  applyPromo,
  getOrderReports,
} from '../controllers/orderController.js';
import { authVerify } from '../middlewares/authVerify.js';
import { adminProtected } from '../middlewares/adminProtected.js';
import { orderLimiter } from '../middlewares/security.js';

const router = express.Router();

// Validate Promo Code
router.post('/apply-promo', authVerify, applyPromo);

// Order creation strictly requires authentication (authVerify) and rate limiting
router.post('/quote', authVerify, quoteOrder);
router.post('/', authVerify, orderLimiter, createOrder);

// Customer personal order history
router.get('/my-orders', authVerify, getMyOrders);

// Admin Analytics & Reports with Date Filters (Must be before /:id)
router.get('/analytics/reports', authVerify, adminProtected, getOrderReports);

// Admin-only order management list
router.get('/', authVerify, adminProtected, getAllOrders);

// Single order details & live tracking
router.get('/:id', authVerify, getOrderById);

// Admin updates order status and COD payment collection
router.put('/:id/status', authVerify, adminProtected, updateOrderStatus);

export default router;
