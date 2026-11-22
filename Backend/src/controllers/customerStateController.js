import CustomerState from '../models/CustomerState.js';
import Dish from '../models/Dish.js';
const id = value => typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value);
const fail = message => { const error = new Error(message); error.status = 400; throw error; };
export function validateCustomerState(body) {
 if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) fail('Valid cart revision required.');
 if (!Array.isArray(body.cart) || body.cart.length > 100 || !Array.isArray(body.favoriteIds) || body.favoriteIds.length > 500) fail('Invalid cart or favourites.');
 const cart = body.cart.map(item => {
  const dish = typeof item?.dish === 'string' ? item.dish : item?.dish?._id || item?.dish?.id;
  if (!id(dish) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) fail('Invalid cart item or quantity.');
  const variant = item.selectedVariant?.name || '';
  const addons = item.selectedAddons || [];
  if (typeof variant !== 'string' || variant.length > 120 || !Array.isArray(addons) || addons.length > 30 || addons.some(a => typeof a?.name !== 'string' || a.name.length > 120)) fail('Invalid dish options.');
  if (item.instructions != null && (typeof item.instructions !== 'string' || item.instructions.length > 500)) fail('Instructions must be at most 500 characters.');
  return { dish, quantity: item.quantity, variant, addons: [...new Set(addons.map(a => a.name))].sort(), instructions: item.instructions || '' };
 });
 if (body.favoriteIds.some(value => !id(value))) fail('Invalid favourite dish.');
 const keys = cart.map(row => JSON.stringify([row.dish, row.variant, row.addons]));
 if (new Set(keys).size !== keys.length) fail('Duplicate cart lines are not allowed.');
 return { cart, favoriteIds: [...new Set(body.favoriteIds)], expectedRevision: body.expectedRevision };
}
async function present(state) {
 if (!state) return { revision: 0, cart: [], favoriteIds: [] };
 const ids = [...new Set([...state.cart.map(row => String(row.dish)), ...state.favoriteIds.map(String)])];
 const dishes = await Dish.find({ _id: { $in: ids } }).lean();
 const map = new Map(dishes.map(dish => [String(dish._id), { ...dish, id: String(dish._id) }]));
 return { revision: state.revision, favoriteIds: state.favoriteIds.map(String).filter(value => map.has(value)), cart: state.cart.flatMap(row => {
  const dish = map.get(String(row.dish)); if (!dish) return [];
  const selectedVariant = row.variant ? dish.variants?.find(v => v.name === row.variant) : undefined;
  // Removed options must be reviewed, rather than silently ordered at a different price.
  if (row.variant && !selectedVariant) return [];
  const selectedAddons = (row.addons || []).map(name => dish.addons?.find(addon => addon.name === name));
  if (selectedAddons.some(addon => !addon)) return [];
  return [{ dish, quantity: row.quantity, selectedVariant, selectedAddons, instructions: row.instructions || '' }];
 }) };
}
export function createCustomerStateControllers(model = CustomerState) {
 const allowed = req => req.user?.role === 'user' && !req.user.isBlocked;
 return {
  get: async (req, res) => {
   if (!allowed(req)) return res.status(403).json({ message: 'Customer account required.' });
   try { return res.json({ data: await present(await model.findOne({ user: req.user._id })) }); }
   catch { return res.status(500).json({ message: 'Could not sync saved cart and favourites.' }); }
  },
  put: async (req, res) => {
   if (!allowed(req)) return res.status(403).json({ message: 'Customer account required.' });
   try {
    const { cart, favoriteIds, expectedRevision } = validateCustomerState(req.body);
    let state;
    if (expectedRevision === 0) {
     try { state = await model.create({ user: req.user._id, revision: 1, cart, favoriteIds }); }
     catch (error) { if (error.code !== 11000) throw error; }
    } else state = await model.findOneAndUpdate({ user: req.user._id, revision: expectedRevision }, { $set: { cart, favoriteIds }, $inc: { revision: 1 } }, { new: true, runValidators: true });
    if (!state) return res.status(409).json({ message: 'Saved cart changed on another device. Retrying sync.' });
    return res.json({ data: await present(state) });
   } catch (error) { return res.status(error.status || 500).json({ message: error.status ? error.message : 'Could not save cart and favourites.' }); }
  },
 };
}
export const customerStateController = createCustomerStateControllers();
