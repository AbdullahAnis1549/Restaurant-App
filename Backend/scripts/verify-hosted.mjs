// Explicit live diagnostic: temporary accounts/assets only; no broadcasts or live payments.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import Stripe from 'stripe';
import User from '../src/models/User.js';
import Category from '../src/models/Category.js';
import Order from '../src/models/Order.js';
import Notification from '../src/models/Notification.js';
import Campaign from '../src/models/NotificationCampaign.js';
import RevokedSession from '../src/models/RevokedSession.js';
import { deleteFromCloudinary } from '../src/utils/cloudinaryUpload.js';
const base = process.argv[2];
if (!base || !/^https:\/\//.test(base)) throw Error('Pass deployed HTTPS URL ending in /api.');
const prefix = 'verify-' + randomUUID();
const users = [], categories = [], orders = [], intents = [], checks = [];
let stripe;
async function request(method, path, token, body, expected = 200) {
 const headers = token ? { Authorization: 'Bearer ' + token } : {};
 if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
 const response = await fetch(base + path, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(45000) });
 const json = await response.json();
 assert.equal(response.status, expected, method + ' ' + path + ': HTTP ' + response.status);
 return json;
}
async function check(name, run) {
 try { await run(); checks.push({ name, passed: true }); }
 catch (error) { checks.push({ name, passed: false, reason: error.code || error.type || error.name, detail: error.name === 'AssertionError' ? error.message.split('\n')[0] : undefined }); }
 console.log(JSON.stringify(checks.at(-1)));
}
try {
 await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
 const catalog = await request('GET', '/categories');
 assert.ok(catalog.data.length && await Category.exists({ _id: catalog.data[0]._id }), 'Local database does not match hosted catalog.');
 const password = randomUUID();
 for (const role of ['user', 'admin']) users.push(await User.create({ name: 'Temporary hosted verification', email: prefix + '-' + role + '@example.test', password, role }));
 let customerToken, adminToken;
 await check('Hosted password login, profile privacy and admin access control', async () => {
  customerToken = (await request('POST', '/auth/login', null, { email: users[0].email, password })).token;
  adminToken = (await request('POST', '/auth/login', null, { email: users[1].email, password })).token;
  assert.ok(customerToken && adminToken);
  const profile = await request('GET', '/auth/profile', customerToken);
  assert.ok(!JSON.stringify(profile).includes('password'));
  await request('GET', '/categories/admin', customerToken, null, 403);
  await request('GET', '/categories/admin', adminToken);
 });
 if (adminToken) await check('Hosted Cloudinary upload and image replacement', async () => {
  const form = () => { const f = new FormData(); f.set('name', prefix); f.set('image', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1cAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'verify.png'); return f; };
  const category = (await request('POST', '/categories', adminToken, form(), 201)).data; categories.push(category._id);
  const edited = (await request('PUT', '/categories/' + category._id, adminToken, form())).data;
  assert.ok(edited.image.startsWith('https://')); assert.notEqual(edited.image, category.image);
  await request('DELETE', '/categories/' + category._id, adminToken);
 });
 if (customerToken) await check('Hosted Stripe test PaymentIntent, sandbox confirmation and paid order', async () => {
  assert.ok(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'), 'Local Stripe key must be test-only.');
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const order = await Order.create({ user: users[0]._id, customerName: users[0].name, customerEmail: users[0].email, customerPhone: '00000000000', subtotal: 1000, grandTotal: 1000, items: [], paymentMethod: 'Stripe / Card', status: 'Placed' }); orders.push(order._id);
  const setup = await request('POST', '/payment/payment-sheet', customerToken, { orderId: String(order._id) });
  assert.equal(setup.testMode, true); assert.ok(setup.publishableKey.startsWith('pk_test_')); intents.push(setup.paymentIntentId);
  const intent = await stripe.paymentIntents.retrieve(setup.paymentIntentId); assert.equal(intent.livemode, false);
  await stripe.paymentIntents.confirm(intent.id, { payment_method: 'pm_card_visa', return_url: new URL(base).origin + '/api/payment/checkout-return' });
  await request('POST', '/payment/confirm-payment-sheet', customerToken, { paymentIntentId: intent.id });
  assert.equal((await Order.findById(order._id)).isPaid, true);
 });
 if (adminToken && customerToken) await check('Selected test-user notification reaches inbox without broadcasting', async () => {
  const campaign = await request('POST', '/notifications/campaigns', adminToken, { title: 'Temporary verification', message: 'Temporary test inbox message', audience: 'selected', userIds: [String(users[0]._id)], requestId: prefix });
  assert.equal(campaign.data.status, 'completed');
  const inbox = await request('GET', '/notifications', customerToken);
  assert.ok(inbox.data.some(row => row.title === 'Temporary verification'));
 });
 if (customerToken) await check('Hosted logout revokes session', async () => { await request('POST', '/auth/logout', customerToken, {}); await request('GET', '/auth/profile', customerToken, null, 401); });
} finally {
 // Only exact temporary IDs/prefixes created by this invocation are removed.
 for (const id of categories) { const category = await Category.findById(id); if (category?.cloudinaryPublicId) await deleteFromCloudinary(category.cloudinaryPublicId); await Category.deleteOne({ _id: id, name: prefix }); }
 const ids = users.map(user => user._id);
 await Notification.deleteMany({ $or: [{ user: { $in: ids } }, { order: { $in: orders } }] });
 await Campaign.deleteMany({ requestId: prefix });
 await Order.deleteMany({ _id: { $in: orders }, user: { $in: ids } });
 await RevokedSession.deleteMany({ user: { $in: ids } });
 await User.deleteMany({ _id: { $in: ids }, email: { $regex: '^' + prefix } });
 if (stripe) for (const id of intents) { try { const i = await stripe.paymentIntents.retrieve(id); if (!['succeeded','canceled'].includes(i.status)) await stripe.paymentIntents.cancel(id); } catch {} }
 await mongoose.disconnect();
}
console.log(JSON.stringify({ passed: checks.every(row => row.passed), checks }));
if (checks.some(row => !row.passed)) process.exitCode = 1;
