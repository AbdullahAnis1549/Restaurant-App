import mongoose from 'mongoose';
const schema = new mongoose.Schema({ customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, sender: { type: String, enum: ['user', 'admin'], required: true }, text: { type: String, required: true, trim: true, maxlength: 4000 }, readAt: { type: Date, default: null } }, { timestamps: true });
schema.index({ customer: 1, _id: -1 });
schema.index({ customer: 1, sender: 1, readAt: 1 });
export default mongoose.model('ChatMessage', schema);
