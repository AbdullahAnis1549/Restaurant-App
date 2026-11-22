import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  dish: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dish',
    required: true,
  },
  name: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true },
  image: { type: String, default: '' },
  selectedVariant: {
    name: { type: String, default: '' },
    price: { type: Number, default: 0 },
  },
  selectedAddons: [
    {
      name: { type: String },
      price: { type: Number },
    },
  ],
  instructions: { type: String, default: '' },
});

const timelineEventSchema = new mongoose.Schema({
  status: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  description: { type: String, default: '' },
  completed: { type: Boolean, default: false },
});

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    checkoutRequestId: { type: String },
    checkoutPayloadHash: { type: String },
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    customerEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    customerPhone: {
      type: String,
      required: true,
      trim: true,
    },
    deliveryAddress: {
      type: String,
      default: '',
      trim: true,
    },
    orderType: {
      type: String,
      enum: ['Delivery', 'Pickup'],
      default: 'Delivery',
    },
    items: [orderItemSchema],
    subtotal: {
      type: Number,
      required: true,
    },
    deliveryFee: {
      type: Number,
      default: 0,
    },
    discount: {
      type: Number,
      default: 0,
    },
    promoCode: {
      type: String,
      default: '',
      trim: true,
    },
    grandTotal: {
      type: Number,
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: ['Cash on Delivery', 'Stripe / Card', 'EasyPaisa', 'JazzCash'],
      default: 'Cash on Delivery',
    },
    paymentStatus: {
      type: String,
      enum: ['Pending', 'Paid'],
      default: 'Pending',
    },
    isPaid: {
      type: Boolean,
      default: false,
    },
    paidAt: {
      type: Date,
    },
    paymentResult: {
      id: { type: String },
      status: { type: String },
      payment_method_types: [String],
    },
    status: {
      type: String,
      enum: [
        'Confirmed',
        'Delivered',
        'Cancelled',
        'Rejected',
        // Legacy values kept so existing documents can still be saved
        'Placed',
        'Preparing',
        'Ready for Delivery',
        'Ready for Pickup',
        'Out for Delivery',
      ],
      default: 'Confirmed',
    },
    estimatedTime: {
      type: String,
      default: '30-60 min',
    },
    deliveryEmailSent: {
      type: Boolean,
      default: false,
    },
    timeline: [timelineEventSchema],
    riderName: {
      type: String,
      default: '',
      trim: true,
    },
    riderPhone: {
      type: String,
      default: '',
      trim: true,
    },
    dispatchedAt: {
      type: Date,
    },
    deliveredAt: {
      type: Date,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    cancellationReason: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

orderSchema.index({ user: 1, checkoutRequestId: 1 }, { unique: true, partialFilterExpression: { checkoutRequestId: { $type: 'string' } } });

orderSchema.pre('save', function (next) {
  if (this.isPaid || this.paymentStatus === 'Paid') {
    this.isPaid = true;
    this.paymentStatus = 'Paid';
  } else {
    this.isPaid = false;
    this.paymentStatus = 'Pending';
  }
  next();
});

orderSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

export default mongoose.model('Order', orderSchema);
