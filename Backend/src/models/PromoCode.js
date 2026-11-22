import mongoose from 'mongoose';

const promoCodeSchema = new mongoose.Schema(
  {
    allowedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    code: {
      type: String,
      required: [true, 'Promo code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    title: {
      type: String,
      required: [true, 'Offer title is required'],
      trim: true,
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed', 'freeDelivery'],
      default: 'percentage',
    },
    discountValue: {
      type: Number,
      required: [true, 'Discount value is required'],
      min: [0, 'Discount value cannot be negative'],
    },
    minOrderAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxDiscount: {
      type: Number,
      default: 0, // 0 means no cap
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    validUntil: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
    },
    usageCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

promoCodeSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

export default mongoose.model('PromoCode', promoCodeSchema);
