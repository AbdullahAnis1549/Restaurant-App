import { stripeConfiguration } from '../utils/stripeConfig.js';
import Stripe from 'stripe';
import Order from '../models/Order.js';
import Notification from '../models/Notification.js';
import { sendOrderConfirmationEmail } from '../utils/nodemailer.js';
export const getStripe = () => {
 const { secretKey: key, mode } = stripeConfiguration();
 // Portfolio deployments accept test keys unless live mode is explicitly enabled.
 if (mode !== 'live' && !key?.startsWith('sk_test_')) return null;
 return key && !key.startsWith('sk_test_placeholder') ? new Stripe(key) : null;
};
export async function markCheckoutPaid(session, notify = notifyPayment, attempt = 0) {
 if (session.payment_status !== 'paid' || !session.metadata?.orderId) return null;
 const existing = await Order.findById(session.metadata.orderId);
 if (!existing || existing.paymentMethod !== 'Stripe / Card' || session.currency !== 'pkr' || session.amount_total !== Math.round(existing.grandTotal * 100)) return null;
 const closed = ['Cancelled', 'Rejected', 'Delivered'].includes(existing.status);
 const order = await Order.findOneAndUpdate({ _id: existing._id, status: existing.status, paymentMethod: 'Stripe / Card', isPaid: { $ne: true } }, { $set: {
  isPaid: true, paymentStatus: 'Paid', paidAt: new Date(), status: closed ? existing.status : 'Confirmed',
  paymentResult: { id: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || session.id, status: 'succeeded', payment_method_types: ['card'] },
  ...(!closed ? { 'timeline.0.status': 'Confirmed', 'timeline.0.timestamp': new Date(), 'timeline.0.description': 'Stripe verified the card payment.', 'timeline.0.completed': true } : {}),
 } }, { new: true });
 if (!order) { const paid = await Order.findOne({ _id: existing._id, paymentMethod: 'Stripe / Card', isPaid: true }); if (paid) return paid; return attempt < 2 ? markCheckoutPaid(session, notify, attempt + 1) : null; }
 notify(order);
 return order;
}
// Only the current mobile intent can complete this order.
export async function markPaymentIntentPaid(intent, confirmPaid = markCheckoutPaid) {
 if (intent.status !== 'succeeded' || intent.metadata?.integration !== 'mobile_payment_sheet') return null;
 const order = intent.metadata?.orderId ? await Order.findById(intent.metadata.orderId) : null;
 if (!order || order.paymentResult?.id !== intent.id || intent.amount_received !== intent.amount) return null;
 return confirmPaid({ id: intent.id, payment_intent: intent.id, payment_status: 'paid', currency: intent.currency, amount_total: intent.amount_received, metadata: intent.metadata });
}
function notifyPayment(order) {
 if (!['Cancelled', 'Rejected'].includes(order.status)) void sendOrderConfirmationEmail(order).catch(error => console.error('[Payment email]', error.message));
 void Notification.create({ title: ['Cancelled', 'Rejected'].includes(order.status) ? 'Payment received for closed order: review required' : 'New paid order', message: 'Stripe confirmed payment for order #' + String(order._id).slice(-6).toUpperCase(), type: 'order', recipientRole: 'admin', order: order._id }).catch(error => console.error('[Payment notification]', error.message));
}
function redirectUrls(orderId, platform) {
 const native = platform === 'android' || platform === 'ios';
 const configured = native ? process.env.PUBLIC_API_URL : process.env.FRONTEND_URL || (process.env.NODE_ENV !== 'production' ? 'http://localhost:8081' : '');
 if (!configured) throw new Error(native ? 'PUBLIC_API_URL must be configured for mobile checkout returns.' : 'FRONTEND_URL must be configured for checkout returns.');
 const base = new URL(configured);
 if (!['http:', 'https:'].includes(base.protocol) || (process.env.NODE_ENV === 'production' && base.protocol !== 'https:')) throw new Error('Checkout return URL must use HTTPS in production.');
 const success = new URL(native ? base.pathname.replace(/\/$/, '') + '/payment/checkout-return' : '/payment-result', base.origin);
 success.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}'); success.searchParams.set('order_id', String(orderId));
 const cancel = new URL(success); cancel.searchParams.delete('session_id'); cancel.searchParams.set('cancelled', '1');
 return { success_url: success.toString().replace('%7BCHECKOUT_SESSION_ID%7D', '{CHECKOUT_SESSION_ID}'), cancel_url: cancel.toString() };
}
export function createPaymentControllers(stripeFactory = getStripe, confirmPaid = markCheckoutPaid) {
 return {
  createCheckoutSession: async (req, res) => {
   try {
    const stripe = stripeFactory(); if (!stripe) return res.status(503).json({ message: 'Card payments are unavailable until Stripe is configured. Cash on delivery is available.' });
    const order = req.body.orderId ? await Order.findById(req.body.orderId) : null;
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    if (String(order.user) !== String(req.user._id)) return res.status(403).json({ message: 'Not authorized to pay for this order.' });
    if (order.paymentMethod !== 'Stripe / Card') return res.status(400).json({ message: 'This order is not a card order.' });
    if (['Cancelled', 'Rejected', 'Delivered'].includes(order.status) && !order.isPaid) return res.status(400).json({ message: 'This order cannot be paid.' });
    if (order.isPaid) return res.json({ success: true, paid: true, orderId: String(order._id) });
    const previous = order.paymentResult?.id;
    if (previous?.startsWith('pi_')) return res.status(409).json({ message: 'Resume this payment inside the mobile app.' });
    if (previous?.startsWith('cs_')) {
     const existing = await stripe.checkout.sessions.retrieve(previous);
     if (existing.payment_status === 'paid') { const paid = await confirmPaid(existing); if (!paid) return res.status(409).json({ message: 'Payment amount does not match this order.' }); return res.json({ success: true, paid: true, orderId: String(order._id) }); }
     if (existing.status === 'open' && existing.url) return res.json({ success: true, url: existing.url, sessionId: existing.id });
    }
    const urls = redirectUrls(order._id, req.body.platform);
    const session = await stripe.checkout.sessions.create({ mode: 'payment', client_reference_id: String(order._id), line_items: [{ price_data: { currency: 'pkr', product_data: { name: 'Zaykora order #' + String(order._id).slice(-6).toUpperCase() }, unit_amount: Math.round(order.grandTotal * 100) }, quantity: 1 }], customer_email: order.customerEmail, metadata: { orderId: String(order._id) }, payment_intent_data: { metadata: { orderId: String(order._id) } }, ...urls }, { idempotencyKey: 'checkout_v2_' + String(order._id) + '_' + (previous || 'initial') });
    if (!session.url) throw new Error('Stripe did not return a checkout URL.');
    order.paymentResult = { id: session.id, status: 'pending', payment_method_types: ['card'] }; await order.save();
    return res.json({ success: true, url: session.url, sessionId: session.id });
   } catch (error) { console.error('[Stripe checkout]', error.code || error.message); return res.status(500).json({ message: 'Could not open secure checkout. Please try again or choose cash on delivery.' }); }
  },
  confirmCheckoutSession: async (req, res) => {
   try {
    const stripe = stripeFactory(); if (!stripe) return res.status(503).json({ message: 'Stripe is not configured.' });
    if (typeof req.body.sessionId !== 'string' || !req.body.sessionId.startsWith('cs_')) return res.status(400).json({ message: 'Valid checkout session required.' });
    const session = await stripe.checkout.sessions.retrieve(req.body.sessionId);
    const order = session.metadata?.orderId ? await Order.findById(session.metadata.orderId) : null;
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    if (String(order.user) !== String(req.user._id)) return res.status(403).json({ message: 'Not authorized to confirm this payment.' });
    if (session.payment_status !== 'paid') return res.status(400).json({ code: 'PAYMENT_PENDING', message: 'Payment has not completed. Your cart is still saved.' });
    const paid = await confirmPaid(session);
    if (!paid) return res.status(409).json({ message: 'Payment amount or currency does not match this order.' });
    return res.json({ success: true, data: { orderId: String(paid._id), isPaid: true } });
   } catch (error) { console.error('[Stripe confirmation]', error.code || error.message); return res.status(500).json({ message: 'Unable to verify payment. Check your order before trying to pay again.' }); }
  },
  stripeWebhook: async (req, res) => {
   const stripe = stripeFactory(); if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).send('Stripe webhook is not configured.');
   let event;
   try { event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET); } catch { return res.status(400).send('Invalid Stripe webhook signature.'); }
   if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type) && event.data.object.payment_status === 'paid') {
    try { if (!await confirmPaid(event.data.object)) return res.status(409).send('Payment does not match an order.'); }
    catch { return res.status(500).send('Could not process payment.'); }
   }
   if (event.type === 'payment_intent.succeeded' && event.data.object.metadata?.integration === 'mobile_payment_sheet') {
    try { if (!await markPaymentIntentPaid(event.data.object, confirmPaid)) return res.status(409).send('Payment does not match an order.'); }
    catch { return res.status(500).send('Could not process payment.'); }
   }
   return res.json({ received: true });
  },
 };
}
export const { createCheckoutSession, confirmCheckoutSession, stripeWebhook } = createPaymentControllers();
export const processDirectCardPayment = (_req, res) => res.status(410).json({ success: false, message: 'Direct card processing has been removed. Use secure Stripe Checkout.' });
export const checkoutReturn = (req, res) => {
 const params = new URLSearchParams();
 for (const key of ['session_id', 'order_id', 'cancelled']) if (typeof req.query[key] === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(req.query[key])) params.set(key, req.query[key]);
 const target = 'frontend://payment-result?' + params.toString();
 res.setHeader('Cache-Control', 'no-store');
 return res.type('html').send('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Zaykora checkout</title></head><body><h1>Return to Zaykora</h1><p>Open the app to verify your payment status. If you cancelled, your cart is still saved.</p><p><a href="' + target.replace(/&/g, '&amp;') + '">Open Zaykora app</a></p><p>You can also return to the app manually.</p></body></html>');
};
