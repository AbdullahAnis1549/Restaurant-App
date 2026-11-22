import mongoose from 'mongoose';

const bannerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please provide banner title'],
      trim: true,
    },
    subtitle: {
      type: String,
      default: '',
      trim: true,
    },
    discountText: {
      type: String,
      default: '',
    },
    image: {
      type: String,
      required: [true, 'Banner image URL is required'],
    },
    cloudinaryPublicId: {
      type: String,
      default: '', // External image URLs do not have a managed Cloudinary asset.
    },
    buttonText: {
      type: String,
      default: 'Order Now',
    },
    link: {
      type: String,
      default: '/menu',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

bannerSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

export default mongoose.model('Banner', bannerSchema);
