import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Order from '../src/models/Order.js';
import { createPaymentControllers, markCheckoutPaid, processDirectCardPayment } from '../src/controllers/paymentController.js';
const userId = new mongoose.Types.ObjectId(), otherId = new mongoose.Types.ObjectId(), orderId = new mongoose.Types.ObjectId();
const response = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, send(value) { this.body = value; return this; } });
const order = overrides => ({ _id: orderId, user: userId, paymentMethod: 'Stripe / Card', grandTotal: 1500, isPaid: false, status: 'Placed', customerEmail: 'guest@example.test', save: async () => {}, ...overrides });
const session = overrides => ({ id: 'cs_test_session', url: 'https://checkout.stripe.com/c/pay/test-session', metadata: { orderId: String(orderId) }, amount_total: 150000, currency: 'pkr', payment_status: 'paid', payment_intent: 'pi_test_verified', ...overrides });
test('legacy direct-card endpoint can never mark an order paid', () => {
 const res = response(); processDirectCardPayment({ body: { cardNumber: 'fake-card', orderId } }, res); assert.equal(res.statusCode, 410); assert.equal(res.body.success, false);
});
test('missing Stripe setup fails explicitly, without pretending a charge succeeded', async () => {
 const res = response(); await createPaymentControllers(() => null).createCheckoutSession({ body: { orderId }, user: { _id: userId } }, res); assert.equal(res.statusCode, 503);
});
test('checkout creation and confirmation enforce order ownership', async t => {
 t.mock.method(Order, 'findById', async () => order({ user: otherId }));
 const stripe = { checkout: { sessions: { retrieve: async () => session(), create: async () => { throw new Error('Must not create checkout'); } } } };
 const handlers = createPaymentControllers(() => stripe);
 for (const [handler, body] of [[handlers.createCheckoutSession, { orderId }], [handlers.confirmCheckoutSession, { sessionId: 'cs_test_session' }]]) {
  const res = response(); await handler({ body, user: { _id: userId } }, res); assert.equal(res.statusCode, 403);
 }
});
test('unpaid, wrong-amount and wrong-currency sessions never mark an order paid', async t => {
 t.mock.method(Order, 'findById', async () => order());
 t.mock.method(Order, 'findOneAndUpdate', async () => { throw new Error('Must not update payment'); });
 for (const fields of [{ payment_status: 'unpaid' }, { amount_total: 100 }, { currency: 'usd' }]) assert.equal(await markCheckoutPaid(session(fields), () => {}), null);
});
test('a verified payment is applied once and repeat confirmation is idempotent', async t => {
 const current = order(); let notifications = 0, updates = 0;
 t.mock.method(Order, 'findById', async () => current);
 t.mock.method(Order, 'findOneAndUpdate', async (query, update) => { assert.deepEqual(query.isPaid, { $ne: true }); if (current.isPaid) return null; updates++; Object.assign(current, update.$set); return current; });
 t.mock.method(Order, 'findOne', async () => current.isPaid ? current : null);
 for (let i = 0; i < 2; i++) assert.ok(await markCheckoutPaid(session(), () => { notifications++; }));
 assert.equal(updates, 1); assert.equal(notifications, 1); assert.equal(current.isPaid, true); assert.equal(current.paymentResult.id, 'pi_test_verified');
});
test('late payment on a cancelled order does not reopen fulfillment', async t => {
 const current = order({ status: 'Cancelled' }); t.mock.method(Order, 'findById', async () => current);
 t.mock.method(Order, 'findOneAndUpdate', async (query, update) => { assert.equal(update.$set.status, 'Cancelled'); assert.equal(update.$set['timeline.0.status'], undefined); return { ...current, ...update.$set }; });
 const paid = await markCheckoutPaid(session(), () => {}); assert.equal(paid.status, 'Cancelled'); assert.equal(paid.isPaid, true);
});
test('open checkout is reused; a new checkout uses an idempotency key and trusted mobile callback', async t => {
 const oldUrl = process.env.PUBLIC_API_URL; process.env.PUBLIC_API_URL = 'http://127.0.0.1:5000/api'; t.after(() => { if (oldUrl === undefined) delete process.env.PUBLIC_API_URL; else process.env.PUBLIC_API_URL = oldUrl; });
 const current = order(); let creates = 0;
 t.mock.method(Order, 'findById', async () => current);
 const stripe = { checkout: { sessions: { create: async (params, options) => { creates++; assert.equal(Object.hasOwn(params, 'payment_method_types'), false); assert.equal(params.line_items[0].price_data.unit_amount, 150000); assert.ok(params.success_url.startsWith('http://127.0.0.1:5000/api/payment/checkout-return')); assert.ok(params.success_url.includes('{CHECKOUT_SESSION_ID}')); assert.equal(options.idempotencyKey, 'checkout_v2_' + String(orderId) + '_initial'); return session({ payment_status: 'unpaid', status: 'open' }); }, retrieve: async () => session({ payment_status: 'unpaid', status: 'open' }) } } };
 const handler = createPaymentControllers(() => stripe).createCheckoutSession;
 for (let i = 0; i < 2; i++) { const res = response(); await handler({ body: { orderId, platform: 'android', successUrl: 'https://attacker.test' }, user: { _id: userId } }, res); assert.equal(res.statusCode, 200); assert.equal(res.body.sessionId, 'cs_test_session'); }
 assert.equal(creates, 1); assert.equal(current.isPaid, false);
});
test('cancelled/unpaid provider result returns pending and never calls the paid handler', async t => {
 t.mock.method(Order, 'findById', async () => order());
 const stripe = { checkout: { sessions: { retrieve: async () => session({ payment_status: 'unpaid' }) } } };
 const res = response(); await createPaymentControllers(() => stripe, async () => { throw new Error('Must not confirm'); }).confirmCheckoutSession({ body: { sessionId: 'cs_test_session' }, user: { _id: userId } }, res);
 assert.equal(res.statusCode, 400); assert.equal(res.body.code, 'PAYMENT_PENDING');
});
test('webhook rejects invalid signatures and handles verified paid events', async t => {
 const oldSecret = process.env.STRIPE_WEBHOOK_SECRET; process.env.STRIPE_WEBHOOK_SECRET = 'test-only-webhook-secret'; t.after(() => { if (oldSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET; else process.env.STRIPE_WEBHOOK_SECRET = oldSecret; });
 let confirmed = 0;
 const stripe = { webhooks: { constructEvent: (_body, signature) => { if (signature !== 'valid-test-signature') throw new Error('Invalid'); return { type: 'checkout.session.completed', data: { object: session() } }; } } };
 const handler = createPaymentControllers(() => stripe, async () => { confirmed++; return order({ isPaid: true }); }).stripeWebhook;
 const invalid = response(); await handler({ body: Buffer.from('test'), headers: { 'stripe-signature': 'invalid' } }, invalid); assert.equal(invalid.statusCode, 400); assert.equal(confirmed, 0);
 const valid = response(); await handler({ body: Buffer.from('test'), headers: { 'stripe-signature': 'valid-test-signature' } }, valid); assert.equal(valid.statusCode, 200); assert.equal(confirmed, 1);
});

test('payment confirmation cannot reopen an order cancelled during the paid update',async t=>{const current=order();let updates=0;t.mock.method(Order,'findById',async()=>current);t.mock.method(Order,'findOne',async()=>null);t.mock.method(Order,'findOneAndUpdate',async(query,update)=>{updates++;if(updates===1){current.status='Cancelled';return null;}assert.equal(query.status,'Cancelled');assert.equal(update.$set.status,'Cancelled');Object.assign(current,update.$set);return current;});const paid=await markCheckoutPaid(session(),()=>{});assert.equal(paid.status,'Cancelled');assert.equal(paid.isPaid,true);assert.equal(updates,2);});
