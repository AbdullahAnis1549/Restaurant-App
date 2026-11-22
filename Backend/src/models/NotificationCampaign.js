import mongoose from 'mongoose';
const schema = new mongoose.Schema({
 requestId: { type: String, required: true, unique: true },
 createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
 title: { type: String, required: true, maxlength: 100 },
 message: { type: String, required: true, maxlength: 500 },
 audience: { type: String, enum: ['all', 'selected'], required: true },
 recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
 promo: { type: mongoose.Schema.Types.ObjectId, ref: 'PromoCode' },
 couponCode: { type: String, default: '' },
 status: { type: String, enum: ['queued', 'sending', 'completed', 'partial', 'failed'], default: 'queued' },
 recipientCount: { type: Number, default: 0 },
 inboxCount: { type: Number, default: 0 },
 pushAccepted: { type: Number, default: 0 },
 pushFailed: { type: Number, default: 0 },
 usersWithoutDevice: { type: Number, default: 0 },
 error: { type: String, default: '' },
}, { timestamps: true });
schema.index({ status: 1, createdAt: 1 });
export default mongoose.model('NotificationCampaign', schema);
