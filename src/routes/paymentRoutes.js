import { createPaymentSheet, confirmPaymentSheet } from '../controllers/paymentSheetController.js';
import express from 'express';
import {
  createCheckoutSession,
  confirmCheckoutSession,
  processDirectCardPayment,
  checkoutReturn,
} from '../controllers/paymentController.js';
import { authVerify } from '../middlewares/authVerify.js';

const router = express.Router();

router.post('/payment-sheet', authVerify, createPaymentSheet);
router.post('/confirm-payment-sheet', authVerify, confirmPaymentSheet);
router.post('/create-checkout-session', authVerify, createCheckoutSession);
router.post('/confirm-checkout-session', authVerify, confirmCheckoutSession);
router.get('/checkout-return', checkoutReturn);
router.post('/process-card-payment', authVerify, processDirectCardPayment);

export default router;
