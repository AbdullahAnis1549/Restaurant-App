import mongoose from 'mongoose';
import PushDevice from '../models/PushDevice.js';
import Campaign from '../models/NotificationCampaign.js';
import PromoCode from '../models/PromoCode.js';
import User from '../models/User.js';
import { firebaseMessaging } from '../config/firebase.js';
const fail = (res, error) => res.status(error.status || (error.code === 11000 ? 409 : 500)).json({ success: false, message: error.code === 11000 ? 'This request is already queued. Refresh campaign history.' : error.message });
export const registerDevice = async (req, res) => {
 try {
  const { token, platform } = req.body;
  if (req.user.isBlocked || req.user.role !== 'user') return res.status(403).json({ message: 'Only active customers can register.' });
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096 || !['android', 'ios'].includes(platform)) return res.status(400).json({ message: 'Valid FCM token and platform required.' });
  const claims = req.auth;
  if (!claims?.exp) return res.status(401).json({ message: 'Session expiry required.' });
  await PushDevice.findOneAndUpdate({ token }, { $set: { user: req.user._id, platform, sessionVersion: claims.ver || 0, sessionHash: req.sessionHash, sessionExpiresAt: new Date(claims.exp * 1000), lastSeenAt: new Date() } }, { upsert: true, runValidators: true });
  res.json({ success: true });
 } catch (error) { fail(res, error); }
};
export const unregisterDevice = async (req, res) => {
 try { if (typeof req.body.token !== 'string') return res.status(400).json({ message: 'Token required.' }); await PushDevice.deleteOne({ user: req.user._id, token: req.body.token }); res.json({ success: true }); } catch (error) { fail(res, error); }
};
export const getCampaigns = async (req, res) => {
 try { res.json({ success: true, data: await Campaign.find().select('-recipients').sort({ createdAt: -1 }).limit(30) }); } catch (error) { fail(res, error); }
};
export const getRecipients = async (req, res) => {
 try {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 80) : '';
  const filter = { role: 'user', isBlocked: { $ne: true } };
  if (search) { const escape = String.fromCharCode(92); const safe = [...search].map(c => (escape + '^$.*+?()[]{}|').includes(c) ? escape + c : c).join(''); filter.$or = [{ name: new RegExp(safe, 'i') }, { email: new RegExp(safe, 'i') }]; }
  const users = await User.find(filter).select('name email').sort({ name: 1 }).limit(100).lean();
  const activeUsers = await PushDevice.distinct('user', { user: { $in: users.map(u => u._id) }, sessionExpiresAt: { $gt: new Date() } });
  const active = new Set(activeUsers.map(String));
  res.json({ success: true, data: users.map(u => ({ ...u, hasApp: active.has(String(u._id)) })) });
 } catch (error) { fail(res, error); }
};
export const createCampaign = async (req, res) => {
 try {
  const { title, message, audience, userIds, promoId, requestId } = req.body;
  if (typeof title !== 'string' || !title.trim() || title.length > 100 || typeof message !== 'string' || !message.trim() || message.length > 500 || !['all', 'selected'].includes(audience) || typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(requestId)) return res.status(400).json({ message: 'Title (100 chars), message (500 chars), audience and request ID required.' });
  const existing = await Campaign.findOne({ requestId }).select('-recipients');
  if (existing) return res.json({ success: true, data: existing });
  let ids;
  if (audience === 'selected') {
   if (!Array.isArray(userIds) || !userIds.length || userIds.length > 200 || userIds.some(id => typeof id !== 'string' || !mongoose.isValidObjectId(id))) return res.status(400).json({ message: 'Select between 1 and 200 valid customers.' });
   ids = [...new Set(userIds)];
  } else ids = (await PushDevice.distinct('user', { sessionExpiresAt: { $gt: new Date() } })).map(String);
  const recipients = await User.find({ _id: { $in: ids }, role: 'user', isBlocked: { $ne: true } }).select('_id');
  if (!recipients.length) return res.status(400).json({ message: 'No eligible recipients. Customers need to sign in and enable notifications in an installed build.' });
  if (audience === 'selected' && recipients.length !== ids.length) return res.status(400).json({ message: 'Some selected customers no longer exist or are blocked.' });
  let promo;
  if (promoId) {
   if (!mongoose.isValidObjectId(promoId)) return res.status(400).json({ message: 'Invalid coupon.' });
   promo = await PromoCode.findById(promoId);
   if (!promo || !promo.isActive || promo.validUntil <= new Date()) return res.status(400).json({ message: 'Choose an active, unexpired coupon.' });
   if (promo.allowedUsers?.length && recipients.some(u => !promo.allowedUsers.some(id => String(id) === String(u._id)))) return res.status(400).json({ message: 'This private coupon is not assigned to every selected recipient. Choose its assigned customers only.' });
  }
  firebaseMessaging();
  const campaign = await Campaign.create({ title: title.trim(), message: message.trim(), audience, recipients: recipients.map(u => u._id), recipientCount: recipients.length, promo: promo?._id, couponCode: promo?.code || '', requestId, createdBy: req.user._id });
  res.status(202).json({ success: true, data: { ...campaign.toObject(), recipients: undefined } });
 } catch (error) { fail(res, error); }
};
