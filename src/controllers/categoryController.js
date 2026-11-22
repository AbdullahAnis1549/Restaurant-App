import { publicCategory } from '../utils/publicData.js';
import Dish from '../models/Dish.js';
import { sendCrudError, pickFields, inputError } from '../utils/crudErrors.js';
import Category from '../models/Category.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinaryUpload.js';

// @route   GET /api/categories
// @access  Public (Active menu categories)
export const getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ createdAt: 1 });
    res.status(200).json({ success: true, count: categories.length, data: categories.map(publicCategory) });
  } catch (error) {
    sendCrudError(res, error);
  }
};

// @route   GET /api/categories/admin
// @access  Private / Admin Only (All categories)
export const getAdminCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({ createdAt: 1 });
    res.status(200).json({ success: true, count: categories.length, data: categories });
  } catch (error) {
    sendCrudError(res, error);
  }
};

// @route   POST /api/categories
// @access  Private / Admin Only
export const createCategory = async (req, res) => {
  let uploadedImage, imageCommitted = false, oldImageId;
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }

    let imageUrl = req.body.image || '';
    let publicId = '';

    if (req.file) {
      const uploadResult = uploadedImage = await uploadToCloudinary(req.file.buffer, 'restaurant/categories');
      imageUrl = uploadResult.secure_url;
      publicId = uploadResult.public_id;
    }

    const category = await Category.create({
      name: name.trim(),
      description: description ? description.trim() : '',
      image: imageUrl,
      cloudinaryPublicId: publicId,
      isActive: true,
    });

    imageCommitted = true;
    res.status(201).json({ success: true, message: 'Category created', data: category });
  } catch (error) {
    if (uploadedImage && !imageCommitted) await deleteFromCloudinary(uploadedImage.public_id);
    sendCrudError(res, error);
  }
};

// @route   PUT /api/categories/:id
// @access  Private / Admin Only
export const updateCategory = async (req, res) => {
  let uploadedImage, imageCommitted = false, oldImageId;
  try {
    const { id } = req.params;
    let category = await Category.findById(id);

    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    oldImageId = category.cloudinaryPublicId;
    const updates = pickFields(req.body, ["name","description","image","isActive"]);
    if (updates.name !== undefined) { if (typeof updates.name !== 'string' || !updates.name.trim()) throw inputError('Category name is required.'); updates.name = updates.name.trim(); }
    if (updates.description) updates.description = updates.description.trim();
    if (updates.isActive !== undefined) {
      updates.isActive = updates.isActive === 'true' || updates.isActive === true;
    }

    if (req.file) {
      const uploadResult = uploadedImage = await uploadToCloudinary(req.file.buffer, 'restaurant/categories');
      updates.image = uploadResult.secure_url;
      updates.cloudinaryPublicId = uploadResult.public_id;
    }

    category = await Category.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!category) throw Object.assign(new Error('This record was removed before it could be saved.'), { statusCode: 404 });
    imageCommitted = true;
    if (oldImageId && oldImageId !== category.cloudinaryPublicId) await deleteFromCloudinary(oldImageId);
    res.status(200).json({ success: true, message: 'Category updated', data: category });
  } catch (error) {
    if (uploadedImage && !imageCommitted) await deleteFromCloudinary(uploadedImage.public_id);
    sendCrudError(res, error);
  }
};

// @route   DELETE /api/categories/:id
// @access  Private / Admin Only
export const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    if (await Dish.exists({ category: category._id })) return res.status(409).json({ success: false, message: 'Move or delete dishes in this category before deleting it.' });
    await category.deleteOne();
    await deleteFromCloudinary(category.cloudinaryPublicId);
    res.status(200).json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    sendCrudError(res, error);
  }
};
