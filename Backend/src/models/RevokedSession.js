import mongoose from 'mongoose';
const schema = new mongoose.Schema({ _id: { type: String }, expiresAt: { type: Date, required: true } }, { versionKey: false });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('RevokedSession', schema);
