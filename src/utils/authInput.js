export function validPassword(value, creating = true) { return typeof value === 'string' && value.length >= (creating ? 8 : 1) && Buffer.byteLength(value, 'utf8') <= 72; }
export function validText(value, max, required = false) { return typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0); }
export function validSavedAddresses(value) { return Array.isArray(value) && value.length <= 10 && value.every(row => row && validText(row.label || 'Home', 40, true) && validText(row.address, 500, true) && validText(row.phone || '', 30)); }
