import { loginResult } from '../services/accountSecurity.js';
import RevokedSession from '../models/RevokedSession.js';
import { validPassword, validText, validSavedAddresses } from '../utils/authInput.js';
import { sendCrudError } from '../utils/crudErrors.js';
import { disconnectUserSockets, disconnectSessionSockets } from '../socket.js';
import PushDevice from '../models/PushDevice.js';
import crypto from 'crypto';
import { generateToken, serializeUser } from '../utils/authSession.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import PasswordReset from '../models/PasswordReset.js';
import { sendWelcomeEmail, sendPasswordResetOTPEmail } from '../utils/nodemailer.js';

const normalizeEmail = (email = '') => (typeof email === 'string' ? email : '').toLowerCase().trim();
const isValidEmail = (email = '') => typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

const GENERIC_FORGOT_PASSWORD_MESSAGE =
  'If an account exists for this email, a verification code has been sent.';
const OTP_EXPIRY_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const RESET_TOKEN_EXPIRY_MS = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

const hashValue = (value) =>
  crypto.createHash('sha256').update(String(value)).digest('hex');

const generateOtp = () => String(crypto.randomInt(100000, 1000000));
const generateResetToken = () => crypto.randomBytes(32).toString('hex');

const getForgotPasswordRateLimitKey = (req, email) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  return `forgot:${ip}:${normalizeEmail(email)}`;
};

const getVerifyOtpRateLimitKey = (req, email) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  return `verify:${ip}:${normalizeEmail(email)}`;
};

const inMemoryRateLimitStore = global.__zaykoraPasswordResetRateLimit || new Map();
global.__zaykoraPasswordResetRateLimit = inMemoryRateLimitStore;

const resetLimiterCleanup = setInterval(() => {
 const now = Date.now(); for (const [key, entry] of inMemoryRateLimitStore) if (entry.resetAt <= now) inMemoryRateLimitStore.delete(key);
}, 60000); resetLimiterCleanup.unref();
const checkRateLimit = (key, limit, windowMs) => {
  if (!inMemoryRateLimitStore.has(key) && inMemoryRateLimitStore.size >= 10000) return { allowed: false, retryAfterMs: windowMs };
  const now = Date.now();
  const entry = inMemoryRateLimitStore.get(key);
  if (!entry || now > entry.resetAt) {
    inMemoryRateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }
  if (entry.count >= limit) {
    return { allowed: false, retryAfterMs: Math.max(0, entry.resetAt - now) };
  }
  entry.count += 1;
  inMemoryRateLimitStore.set(key, entry);
  return { allowed: true };
};

const invalidateUserPasswordResets = async (userId) => {
  await PasswordReset.deleteMany({ user: userId });
};

// @route   POST /api/auth/register
// @access  Public (Enforces Customer/User role only to prevent privilege escalation)
export const register = async (req, res) => {
  try {
    const { name, email, password, phone, address } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required.',
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.',
      });
    }

    if (!validPassword(password)) {
      return res.status(400).json({
        success: false,
        message: 'Use at least 8 characters and at most 72 UTF-8 bytes for your password.',
      });
    }

    if (!validText(name, 100, true) || (phone !== undefined && !validText(phone, 30)) || (address !== undefined && !validText(address, 500))) return res.status(400).json({ message: 'Enter a valid name, phone and address.' });
    const cleanEmail = normalizeEmail(email);
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email already exists.',
      });
    }

    // Security Hardening: Never allow user to specify 'role: admin' on public registration
    const user = await User.create({
      name: String(name).trim(),
      email: cleanEmail,
      password,
      phone: phone ? String(phone).trim() : '',
      address: address ? String(address).trim() : '',
      role: 'user', // Strict user role assignment
    });

    const token = generateToken(user._id, user.sessionVersion || 0);

    // Send welcome email in background
    sendWelcomeEmail(user).catch((err) =>
      console.error('[Welcome Email Trigger Error]:', err.message)
    );

    res.status(201).json({
      success: true,
      message: 'Account registered successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        googleConnected: Boolean(user.googleId), emailVerified: Boolean(user.emailVerifiedAt), mfaEnabled: Boolean(user.mfaEnabled),
        phone: user.phone,
        address: user.address,
        savedAddresses: user.savedAddresses || [],
      },
    });
  } catch (error) {
    sendCrudError(res, error);
  }
};

// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password',
      });
    }

    if (!isValidEmail(email) || !validPassword(password, false)) return res.status(400).json({ message: 'Enter a valid email and password.' });
    const cleanEmail = normalizeEmail(email);
    const user = await User.findOne({ email: cleanEmail }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password credentials',
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been blocked. Please contact support.',
      });
    }

    res.status(200).json(await loginResult(user));
  } catch (error) {
    sendCrudError(res, error);
  }
};

// @route   POST /api/auth/forgot-password
// @access  Public
export const forgotPassword = async (req, res) => {
  const email = normalizeEmail(req.body?.email);

  if (!email || !isValidEmail(email)) {
    // Generic response for security (do not reveal account existence)
    return res.status(200).json({
      success: true,
      message: GENERIC_FORGOT_PASSWORD_MESSAGE,
    });
  }

  const rateLimit = checkRateLimit(getForgotPasswordRateLimitKey(req, email), 5, 15 * 60 * 1000);
  if (!rateLimit.allowed) {
    // Generic response even on rate limit to avoid account enumeration signals
    return res.status(200).json({
      success: true,
      message: GENERIC_FORGOT_PASSWORD_MESSAGE,
    });
  }

  try {
    const users = await User.find({ email }).select('_id email name role isBlocked');

    // Do not reveal whether account exists or role type. If multiple accounts share same email
    // in existing data, avoid ambiguous reset by not issuing an OTP.
    if (users.length === 1) {
      const user = users[0];
      const now = Date.now();

      const existingChallenge = await PasswordReset.findOne({ user: user._id, usedAt: null }).sort({ createdAt: -1 });
      if (!existingChallenge || !existingChallenge.resendAvailableAt || existingChallenge.resendAvailableAt.getTime() <= now) {
        const otp = generateOtp();
        const otpHash = hashValue(otp);
        const otpExpiresAt = new Date(now + OTP_EXPIRY_MS);
        const resendAvailableAt = new Date(now + RESEND_COOLDOWN_MS);

        await PasswordReset.deleteMany({ user: user._id, usedAt: null });
        await PasswordReset.create({
          user: user._id,
          otpHash,
          otpExpiresAt,
          attempts: 0,
          maxAttempts: MAX_OTP_ATTEMPTS,
          resendAvailableAt,
          resetTokenHash: null,
          resetTokenExpiresAt: null,
          verifiedAt: null,
          usedAt: null,
        });

        // Send OTP email only to the registered account email
        sendPasswordResetOTPEmail(user, otp).catch((err) => {
          console.error('[Password Reset OTP Email Error]:', err.message);
        });
      }
      // If resend cooldown is active, still return generic success without revealing state.
    }

    return res.status(200).json({
      success: true,
      message: GENERIC_FORGOT_PASSWORD_MESSAGE,
    });
  } catch (error) {
    // Keep response generic and avoid leaking details
    return res.status(200).json({
      success: true,
      message: GENERIC_FORGOT_PASSWORD_MESSAGE,
    });
  }
};

