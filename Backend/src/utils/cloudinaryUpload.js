import cloudinary from '../config/cloudinary.js';
import streamifier from 'streamifier';

export const uploadToCloudinary = (buffer, folder = 'restaurant/dishes') => new Promise((resolve, reject) => {
 const values = [process.env.CLOUDINARY_CLOUD_NAME, process.env.CLOUDINARY_API_KEY, process.env.CLOUDINARY_API_SECRET];
 if (values.some(value => !value || /^(your_|placeholder)/i.test(value))) return reject(Object.assign(new Error('Image storage is not configured. Check the Cloudinary environment variables on the backend.'), { statusCode: 503, expose: true }));
 if (!Buffer.isBuffer(buffer) || !buffer.length) return reject(Object.assign(new Error('The selected image is empty. Please choose another image.'), { statusCode: 400 }));
 const fail = error => {
  console.error('[Image storage]', error?.http_code || error?.code || 'upload failed');
  const credentials = [401, 403].includes(Number(error?.http_code));
  reject(Object.assign(new Error(credentials ? 'Image storage credentials were rejected. Check that the Cloudinary cloud name, API key and API secret belong to the same environment.' : 'Could not upload the image. Please retry or choose a smaller JPEG, PNG or WEBP image.'), { statusCode: credentials ? 503 : 502, expose: true }));
 };
 try {
  const stream = cloudinary.uploader.upload_stream({ folder, resource_type: 'image', timeout: 45000, transformation: [{ width: 1600, height: 1600, crop: 'limit' }, { quality: 'auto:good' }] }, (error, result) => {
   if (error || !result?.secure_url || !result?.public_id) return fail(error);
   resolve(result);
  });
  stream.on('error', fail);
  streamifier.createReadStream(buffer).on('error', fail).pipe(stream);
 } catch (error) { fail(error); }
});

export const deleteFromCloudinary = async publicId => {
 if (!publicId || /^(mock_public_id_|manual_|default_|banner_)/.test(publicId)) return;
 try { return await cloudinary.uploader.destroy(publicId); }
 catch (error) { console.error('[Image cleanup failed]', error?.http_code || 'provider unavailable'); }
};
