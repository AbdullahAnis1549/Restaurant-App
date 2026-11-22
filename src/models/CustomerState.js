import mongoose from 'mongoose';
const line = new mongoose.Schema({ dish: { type: mongoose.Schema.Types.ObjectId, ref: 'Dish', required: true }, quantity: { type: Number, min: 1, max: 99, required: true }, variant: { type: String, default: '' }, addons: [String], instructions: { type: String, maxlength: 500, default: '' } }, { _id: false });
const schema = new mongoose.Schema({ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true }, revision: { type: Number, default: 1 }, cart: [line], favoriteIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Dish' }] }, { timestamps: true });
export default mongoose.model('CustomerState', schema);
