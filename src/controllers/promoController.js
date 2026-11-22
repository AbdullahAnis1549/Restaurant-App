import { sendCrudError } from '../utils/crudErrors.js';
import mongoose from 'mongoose';
import User from '../models/User.js';
import PromoCode from '../models/PromoCode.js';

// Helper: Calculate discount dynamically against PromoCode collection
export const evaluatePromo = async (code, subtotal, userId) => {
  if (!code) return { discount: 0, freeDelivery: false, message: '' };
  if (typeof code !== 'string' || !Number.isFinite(subtotal) || subtotal < 0) return { discount: 0, freeDelivery: false, message: 'Invalid coupon or subtotal.' };
  const cleanCode = code.trim().toUpperCase();

  // First check database for dynamic active promo codes
  let promo = await PromoCode.findOne({
    code: cleanCode,
  });

  if (!promo) return { valid: false, discount: 0, freeDelivery: false, message: 'Invalid or expired promo code.' };

  if (!promo.isActive) return { discount: 0, freeDelivery: false, message: 'This coupon is inactive.' };
  if (promo.allowedUsers?.length && (!userId || !promo.allowedUsers.some(id => String(id) === String(userId)))) {
    return { discount: 0, freeDelivery: false, message: 'This coupon is assigned to another customer.' };
  }

  // Check Expiry Date
  if (promo.validUntil && new Date(promo.validUntil) < new Date()) {
    return { discount: 0, freeDelivery: false, message: 'This promo code has expired.' };
  }

  // Check Minimum Order Amount
  if (promo.minOrderAmount && subtotal < promo.minOrderAmount) {
    return {
      discount: 0,
      freeDelivery: false,
      message: `Minimum order amount of Rs. ${promo.minOrderAmount} required for this coupon.`,
    };
  }

  let discount = 0;
  let freeDelivery = false;

  if (promo.discountType === 'percentage') {
    discount = Math.round((subtotal * promo.discountValue) / 100);
    if (promo.maxDiscount > 0 && discount > promo.maxDiscount) {
      discount = promo.maxDiscount;
    }
  } else if (promo.discountType === 'fixed') {
    discount = Math.min(subtotal, promo.discountValue);
  } else if (promo.discountType === 'freeDelivery') {
    freeDelivery = true;
  }

  discount = Math.max(0, Math.min(subtotal, discount, promo.maxDiscount > 0 ? promo.maxDiscount : Infinity));
  return {
    valid: true,
    discount,
    freeDelivery,
    promoCode: cleanCode,
    message: `${promo.title} applied successfully!`,
  };
};

// @route   GET /api/promos
// @access  Private / Admin Only
export const getAllPromos = async (req, res) => {
  try {
    const promos = await PromoCode.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: promos.length, data: promos });
  } catch (error) {
    sendCrudError(res, error);
  }
};

// @route   POST /api/promos
// @access  Private / Admin Only
export const createPromo = async (req, res) => {
  try {
    const { code, title, discountType, discountValue, minOrderAmount, maxDiscount, validUntil, allowedUsers = [] } = req.body;

    if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{3,32}$/.test(code) || typeof title !== 'string' || !title.trim() || title.length > 100 || discountValue === undefined) {
      return res.status(400).json({ success: false, message: 'Code, title, and discount value are required.' });
    }

    const cleanCode = code.trim().toUpperCase();
    const validation = await validateCouponInput({ discountType: discountType || 'percentage', discountValue, minOrderAmount: minOrderAmount || 0, maxDiscount: maxDiscount || 0, validUntil, allowedUsers });
    if (validation) return res.status(400).json({ message: validation });
    const existing = await PromoCode.findOne({ code: cleanCode });
    if (existing) {
      return res.status(400).json({ success: false, message: 'A promo code with this name already exists.' });
    }

    const promo = await PromoCode.create({
      allowedUsers,
      code: cleanCode,
      title: title.trim(),
      discountType: discountType || 'percentage',
      discountValue: Number(discountValue),
      minOrderAmount: Number(minOrderAmount || 0),
      maxDiscount: Number(maxDiscount || 0),
      validUntil: validUntil ? new Date(validUntil) : undefined,
      isActive: true,
    });

    res.status(201).json({ success: true, message: 'Promo code created successfully', data: promo });
  } catch (error) {
    sendCrudError(res, error);
  }
};

// @route   PUT /api/promos/:id
// @access  Private / Admin Only
export const updatePromo = async (req, res) => {
  try {
    const { id } = req.params;
    let promo = await PromoCode.findById(id);
    if (!promo) {
      return res.status(404).json({ success: false, message: 'Promo code not found' });
    }

    const allowed = ['code', 'title', 'discountType', 'discountValue', 'minOrderAmount', 'maxDiscount', 'validUntil', 'isActive', 'allowedUsers'];
    for (const key of allowed) if (req.body[key] !== undefined) promo[key] = req.body[key];
    if (typeof promo.code !== 'string' || !/^[A-Za-z0-9_-]{3,32}$/.test(promo.code) || typeof promo.title !== 'string' || !promo.title.trim() || promo.title.length > 100) return res.status(400).json({ success: false, message: 'Enter a valid code and title.' });
    promo.code = promo.code.trim().toUpperCase();
    const validation = await validateCouponInput(promo);
    if (validation) return res.status(400).json({ message: validation });
    await promo.save();
    res.status(200).json({ success: true, message: 'Promo code updated successfully', data: promo });
  } catch (error) {
    sendCrudError(res, error);
  }
};

// @route   DELETE /api/promos/:id
// @access  Private / Admin Only
export const deletePromo = async (req, res) => {
  try {
    const promo = await PromoCode.findById(req.params.id);
    if (!promo) {
      return res.status(404).json({ success: false, message: 'Promo code not found' });
    }
    await promo.deleteOne();
    res.status(200).json({ success: true, message: 'Promo code deleted successfully' });
  } catch (error) {
    sendCrudError(res, error);
  }
};


export async function validateCouponInput(input) {
 if (!['percentage', 'fixed', 'freeDelivery'].includes(input.discountType)) return 'Invalid discount type.';
 const value = Number(input.discountValue);
 if (!Number.isFinite(value) || value < 0 || (input.discountType !== 'freeDelivery' && value === 0) || (input.discountType === 'percentage' && value > 100)) return 'Enter a valid discount; percentage must be 1 to 100.';
 if (![input.minOrderAmount || 0, input.maxDiscount || 0].every(n => Number.isFinite(Number(n)) && Number(n) >= 0)) return 'Minimum order and maximum discount must be non-negative.';
 if (input.validUntil && (!Number.isFinite(new Date(input.validUntil).getTime()) || new Date(input.validUntil) <= new Date())) return 'Coupon expiry must be in the future.';
 if (!Array.isArray(input.allowedUsers) || input.allowedUsers.length > 200 || input.allowedUsers.some(id => !mongoose.isValidObjectId(id))) return 'Select up to 200 valid coupon recipients.';
 if (input.allowedUsers.length) { const ids = [...new Set(input.allowedUsers.map(String))]; const count = await User.countDocuments({ _id: { $in: ids }, role: 'user', isBlocked: { $ne: true } }); if (count !== ids.length) return 'Coupon recipients must be active customers.'; }
 return '';
}
