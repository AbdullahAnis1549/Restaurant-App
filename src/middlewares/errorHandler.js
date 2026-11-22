export const notFound = (req, res, next) => { const error = Object.assign(new Error('Endpoint not found.'), { statusCode: 404 }); next(error); };
export const errorHandler = (err, req, res, next) => {
 if (res.headersSent) return next(err);
 const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : err.name === 'MulterError' ? 400 : err.statusCode || err.status || 500;
 const message = err.code === 'LIMIT_FILE_SIZE' ? 'Image exceeds 5MB. Please choose a smaller image.' : status === 413 ? 'Request is too large.' : err.type === 'entity.parse.failed' ? 'Invalid JSON request.' : status >= 500 ? 'The request could not be completed. Please try again later.' : err.message || 'Invalid request.';
 res.status(status).json({ success: false, message });
};
