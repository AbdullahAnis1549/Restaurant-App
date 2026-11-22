import { publicDish } from '../utils/publicData.js';
import { sendCrudError, pickFields, validateNumbers, inputError, escapeSearch } from '../utils/crudErrors.js';
import mongoose from 'mongoose';
import Dish from '../models/Dish.js';
import Category from '../models/Category.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinaryUpload.js';

// Helper to resolve category ID whether an ObjectId or category name string is passed
const resolveCategoryId = async categoryInput => {
 if (typeof categoryInput !== 'string' || !categoryInput.trim()) return null;
 if (mongoose.isValidObjectId(categoryInput)) return (await Category.findById(categoryInput))?._id || null;
 return (await Category.findOne({ name: { $regex: new RegExp('^' + escapeSearch(categoryInput.trim()) + '$', 'i') } }))?._id || null;
};

// @route   GET /api/dishes
// @access  Public
export const getAllDishes = async (req, res) => {
  try {
    const { category, search, sort, special, popular, onlyAvailable } = req.query;
    let query = {};

    if (onlyAvailable === 'true') {
      query.isAvailable = true;
    }

    // Resolve category relation
    if (category && category !== 'All') {
      const catId = await resolveCategoryId(category);
      if (!catId) return res.status(200).json({ success: true, count: 0, data: [] });
      query.category = catId;
    }

    if (special === 'true') {
      query.special = true;
    }

    if (popular === 'true') {
      query.popular = true;
    }

    if (search && search.trim() !== '') {
      query.$or = [
        { name: { $regex: escapeSearch(search.trim()), $options: 'i' } },
        { description: { $regex: escapeSearch(search.trim()), $options: 'i' } },
      ];
    }

    let dishQuery = Dish.find(query).populate('category', 'name image description');

    // Sorting options matching frontend
    if (sort === 'Price: Low to High') {
      dishQuery = dishQuery.sort({ price: 1 });
    } else if (sort === 'Price: High to Low') {
      dishQuery = dishQuery.sort({ price: -1 });
    } else if (sort === 'Rating') {
      dishQuery = dishQuery.sort({ rating: -1 });
    } else {
      dishQuery = dishQuery.sort({ popular: -1, rating: -1, createdAt: -1 });
    }

    const dishes = await dishQuery;

    res.status(200).json({
      success: true,
      count: dishes.length,
      data: dishes.map(publicDish),
    });
  } catch (error) {
    sendCrudError(res, error);
  }
};

// @route   GET /api/dishes/:id
// @access  Public
export const getDishById = async (req, res) => {
  try {
    const dish = await Dish.findById(req.params.id).populate('category', 'name image description');
    if (!dish) {
      return res.status(404).json({ success: false, message: 'Dish not found' });
    }
    res.status(200).json({ success: true, data: publicDish(dish) });
  } catch (error) {
    sendCrudError(res, error);
  }
};

// @route   POST /api/dishes
// @access  Private / Admin Only
export const createDish = async (req, res) => {
  let uploadedImage, imageCommitted = false, oldImageId;
  try {
    const {
      name,
      category,
      price,
      oldPrice,
      rating,
      description,
      popular,
      special,
      prepTime,
      calories,
    } = req.body;

    validateNumbers(req.body, ['price', 'oldPrice', 'rating']);
    if (typeof name !== 'string' || !name.trim() || price === undefined || price === '') throw inputError('Dish name and price are required.');
    const categoryId = await resolveCategoryId(category);
    if (!categoryId) {
      return res.status(400).json({
        success: false,
        message: 'Valid Category ID or existing Category name is required.',
      });
    }

    let imageUrl = req.body.image;
    let publicId = '';

    // Upload to Cloudinary if file provided
    if (req.file) {
      const uploadResult = uploadedImage = await uploadToCloudinary(req.file.buffer, 'restaurant/dishes');
      imageUrl = uploadResult.secure_url;
      publicId = uploadResult.public_id;
    }

    if (!imageUrl) {
      imageUrl = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800';
      publicId = `default_${Date.now()}`;
    }

    const dish = await Dish.create({
      name,
      category: categoryId,
      price: Number(price),
      oldPrice: oldPrice ? Number(oldPrice) : null,
      rating: rating ? Number(rating) : 5.0,
      numReviews: 0,
      image: imageUrl,
      cloudinaryPublicId: publicId,
      description: description || 'Prepared with royal delicacy.',
      popular: popular === 'true' || popular === true,
      special: special === 'true' || special === true,
      isVeg: req.body.isVeg === 'true' || req.body.isVeg === true,
      spicyLevel: req.body.spicyLevel || 'Mild',
      prepTime: prepTime || '20-25 min',
      calories: calories || '600 kcal',
      isAvailable: true,
    });

    imageCommitted = true;
    const populatedDish = await Dish.findById(dish._id).populate('category', 'name image');

    res.status(201).json({
      success: true,
      message: 'Dish created successfully with Category relation',
      data: populatedDish,
    });
  } catch (error) {
    if (uploadedImage && !imageCommitted) await deleteFromCloudinary(uploadedImage.public_id);
    sendCrudError(res, error);
  }
};

