import { publicBanner } from '../utils/publicData.js';
import { sendCrudError, pickFields } from '../utils/crudErrors.js';
import Banner from '../models/Banner.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinaryUpload.js';

// @route   GET /api/banners
// @access  Public (Only active banners for app frontend)
export const getActiveBanners = async (req, res) => {
  try {
    const banners = await Banner.find({ isActive: true }).sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: banners.length,
      data: banners.map(publicBanner),
    });
  } catch (error) {
    sendCrudError(res, error);
  }
};

// @route   GET /api/banners/admin
// @access  Private / Admin Only (All banners active and inactive)
export const getAllBanners = async (req, res) => {
  try {
    const banners = await Banner.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: banners.length,
      data: banners,
    });
  } catch (error) {
    sendCrudError(res, error);
  }
};

// @route   POST /api/banners
// @access  Private / Admin Only (authVerify, adminProtected, upload.single('image'), validateImage)
export const createBanner = async (req, res) => {
  let uploadedImage, imageCommitted = false, oldImageId;
  try {
    const { title, subtitle, discountText, buttonText, link, isActive } = req.body;

    let imageUrl = req.body.image;
    let publicId = '';

    if (req.file) {
      const uploadResult = uploadedImage = await uploadToCloudinary(req.file.buffer, 'restaurant/banners');
      imageUrl = uploadResult.secure_url;
      publicId = uploadResult.public_id;
    }

    if (!imageUrl) {
      return res.status(400).json({ success: false, message: 'Banner image is required.' });
    }

    const banner = await Banner.create({
      title,
      subtitle: subtitle || '',
      discountText: discountText || '',
      buttonText: buttonText || 'Order Now',
      link: link || '/menu',
      image: imageUrl,
      cloudinaryPublicId: publicId,
      isActive: isActive !== 'false' && isActive !== false,
    });

    imageCommitted = true;
    res.status(201).json({
      success: true,
      message: 'Banner created successfully',
      data: banner,
    });
  } catch (error) {
    if (uploadedImage && !imageCommitted) await deleteFromCloudinary(uploadedImage.public_id);
    sendCrudError(res, error);
  }
};

// @route   PUT /api/banners/:id
// @access  Private / Admin Only
export const updateBanner = async (req, res) => {
  let uploadedImage, imageCommitted = false, oldImageId;
  try {
    const { id } = req.params;
    let banner = await Banner.findById(id);

    if (!banner) {
      return res.status(404).json({ success: false, message: 'Banner not found' });
    }

    oldImageId = banner.cloudinaryPublicId;
    const updates = pickFields(req.body, ["title","subtitle","discountText","buttonText","link","isActive"]);

    if (updates.isActive !== undefined) {
      updates.isActive = updates.isActive === 'true' || updates.isActive === true;
    }

    if (req.file) {
      const uploadResult = uploadedImage = await uploadToCloudinary(req.file.buffer, 'restaurant/banners');
      updates.image = uploadResult.secure_url;
      updates.cloudinaryPublicId = uploadResult.public_id;
    }

    banner = await Banner.findByIdAndUpdate(id, updates, { new: true, runValidators: true });

    if (!banner) throw Object.assign(new Error('This record was removed before it could be saved.'), { statusCode: 404 });
    imageCommitted = true;
    if (oldImageId && oldImageId !== banner.cloudinaryPublicId) await deleteFromCloudinary(oldImageId);
    res.status(200).json({
      success: true,
      message: 'Banner updated successfully',
      data: banner,
    });
  } catch (error) {
    if (uploadedImage && !imageCommitted) await deleteFromCloudinary(uploadedImage.public_id);
    sendCrudError(res, error);
  }
};

// @route   DELETE /api/banners/:id
// @access  Private / Admin Only
export const deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const banner = await Banner.findById(id);

    if (!banner) {
      return res.status(404).json({ success: false, message: 'Banner not found' });
    }

    await banner.deleteOne();
    await deleteFromCloudinary(banner.cloudinaryPublicId);

    res.status(200).json({
      success: true,
      message: 'Banner deleted successfully',
    });
  } catch (error) {
    sendCrudError(res, error);
  }
};
