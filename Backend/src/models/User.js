import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    emailVerifiedAt: { type: Date, default: null },
    mfaEnabled: { type: Boolean, default: false },
    sessionVersion: { type: Number, default: 0, min: 0 },
    googleId: { type: String, unique: true, sparse: true },
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please provide an email'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: function () { return !this.googleId; },
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // Do not return password by default in queries
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    phone: {
      type: String,
      default: '',
    },
    address: {
      type: String,
      default: '',
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    savedAddresses: [
      {
        label: { type: String, default: 'Home' }, // Home, Work, Other
        address: { type: String, required: true },
        phone: { type: String, default: '' },
      },
    ],
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
    toJSON: { transform(_doc, ret) { for (const field of ['password', 'googleId', 'sessionVersion', '__v']) delete ret[field]; return ret; } },
  }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isNew && (this.isModified('password') || this.isModified('isBlocked') || this.isModified('role'))) this.sessionVersion = (this.sessionVersion || 0) + 1;
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (enteredPassword) {
  if (!this.password || typeof enteredPassword !== 'string') return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model('User', userSchema);
