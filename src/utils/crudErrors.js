export function sendCrudError(res, error) {
 const status = error.statusCode || (error.code === 11000 ? 409 : ['ValidationError', 'CastError'].includes(error.name) ? 400 : 500);
 const message = error.code === 11000 ? 'This name or code already exists. Please choose another.' : error.name === 'CastError' ? 'A valid record identifier or field value is required.' : error.name === 'ValidationError' ? 'Invalid input. Check the required fields and values.' : status >= 500 && !error.expose ? 'Could not save changes. Please try again.' : error.message || 'Could not save changes. Please try again.';
 if (error.expose && res.locals) res.locals.safeError = true;
 return res.status(status).json({ success: false, message });
}
export function pickFields(body, fields) { return Object.fromEntries(fields.filter(key => body[key] !== undefined).map(key => [key, body[key]])); }
export function inputError(message) { return Object.assign(new Error(message), { statusCode: 400 }); }
export function escapeSearch(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
export function validateNumbers(body, keys) {
 for (const key of keys) if (body[key] !== undefined && body[key] !== null && body[key] !== '' && (!Number.isFinite(Number(body[key])) || Number(body[key]) < 0)) throw inputError(key + ' must be a non-negative number.');
}
