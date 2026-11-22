import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'NotificationCampaign' },
    couponCode: { type: String, default: '' },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['order', 'delivery', 'dish', 'system', 'payment', 'promotion', 'coupon'],
      default: 'order',
    },
    recipientRole: {
      type: String,
      enum: ['admin', 'user'],
      default: 'admin',
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: false,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

notificationSchema.index({ campaign: 1, user: 1 }, { unique: true, partialFilterExpression: { campaign: { $type: 'objectId' } } });

notificationSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

export default mongoose.model('Notification', notificationSchema);
