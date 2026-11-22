export const validateImage = (req, res, next) => {
  // If POST request (creation), image file or existing image URL is required
  if (req.method === 'POST') {
    if (!req.file && !req.body.image) {
      return res.status(400).json({
        success: false,
        message: 'Product image is required. Please upload an image file or provide an image URL.',
      });
    }
  }

  // If a file is provided via multipart/form-data
  if (req.file) {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid image format. Allowed formats: JPEG, JPG, PNG, WEBP.',
      });
    }

    const maxSizeBytes = 5 * 1024 * 1024; // 5MB
    if (req.file.size > maxSizeBytes) {
      return res.status(400).json({
        success: false,
        message: 'Image size exceeds maximum limit of 5MB.',
      });
    }
  }

  next();
};