// @route   PUT /api/dishes/:id
// @access  Private / Admin Only
export const updateDish = async (req, res) => {
  let uploadedImage, imageCommitted = false, oldImageId;
  try {
    const { id } = req.params;
    let dish = await Dish.findById(id);

    if (!dish) {
      return res.status(404).json({ success: false, message: 'Dish not found' });
    }

    oldImageId = dish.cloudinaryPublicId;
    const updates = pickFields(req.body, ["name","category","price","oldPrice","rating","description","popular","special","prepTime","calories","isAvailable","isVeg","spicyLevel","variants","addons"]);

    validateNumbers(updates, ['price', 'oldPrice', 'rating']);
    if (updates.name !== undefined && (typeof updates.name !== 'string' || !updates.name.trim())) throw inputError('Dish name is required.');
    // Resolve category if updating
    if (updates.category) {
      const categoryId = await resolveCategoryId(updates.category);
      if (!categoryId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category specified.',
        });
      }
      updates.category = categoryId;
    }

    if (updates.price !== undefined) updates.price = Number(updates.price);
    if (updates.oldPrice !== undefined) updates.oldPrice = updates.oldPrice ? Number(updates.oldPrice) : null;
    if (updates.rating !== undefined) updates.rating = Number(updates.rating);
    if (updates.popular !== undefined) updates.popular = updates.popular === 'true' || updates.popular === true;
    if (updates.special !== undefined) updates.special = updates.special === 'true' || updates.special === true;
    if (updates.isAvailable !== undefined) updates.isAvailable = updates.isAvailable === 'true' || updates.isAvailable === true;
    if (updates.isVeg !== undefined) updates.isVeg = updates.isVeg === 'true' || updates.isVeg === true;
    if (updates.spicyLevel !== undefined) updates.spicyLevel = updates.spicyLevel;

    if (updates.price !== undefined && updates.variants === undefined && dish.variants?.length && Number(dish.variants[0].price) === Number(dish.price)) {
      updates.variants = dish.variants.map((variant, index) => ({ name: variant.name, price: index === 0 ? updates.price : variant.price }));
    }
    // Cloudinary update if new file uploaded
    if (req.file) {
      const uploadResult = uploadedImage = await uploadToCloudinary(req.file.buffer, 'restaurant/dishes');
      updates.image = uploadResult.secure_url;
      updates.cloudinaryPublicId = uploadResult.public_id;
    }

    dish = await Dish.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    }).populate('category', 'name image');

    if (!dish) throw Object.assign(new Error('This record was removed before it could be saved.'), { statusCode: 404 });
    imageCommitted = true;
    if (oldImageId && oldImageId !== dish.cloudinaryPublicId) await deleteFromCloudinary(oldImageId);
    res.status(200).json({
      success: true,
      message: 'Dish updated successfully',
      data: dish,
    });
  } catch (error) {
    if (uploadedImage && !imageCommitted) await deleteFromCloudinary(uploadedImage.public_id);
    sendCrudError(res, error);
  }
};

// @route   DELETE /api/dishes/:id
// @access  Private / Admin Only
export const deleteDish = async (req, res) => {
  try {
    const { id } = req.params;
    const dish = await Dish.findById(id);

    if (!dish) {
      return res.status(404).json({ success: false, message: 'Dish not found' });
    }

    await dish.deleteOne();
    await deleteFromCloudinary(dish.cloudinaryPublicId);

    res.status(200).json({
      success: true,
      message: 'Dish deleted successfully',
      deletedId: id,
    });
  } catch (error) {
    sendCrudError(res, error);
  }
};
