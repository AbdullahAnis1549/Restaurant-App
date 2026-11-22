import {effectiveDeliveryPolicy,deliveryFeeFor} from '../utils/deliveryPolicy.js';
import crypto from 'node:crypto';
import Dish from '../models/Dish.js';
import Setting from '../models/Setting.js';
import { evaluatePromo } from '../controllers/promoController.js';
export const invalid = (message, status = 400) => Object.assign(new Error(message), { status });
const text = (value, label, max, required = false) => {
 if (value == null && !required) return '';
 if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw invalid('Invalid ' + label + '.');
 return value.trim();
};
const cents = value => { const result = Math.round(Number(value) * 100); if (!Number.isSafeInteger(result) || result < 0) throw invalid('Invalid catalog price. Please contact the restaurant.', 409); return result; };
export function normalizeCheckout(body, user, requireContact = true) {
 if (!body || !Array.isArray(body.items) || !body.items.length || body.items.length > 100) throw invalid('Choose between 1 and 100 items.');
 const orderType = body.orderType || 'Delivery', paymentMethod = body.paymentMethod || 'Cash on Delivery';
 if (!['Delivery', 'Pickup'].includes(orderType) || !['Cash on Delivery', 'Stripe / Card'].includes(paymentMethod)) throw invalid('Unsupported order or payment method.');
 const items = body.items.map(item => {
  const dish = typeof item?.dish === 'string' ? item.dish : item?.dish?._id || item?.dish?.id;
  if (typeof dish !== 'string' || !/^[a-fA-F0-9]{24}$/.test(dish)) throw invalid('Invalid dish. Refresh the menu.');
  if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) throw invalid('Quantity must be a whole number between 1 and 99.');
  const variant = item.selectedVariant == null ? '' : text(item.selectedVariant.name, 'variant', 120, true);
  if (item.selectedAddons != null && !Array.isArray(item.selectedAddons)) throw invalid('Invalid add-ons.');
  const addons = (item.selectedAddons || []).map(addon => text(addon?.name, 'add-on', 120, true)).sort();
  if (addons.length > 30 || new Set(addons).size !== addons.length) throw invalid('Invalid or duplicate add-ons.');
  return { dish: dish.toLowerCase(), quantity: item.quantity, variant, addons, instructions: text(item.instructions, 'instructions', 500) };
 });
 const keys = items.map(item => JSON.stringify([item.dish, item.variant, item.addons]));
 if (new Set(keys).size !== keys.length) throw invalid('Duplicate customized cart lines. Refresh your cart.');
 return {
  customerName: text(body.customerName || user.name, 'customer name', 120, requireContact),
  customerEmail: text(user.email, 'account email', 254, requireContact).toLowerCase(),
  customerPhone: text(body.customerPhone || user.phone, 'phone', 40, requireContact),
  deliveryAddress: orderType === 'Pickup' ? '' : text(body.deliveryAddress || user.address, 'delivery address', 500, requireContact),
  orderType, paymentMethod, items, promoCode: text(body.promoCode, 'coupon code', 32).toUpperCase(), notes: text(body.notes, 'order notes', 1000),
 };
}
export const checkoutHash = input => crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
export async function priceCheckout(input, userId) {
 const setting = await Setting.findOne();
 if (setting?.isAcceptingOrders === false) throw invalid('The kitchen is not accepting orders right now.');
 const catalog = await Dish.find({ _id: { $in: input.items.map(item => item.dish) } });
 const dishes = new Map(catalog.map(dish => [String(dish._id), dish]));
 let subtotalCents = 0;
 const items = input.items.map(item => {
  const dish = dishes.get(item.dish);
  if (!dish) throw invalid('A dish was removed from the menu. Please refresh your cart.', 409);
  if (dish.isAvailable === false) throw invalid(dish.name + ' is currently sold out.');
  const variant = item.variant ? dish.variants?.find(option => option.name === item.variant) : null;
  if (item.variant && !variant) throw invalid('A selected variant is no longer available. Refresh your cart.', 409);
  const addons = item.addons.map(name => { const option = dish.addons?.find(addon => addon.name === name); if (!option) throw invalid('An add-on is no longer available. Refresh your cart.', 409); return { name: option.name, price: cents(option.price) / 100 }; });
  const unitCents = cents(variant ? variant.price : dish.price) + addons.reduce((sum, addon) => sum + cents(addon.price), 0);
  subtotalCents += unitCents * item.quantity;
  if (!Number.isSafeInteger(subtotalCents)) throw invalid('Order amount is too large.');
  return { dish: dish._id, name: dish.name, image: dish.image || '', price: unitCents / 100, quantity: item.quantity, selectedVariant: variant ? { name: variant.name, price: cents(variant.price) / 100 } : undefined, selectedAddons: addons, instructions: item.instructions };
 });
 const subtotal = subtotalCents / 100;
 const deliveryPolicy=effectiveDeliveryPolicy(setting);
 if (subtotalCents < cents(deliveryPolicy.minOrderAmount)) throw invalid('Minimum order amount is Rs. '+deliveryPolicy.minOrderAmount+'.');
 if (deliveryPolicy.maxOrderAmount!==null && subtotalCents>cents(deliveryPolicy.maxOrderAmount)) throw invalid('Maximum order amount is Rs. '+deliveryPolicy.maxOrderAmount+'.');
 const promo = await evaluatePromo(input.promoCode, subtotal, userId);
 if (input.promoCode && !promo.valid) throw invalid(promo.message || 'Coupon cannot be used.');
 const discountCents = Math.min(subtotalCents, cents(promo.discount || 0));
 const deliveryFeeCents=cents(deliveryFeeFor(subtotal,deliveryPolicy,{pickup:input.orderType==='Pickup',freeDelivery:promo.freeDelivery}));
 return { deliveryPolicy, cart: items.map(item => { const dish = dishes.get(String(item.dish)); return { dish: { ...(typeof dish.toObject === 'function' ? dish.toObject() : dish), id: String(dish._id) }, quantity: item.quantity, selectedVariant: item.selectedVariant, selectedAddons: item.selectedAddons, instructions: item.instructions }; }), items, subtotal, discount: discountCents / 100, deliveryFee: deliveryFeeCents / 100, grandTotal: (subtotalCents - discountCents + deliveryFeeCents) / 100, promoCode: input.promoCode, pickupAddress: setting?.address || 'Restaurant collection counter', restaurantName: setting?.restaurantName || 'Restaurant' };
}
