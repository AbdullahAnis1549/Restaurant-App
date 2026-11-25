import RevokedSession from '../models/RevokedSession.js';
import Campaign from '../models/NotificationCampaign.js';
import Notification from '../models/Notification.js';
import PushDevice from '../models/PushDevice.js';
import User from '../models/User.js';
import PromoCode from '../models/PromoCode.js';
import { firebaseMessaging } from '../config/firebase.js';

export async function deliverCampaign(campaign, messaging = firebaseMessaging()) {
 for (const userId of campaign.recipients) {
  if (campaign.promo) {
   const promo = await PromoCode.findById(campaign.promo);
   if (!promo || !promo.isActive || promo.validUntil <= new Date() || (promo.allowedUsers?.length && !promo.allowedUsers.some(id => String(id) === String(userId)))) throw new Error('Coupon is no longer valid for the campaign recipients.');
  }
  const recipient = await User.findById(userId).select('role isBlocked sessionVersion');
  if (!recipient || recipient.role !== 'user' || recipient.isBlocked) continue;
  await Notification.updateOne({ campaign: campaign._id, user: userId }, { $setOnInsert: {
   title: campaign.title, message: campaign.message, recipientRole: 'user', type: campaign.couponCode ? 'coupon' : 'promotion', couponCode: campaign.couponCode, campaign: campaign._id, user: userId, isRead: false,
  } }, { upsert: true });
  campaign.inboxCount++;
  let devices = await PushDevice.find({ user: userId, sessionExpiresAt: { $gt: new Date() }, sessionVersion: recipient.sessionVersion || 0 }).select('+token +sessionHash');
  const sessionHashes = [...new Set(devices.map(device => device.sessionHash).filter(Boolean))];
  if (sessionHashes.length) { const revoked = await RevokedSession.find({ _id: { $in: sessionHashes } }).select('_id').lean(); const blocked = new Set(revoked.map(row => String(row._id))); devices = devices.filter(device => !blocked.has(device.sessionHash)); }
  if (!devices.length) campaign.usersWithoutDevice++;
  for (let i = 0; i < devices.length; i += 500) {
   const batch = devices.slice(i, i + 500);
   const result = await messaging.sendEachForMulticast({
    tokens: batch.map(d => d.token), notification: { title: campaign.title, body: campaign.message },
    data: { route: '/notifications', campaignId: String(campaign._id), couponCode: campaign.couponCode || '' },
    android: { priority: 'high', ttl: 86400000, notification: { channelId: 'promotions', sound: 'default' } },
    apns: { headers: { 'apns-priority': '10', 'apns-expiration': String(Math.floor(Date.now() / 1000) + 86400) }, payload: { aps: { sound: 'default' } } },
   });
   campaign.pushAccepted += result.successCount; campaign.pushFailed += result.failureCount;
   const invalid = result.responses.flatMap((r, index) => ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(r.error?.code) ? [batch[index]._id] : []);
   if (invalid.length) await PushDevice.deleteMany({ _id: { $in: invalid } });
  }
  await campaign.save();
 }
 campaign.status = campaign.pushFailed ? 'partial' : 'completed'; await campaign.save();
}
export async function startCampaignWorker() {
 // A crashed send has an unknown provider outcome. Do not replay and duplicate pushes.
 await Campaign.updateMany({ status: 'sending' }, { $set: { status: 'failed', error: 'Server restarted during delivery. Some pushes may have been accepted; inspect counts before creating a new campaign.' } });
 let running = false;
 const tick = async () => {
  if (running) return; running = true;
  try {
   const campaign = await Campaign.findOneAndUpdate({ status: 'queued' }, { $set: { status: 'sending' } }, { sort: { createdAt: 1 }, new: true });
   if (campaign) {
    try { await deliverCampaign(campaign); }
    catch (error) { campaign.status = 'failed'; campaign.error = error.code || 'Push delivery failed; check Firebase credentials and server logs.'; await campaign.save(); console.error('[Notification campaign]', error.code || error.message); }
   }
  } catch (error) { console.error('[Notification worker]', error.message); }
  finally { running = false; }
 };
 const timer = setInterval(tick, 2000); timer.unref(); void tick();
 return () => clearInterval(timer);
}

// Claim atomically so concurrent/replayed admin requests never send twice.
export async function processCampaign(id, deliver = deliverCampaign) {
 const campaign = await Campaign.findOneAndUpdate({ _id: id, status: 'queued' }, { $set: { status: 'sending' } }, { new: true });
 if (!campaign) return;
 try { await deliver(campaign); }
 catch (error) {
  campaign.status = 'failed';
  const code = typeof error.code === 'string' && /^[a-zA-Z0-9_/-]{1,100}$/.test(error.code) ? error.code : 'provider-error';
  campaign.error = 'Push delivery failed (' + code + '). Check Firebase credentials on the deployed backend. Some sends may have completed; check counts before retrying.';
  await campaign.save();
  console.error('[Notification campaign]', error.code || error.name);
 }
}
