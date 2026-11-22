import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import User from '../src/models/User.js';
import PromoCode from '../src/models/PromoCode.js';
import Notification from '../src/models/Notification.js';
import Device from '../src/models/PushDevice.js';
import Campaign from '../src/models/NotificationCampaign.js';
import { evaluatePromo, validateCouponInput } from '../src/controllers/promoController.js';
import { registerDevice, unregisterDevice, createCampaign, getRecipients } from '../src/controllers/pushController.js';
import { markNotificationAsRead, deleteNotification } from '../src/controllers/notificationController.js';
import { deliverCampaign } from '../src/services/notificationCampaigns.js';
const a = new mongoose.Types.ObjectId(), b = new mongoose.Types.ObjectId(), admin = new mongoose.Types.ObjectId();
const response = () => ({ code: 200, body: null, status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; } });
const coupon = () => ({ _id: new mongoose.Types.ObjectId(), code: 'PERSONAL20', title: 'Personal offer', isActive: true, validUntil: new Date(Date.now() + 86400000), allowedUsers: [a], discountType: 'percentage', discountValue: 20, minOrderAmount: 500, maxDiscount: 100 });
test('private coupons reject anonymous and other users; enforce minimum, cap, expiry and inactive codes', async t => {
 const promo = coupon(); t.mock.method(PromoCode, 'findOne', async () => promo);
 assert.equal((await evaluatePromo(promo.code, 1000)).discount, 0);
 assert.equal((await evaluatePromo(promo.code, 1000, b)).discount, 0);
 assert.equal((await evaluatePromo(promo.code, 1000, a)).discount, 100);
 assert.equal((await evaluatePromo(promo.code, 200, a)).valid, undefined);
 promo.isActive = false; promo.code = 'ROYAL20'; assert.equal((await evaluatePromo('ROYAL20', 1000, a)).discount, 0);
 promo.isActive = true; promo.validUntil = new Date(0); assert.equal((await evaluatePromo('ROYAL20', 1000, a)).discount, 0);
});
test('coupon input rejects excessive percentage, invalid expiry and non-customer recipients', async t => {
 assert.match(await validateCouponInput({ ...coupon(), discountValue: 101 }), /percentage/);
 assert.match(await validateCouponInput({ ...coupon(), validUntil: 'bad' }), /expiry/);
 t.mock.method(User, 'countDocuments', async () => 0);
 assert.match(await validateCouponInput(coupon()), /active customers/);
});
test('device registration binds FCM token to authenticated user and JWT expiry; logout is scoped', async t => {
 let saved, removed;
 t.mock.method(Device, 'findOneAndUpdate', async (query, update) => { saved = { query, update }; });
 t.mock.method(Device, 'deleteOne', async query => { removed = query; });
 const token = jwt.sign({ id: String(a) }, 'test-only', { expiresIn: '1h' });
 const res = response(); await registerDevice({ user: { _id: a, role: 'user' }, auth: { exp: Math.floor(Date.now()/1000)+3600, ver: 0 }, headers: { authorization: 'Bearer ' + token }, body: { token: 'test-device-token-not-a-real-fcm-token', platform: 'android', user: b } }, res);
 assert.equal(res.code, 200); assert.equal(saved.update.$set.user, a); assert.ok(saved.update.$set.sessionExpiresAt > new Date());
 await unregisterDevice({ user: { _id: a }, body: { token: 'test-device-token-not-a-real-fcm-token' } }, response()); assert.equal(removed.user, a);
});
test('customers cannot mark or delete another customer notification', async t => {
 let filter; t.mock.method(Notification, 'findOne', async query => { filter = query; return null; });
 for (const handler of [markNotificationAsRead, deleteNotification]) { const res = response(); await handler({ user: { _id: a, role: 'user' }, params: { id: String(b) } }, res); assert.equal(res.code, 404); assert.equal(filter.user, a); assert.equal(filter.recipientRole, 'user'); }
});
test('recipient search treats regex metacharacters literally and does not return device tokens', async t => {
 let filter; t.mock.method(User, 'find', query => { filter = query; return { select: () => ({ sort: () => ({ limit: () => ({ lean: async () => [{ _id: a, name: 'Guest', email: 'guest@example.test' }] }) }) }) }; });
 t.mock.method(Device, 'distinct', async () => [a]);
 const res = response(); await getRecipients({ query: { search: '[a]+' } }, res);
 assert.equal(res.code, 200); assert.ok(filter.$or[0].name.test('[a]+')); assert.equal(filter.$or[0].name.test('aaaa'), false); assert.equal(res.body.data[0].hasApp, true); assert.equal(res.body.data[0].token, undefined);
});
test('selected campaign rejects a coupon assigned to a different customer', async t => {
 const promo = coupon(); t.mock.method(Campaign, 'findOne', () => ({ select: async () => null }));
 t.mock.method(User, 'find', () => ({ select: async () => [{ _id: b }] }));
 t.mock.method(PromoCode, 'findById', async () => promo);
 const res = response(); await createCampaign({ user: { _id: admin }, body: { title: 'Offer', message: 'Hello', audience: 'selected', userIds: [String(b)], promoId: String(promo._id), requestId: 'test_campaign_123456789' } }, res);
 assert.equal(res.code, 400); assert.match(res.body.message, /private coupon/);
});
test('broadcast snapshots only active registered app customers and repeated request IDs do not queue twice', async t => {
 const app = initializeApp({ projectId: 'test-only-no-network' }); t.after(() => deleteApp(app));
 let deviceFilter, created;
 t.mock.method(Campaign, 'findOne', () => ({ select: async () => null }));
 t.mock.method(Device, 'distinct', async (key, filter) => { deviceFilter = filter; return [a]; });
 t.mock.method(User, 'find', query => { assert.equal(query.role, 'user'); assert.deepEqual(query.isBlocked, { $ne: true }); return { select: async () => [{ _id: a }] }; });
 t.mock.method(Campaign, 'create', async input => { created = input; return { toObject: () => input }; });
 const body = { title: 'Offer', message: 'Hello', audience: 'all', requestId: 'test_campaign_broadcast' };
 const res = response(); await createCampaign({ user: { _id: admin }, body }, res);
 assert.equal(res.code, 202); assert.ok(deviceFilter.sessionExpiresAt.$gt instanceof Date); assert.deepEqual(created.recipients, [a]);
 t.mock.method(Campaign, 'findOne', () => ({ select: async () => ({ status: 'queued', requestId: body.requestId }) }));
 const replay = response(); await createCampaign({ user: { _id: admin }, body }, replay); assert.equal(replay.code, 200); assert.equal(replay.body.data.status, 'queued');
 assert.equal(getApps().length, 1);
});
test('delivery batches FCM requests, writes inbox records, prunes invalid tokens and reports partial acceptance', async t => {
 const devices = Array.from({ length: 501 }, (_, index) => ({ _id: index, token: 'fake-device-' + index }));
 let inbox = 0, pruned = [];
 t.mock.method(User, 'findById', () => ({ select: async () => ({ role: 'user', isBlocked: false, sessionVersion: 0 }) }));
 t.mock.method(Notification, 'updateOne', async () => { inbox++; });
 t.mock.method(Device, 'find', ({ user }) => ({ select: async () => String(user) === String(a) ? devices : [] }));
 t.mock.method(Device, 'deleteMany', async query => { pruned = query._id.$in; });
 const batches = [];
 const messaging = { sendEachForMulticast: async request => { batches.push(request); const failure = request.tokens.length === 500; return { successCount: request.tokens.length - (failure ? 1 : 0), failureCount: failure ? 1 : 0, responses: request.tokens.map((token, index) => failure && index === 0 ? { error: { code: 'messaging/registration-token-not-registered' } } : { success: true }) }; } };
 const campaign = { _id: new mongoose.Types.ObjectId(), recipients: [a, b], title: 'Weekend deal', message: 'Come visit', couponCode: '', inboxCount: 0, pushAccepted: 0, pushFailed: 0, usersWithoutDevice: 0, save: async () => {} };
 await deliverCampaign(campaign, messaging);
 assert.deepEqual(batches.map(batch => batch.tokens.length), [500, 1]); assert.equal(inbox, 2); assert.equal(campaign.pushAccepted, 500); assert.equal(campaign.pushFailed, 1); assert.equal(campaign.usersWithoutDevice, 1); assert.equal(campaign.status, 'partial'); assert.deepEqual(pruned, [0]); assert.equal(batches[0].android.notification.channelId, 'promotions'); assert.equal(batches[0].apns.payload.aps.sound, 'default');
});