// @route   POST /api/auth/verify-reset-otp
// @access  Public
export const verifyResetOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || '').trim();

    if (!email || !isValidEmail(email) || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code.',
      });
    }

    const rateLimit = checkRateLimit(getVerifyOtpRateLimitKey(req, email), 10, 15 * 60 * 1000);
    if (!rateLimit.allowed) {
      return res.status(429).json({
        success: false,
        message: 'Too many attempts. Please try again later.',
      });
    }

    const users = await User.find({ email }).select('_id');
    if (users.length !== 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code.',
      });
    }

    const user = users[0];
    const now = new Date();
    const challenge = await PasswordReset.findOneAndUpdate({ user: user._id, usedAt: null, verifiedAt: null, otpExpiresAt: { $gt: now }, attempts: { $lt: MAX_OTP_ATTEMPTS } }, { $inc: { attempts: 1 } }, { new: true, sort: { createdAt: -1 } });
    if (!challenge || hashValue(otp) !== challenge.otpHash) return res.status(400).json({ success: false, message: 'Invalid or expired verification code.' });
    const resetToken = generateResetToken();
    const claimed = await PasswordReset.findOneAndUpdate({ _id: challenge._id, usedAt: null, verifiedAt: null, otpHash: challenge.otpHash, otpExpiresAt: { $gt: new Date() } }, { $set: { resetTokenHash: hashValue(resetToken), resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_EXPIRY_MS), verifiedAt: new Date(), otpHash: hashValue('used:' + crypto.randomUUID()), otpExpiresAt: new Date(0) } }, { new: true });
    if (!claimed) return res.status(400).json({ success: false, message: 'Invalid or expired verification code.' });

    return res.status(200).json({
      success: true,
      message: 'Verification successful.',
      resetToken,
      expiresIn: Math.floor(RESET_TOKEN_EXPIRY_MS / 1000),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Unable to verify code at this time.',
    });
  }
};

// @route   POST /api/auth/reset-password
// @access  Public
export const resetPassword = async (req, res) => {
  try {
    const resetToken = typeof req.body?.resetToken === 'string' ? req.body.resetToken.trim() : '';
    const newPassword = req.body?.newPassword;
    const confirmPassword = req.body?.confirmPassword !== undefined ? req.body.confirmPassword : newPassword;

    if (!/^[a-f0-9]{64}$/i.test(resetToken)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset request.',
      });
    }

    if (!validPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long.',
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match.',
      });
    }

    const resetTokenHash = hashValue(resetToken);
    const challenge = await PasswordReset.findOneAndUpdate({ resetTokenHash, usedAt: null, resetTokenExpiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date(), resetTokenHash: null, resetTokenExpiresAt: new Date(0) } }, { new: true });
    if (!challenge) return res.status(400).json({ message: 'Invalid or expired reset request.' });
    const user = await User.findById(challenge.user).select('+password');
    if (!user) return res.status(400).json({ message: 'Invalid or expired reset request.' });
    user.password = newPassword;
    await user.save();
    disconnectUserSockets(user._id);
    await PushDevice.deleteMany({ user: user._id });
    await PasswordReset.deleteMany({ user: user._id, _id: { $ne: challenge._id } });
    return res.status(200).json({
      success: true,
      message: 'Your password has been reset successfully.',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Unable to reset password at this time.',
    });
  }
};

// @route   GET /api/auth/profile
// @access  Private (authVerify)
export const getProfile = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      user: serializeUser(req.user),
    });
  } catch (error) {
    sendCrudError(res, error);
  }
};

