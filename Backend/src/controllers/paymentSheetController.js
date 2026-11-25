import { stripeConfiguration } from '../utils/stripeConfig.js';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import { getStripe, markCheckoutPaid, markPaymentIntentPaid } from './paymentController.js';

const keyIsCompatible = key => /^pk_(test|live)_/.test(key || '') && key.startsWith(stripeConfiguration().secretKey.startsWith('sk_live_') ? 'pk_live_' : 'pk_test_');
export function createPaymentSheetControllers(stripeFactory = getStripe, confirmIntent = markPaymentIntentPaid, confirmCheckout = markCheckoutPaid) {
 return {
  createPaymentSheet: async (req, res) => {
   try {
    const stripe = stripeFactory(), publishableKey = stripeConfiguration().publishableKey;
    if (!stripe || !keyIsCompatible(publishableKey)) {
     if (res.locals) res.locals.safeError = true;
     return res.status(503).json({ code: 'PAYMENT_CONFIGURATION_MISSING', message: 'Card payment setup is incomplete. The administrator must configure matching Stripe test secret and publishable keys on the server. Cash on delivery is available.' });
    }
    if (!mongoose.isValidObjectId(req.body.orderId)) return res.status(400).json({ message: 'Valid order required.' });
    const order = await Order.findById(req.body.orderId);
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    if (String(order.user) !== String(req.user._id)) return res.status(403).json({ message: 'Not authorized to pay for this order.' });
    if (order.paymentMethod !== 'Stripe / Card') return res.status(400).json({ message: 'This is not a card order.' });
    if (order.isPaid) return res.json({ paid: true, orderId: String(order._id), ...(order.paymentResult?.id?.startsWith('pi_') ? { paymentIntentId: order.paymentResult.id } : {}) });
    if (['Cancelled', 'Rejected', 'Delivered'].includes(order.status)) return res.status(400).json({ message: 'This order cannot be paid.' });
    const amount = Math.round(order.grandTotal * 100);
    if (!Number.isSafeInteger(amount) || amount <= 0) return res.status(400).json({ message: 'A positive order total is required for card payment.' });
    const previous = order.paymentResult?.id;
    let intent;
    if (previous?.startsWith('cs_')) {
     const checkout = await stripe.checkout.sessions.retrieve(previous);
     if (checkout.payment_status === 'paid') {
      if (!await confirmCheckout(checkout)) return res.status(409).json({ message: 'Payment does not match the order.' });
      return res.json({ paid: true, orderId: String(order._id) });
     }
     if (checkout.status === 'open') await stripe.checkout.sessions.expire(previous);
    }
    if (previous?.startsWith('pi_')) {
     intent = await stripe.paymentIntents.retrieve(previous);
     if (intent.metadata?.orderId !== String(order._id) || intent.metadata?.integration !== 'mobile_payment_sheet' || intent.amount !== amount || intent.currency !== 'pkr') return res.status(409).json({ message: 'Payment does not match the order. Please contact support.' });
     if (intent.status === 'succeeded') {
      if (!await confirmIntent(intent)) return res.status(409).json({ message: 'Payment could not be verified.' });
      return res.json({ paid: true, orderId: String(order._id), paymentIntentId: intent.id });
     }
     if (intent.status === 'processing') return res.status(409).json({ message: 'Payment is processing. Check your orders before paying again.' });
     if (intent.status === 'canceled') intent = null;
    }
    if (!intent) {
     intent = await stripe.paymentIntents.create({ amount, currency: 'pkr', receipt_email: order.customerEmail, metadata: { orderId: String(order._id), integration: 'mobile_payment_sheet' } }, { idempotencyKey: 'mobile_pi_v1_' + String(order._id) + '_' + (previous || 'initial') });
     order.paymentResult = { id: intent.id, status: intent.status, payment_method_types: ['card'] };
     await order.save();
    }
    if (!intent.client_secret) throw new Error('Missing Stripe client secret.');
    return res.json({ paid: false, orderId: String(order._id), paymentIntentId: intent.id, clientSecret: intent.client_secret, publishableKey, testMode: !intent.livemode });
   } catch (error) {
    console.error('[PaymentSheet setup]', error.type || error.name, error.code || '');
    return res.status(502).json({ message: 'Could not prepare card payment. Your order is unpaid; please try again.' });
   }
  },
  confirmPaymentSheet: async (req, res) => {
   try {
    const stripe = stripeFactory();
    if (!stripe) return res.status(503).json({ message: 'Stripe is not configured.' });
    if (typeof req.body.paymentIntentId !== 'string' || !/^pi_[a-zA-Z0-9_]+$/.test(req.body.paymentIntentId)) return res.status(400).json({ message: 'Valid payment required.' });
    const intent = await stripe.paymentIntents.retrieve(req.body.paymentIntentId);
    const order = intent.metadata?.orderId ? await Order.findById(intent.metadata.orderId) : null;
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    if (String(order.user) !== String(req.user._id)) return res.status(403).json({ message: 'Not authorized to confirm this payment.' });
    if (intent.status !== 'succeeded') return res.status(409).json({ code: 'PAYMENT_PENDING', message: 'Payment has not completed. Your cart is saved. Resume payment from Orders.' });
    const paid = await confirmIntent(intent);
    if (!paid) return res.status(409).json({ message: 'Payment amount, currency or reference does not match the order.' });
    return res.json({ success: true, data: { orderId: String(paid._id), isPaid: true } });
   } catch (error) {
    console.error('[PaymentSheet confirmation]', error.type || error.name, error.code || '');
    return res.status(502).json({ message: 'Could not verify payment. Check your orders before trying again.' });
   }
  },
 };
}
export const { createPaymentSheet, confirmPaymentSheet } = createPaymentSheetControllers();
