import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide your name'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please provide your email address'],
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      default: '',
    },
    subject: {
      type: String,
      required: [true, 'Please provide a subject'],
      trim: true,
    },
    message: {
      type: String,
      required: [true, 'Please provide your message or inquiry'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Read', 'Replied'],
      default: 'Pending',
    },
    adminReply: {
      type: String,
      default: '',
    },
    repliedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

contactSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

export default mongoose.model('Contact', contactSchema);
