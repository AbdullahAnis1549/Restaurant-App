import mongoose from 'mongoose';
const schema = new mongoose.Schema({
 sessionHash: { type: String, default: '', select: false },
 sessionVersion: { type: Number, default: 0, min: 0 },
 user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
 token: { type: String, required: true, unique: true, select: false },
 platform: { type: String, enum: ['android', 'ios'], required: true },
 sessionExpiresAt: { type: Date, required: true },
 lastSeenAt: { type: Date, default: Date.now },
}, { timestamps: true });
schema.index({ sessionExpiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('PushDevice', schema);