// @route   PUT /api/auth/profile
// @access  Private (authVerify)
export const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if ((req.body.name !== undefined && !validText(req.body.name, 100, true)) || (req.body.phone !== undefined && !validText(req.body.phone, 30)) || (req.body.address !== undefined && !validText(req.body.address, 500)) || (req.body.savedAddresses !== undefined && !validSavedAddresses(req.body.savedAddresses))) return res.status(400).json({ message: 'Invalid profile fields. Save up to 10 addresses.' });
    if (req.body.name) user.name = req.body.name.trim();
    if (req.body.phone !== undefined) user.phone = String(req.body.phone).trim();
    if (req.body.address !== undefined) user.address = String(req.body.address).trim();

    if (Array.isArray(req.body.savedAddresses)) {
      user.savedAddresses = req.body.savedAddresses.map(row => ({ label: (row.label || 'Home').trim(), address: row.address.trim(), phone: (row.phone || '').trim() }));
    }

    const changingPassword = req.body.password !== undefined && req.body.password !== '';
    if (changingPassword) {
      if (!validPassword(req.body.password)) return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
      if (!validPassword(req.body.currentPassword, false) || !await user.comparePassword(req.body.currentPassword)) return res.status(400).json({ message: 'Enter your correct current password to change it.' });
      user.password = req.body.password;
    }

    const updatedUser = await user.save();
    if (changingPassword) { disconnectUserSockets(user._id); await PushDevice.deleteMany({ user: user._id }); }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      ...(changingPassword ? { token: generateToken(updatedUser._id, updatedUser.sessionVersion || 0, req.auth?.mfa === true) } : {}),
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        googleConnected: Boolean(updatedUser.googleId), emailVerified: Boolean(updatedUser.emailVerifiedAt), mfaEnabled: Boolean(updatedUser.mfaEnabled),
        phone: updatedUser.phone,
        address: updatedUser.address,
        savedAddresses: updatedUser.savedAddresses || [],
      },
    });
  } catch (error) {
    sendCrudError(res, error);
  }
};

// @route   GET /api/auth/users
// @access  Private / Admin Only (Customer Management)
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({ role: 'user' }).select('-password').sort({ createdAt: -1 });

    // Aggregate real orders per customer
    const userOrderStats = await Order.aggregate([
      {
        $group: {
          _id: '$user',
          orderCount: { $sum: 1 },
          totalSpent: { $sum: '$grandTotal' },
          lastOrderDate: { $max: '$createdAt' },
        },
      },
    ]);

    const statsMap = new Map(
      userOrderStats.map((stat) => [String(stat._id), stat])
    );

    const customersWithMetrics = users.map((u) => {
      const stat = statsMap.get(String(u._id)) || { orderCount: 0, totalSpent: 0, lastOrderDate: null };
      return {
        id: u._id,
        _id: u._id,
        name: u.name,
        email: u.email,
        phone: u.phone || 'N/A',
        address: u.address || 'N/A',
        savedAddresses: u.savedAddresses || [],
        isBlocked: Boolean(u.isBlocked),
        orderCount: stat.orderCount,
        totalSpent: stat.totalSpent,
        lastOrderDate: stat.lastOrderDate,
        createdAt: u.createdAt,
      };
    });

    res.status(200).json({
      success: true,
      count: customersWithMetrics.length,
      data: customersWithMetrics,
    });
  } catch (error) {
    sendCrudError(res, error);
  }
};

// @route   PATCH /api/auth/users/:id/block
// @access  Private / Admin Only (Toggle Customer Block Status)
export const toggleBlockUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (user.role === 'admin') {
      return res.status(403).json({ success: false, message: 'Cannot block admin users' });
    }
    user.isBlocked = !user.isBlocked;
    await user.save();
    disconnectUserSockets(user._id);
    if (user.isBlocked) await PushDevice.deleteMany({ user: user._id });
    res.status(200).json({
      success: true,
      message: `User ${user.isBlocked ? 'blocked' : 'unblocked'} successfully`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isBlocked: user.isBlocked,
      },
    });
  } catch (error) {
    sendCrudError(res, error);
  }
};

// @route   GET /api/auth/users/:id/orders
// @access  Private / Admin Only (Customer Order History)
export const getUserOrderHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const orders = await Order.find({ user: id })
      .populate('items.dish', 'name price image')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    sendCrudError(res, error);
  }
};

export const logoutSession = async (req, res) => {
 try {
  await RevokedSession.updateOne({ _id: req.sessionHash }, { $setOnInsert: { expiresAt: new Date(req.auth.exp * 1000) } }, { upsert: true });
  await PushDevice.deleteMany({ user: req.user._id, sessionHash: req.sessionHash });
  disconnectSessionSockets(req.sessionHash);
  res.json({ success: true });
 } catch (error) { sendCrudError(res, error); }
};
