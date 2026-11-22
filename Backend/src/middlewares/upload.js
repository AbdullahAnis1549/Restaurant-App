import multer from 'multer';

// Use memoryStorage so we can stream directly to Cloudinary without saving files to disk
const storage = multer.memoryStorage();

const parser = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1, fields: 40, parts: 42, fieldSize: 64 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('Choose a JPEG, PNG or WEBP image (maximum 5MB).'), { statusCode: 400 }), false);
    }
  },
});


const imageSignature = buffer => Buffer.isBuffer(buffer) && (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png' : buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 ? 'image/jpeg' : buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP' ? 'image/webp' : null);
export const upload = { single(field) { const handle = parser.single(field); return (req, res, next) => handle(req, res, error => {
 if (error) return next(error);
 if (req.file) { const type = imageSignature(req.file.buffer); if (!type || (req.file.mimetype.replace('image/jpg','image/jpeg') !== type)) return res.status(400).json({ message: 'File contents must match a JPEG, PNG or WEBP image.' }); }
 next();
}); } };
