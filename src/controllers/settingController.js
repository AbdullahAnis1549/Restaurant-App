import {normalizeDeliveryUpdate} from '../utils/deliveryPolicy.js';
import {inputError} from '../utils/crudErrors.js';
import { publicSettings } from '../utils/publicData.js';
import { sendCrudError, pickFields } from '../utils/crudErrors.js';
import Setting from '../models/Setting.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinaryUpload.js';

// @route   GET /api/settings
// @access  Public
export const getSettings = async (req, res) => {
  try {
    const setting = await Setting.findOne() || new Setting();
    res.status(200).json({ success: true, data: publicSettings(setting) });
  } catch (error) {
    sendCrudError(res, error);
  }
};

// @route   PUT /api/settings
// @access  Private / Admin Only
export const updateSettings = async (req, res) => {
  let uploadedImage, imageCommitted = false, oldImageId;
  try {
    let setting = await Setting.findOne();

    oldImageId = setting?.logoCloudinaryPublicId;
    const updates = pickFields(req.body, ['restaurantName','tagline','whatsappNumber','contactPhone','contactEmail','address','openingHours','isAcceptingOrders']);
    for (const [field,max] of Object.entries({restaurantName:120,tagline:160,contactPhone:40,contactEmail:254,address:500,openingHours:160,whatsappNumber:24})) if (updates[field] !== undefined) { if (typeof updates[field] !== 'string' || updates[field].trim().length>max) throw inputError('Invalid '+field+'.'); updates[field]=updates[field].trim(); }
    if (updates.restaurantName !== undefined && !updates.restaurantName) throw inputError('Restaurant name is required.');
    if (updates.whatsappNumber) { updates.whatsappNumber=updates.whatsappNumber.replace(/[+ ()-]/g,''); if (!/^[1-9][0-9]{6,14}$/.test(updates.whatsappNumber)) throw inputError('Use an international WhatsApp number including country code.'); }
    if (updates.contactEmail && !/^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(updates.contactEmail)) throw inputError('Enter a valid contact email.');
    Object.assign(updates, normalizeDeliveryUpdate(req.body, typeof setting?.toObject==='function'?setting.toObject():setting||{}));
    if (!setting) setting=await Setting.create({});
    if (updates.isAcceptingOrders !== undefined) {
      updates.isAcceptingOrders = updates.isAcceptingOrders === 'true' || updates.isAcceptingOrders === true;
    }

    // Handle Logo Image Upload to Cloudinary
    if (req.file) {
      const uploadResult = uploadedImage = await uploadToCloudinary(req.file.buffer, 'restaurant/logo');
      updates.logo = uploadResult.secure_url;
      updates.logoCloudinaryPublicId = uploadResult.public_id;
    } else if (req.body.removeLogo === 'true' || req.body.removeLogo === true) {
      updates.logo = '';
      updates.logoCloudinaryPublicId = '';
    }

    setting = await Setting.findOneAndUpdate({ _id: setting._id, ...(setting.__v === undefined ? { $or: [{__v:0},{__v:{$exists:false}}] } : {__v:setting.__v}) }, { $set: updates, $inc: {__v:1} }, {
      new: true,
      runValidators: true,
    });

    if (!setting) throw Object.assign(new Error('Settings changed while saving. Reload settings and try again.'), { statusCode: 409 });
    imageCommitted = true;
    if (oldImageId && oldImageId !== setting.logoCloudinaryPublicId) await deleteFromCloudinary(oldImageId);
    res.status(200).json({
      success: true,
      message: 'Restaurant settings and logo updated successfully',
      data: setting,
    });
  } catch (error) {
    if (uploadedImage && !imageCommitted) await deleteFromCloudinary(uploadedImage.public_id);
    sendCrudError(res, error);
  }
};
