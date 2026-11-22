import mongoose from 'mongoose';

const dishSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide dish name'],
      trim: true,
    },
    // Relational reference to Category
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Please provide dish category ID'],
    },
    price: {
      type: Number,
      required: [true, 'Please provide dish price'],
      min: [0, 'Price must be positive'],
    },
    oldPrice: {
      type: Number,
      default: null,
    },
    rating: {
      type: Number,
      default: 5.0,
      min: 0,
      max: 5,
    },
    numReviews: {
      type: Number,
      default: 0,
    },
    image: {
      type: String,
      required: [true, 'Dish image URL is required'],
    },
    cloudinaryPublicId: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      required: [true, 'Please provide dish description'],
      trim: true,
    },
    popular: {
      type: Boolean,
      default: false,
    },
    special: {
      type: Boolean,
      default: false,
    },
    prepTime: {
      type: String,
      default: '20-25 min',
    },
    calories: {
      type: String,
      default: '600 kcal',
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    spicyLevel: {
      type: String,
      enum: ['None', 'Mild', 'Medium', 'Hot', 'Extra Hot'],
      default: 'Mild',
    },
    isVeg: {
      type: Boolean,
      default: false,
    },
    variants: [
      {
        name: { type: String, required: true },
        price: { type: Number, required: true },
      },
    ],
    addons: [
      {
        name: { type: String, required: true },
        price: { type: Number, required: true },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

dishSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

export default mongoose.model('Dish', dishSchema);
