export function isAllowedOrigin(origin) {
 if (!origin) return true; // Native clients do not send browser Origin headers.
 let parsed; try { parsed = new URL(origin); } catch { return false; }
 if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) return false;
 const configured = [process.env.CORS_ALLOWED_ORIGINS || '', process.env.FRONTEND_URL || ''].join(',').split(',').map(value => value.trim()).filter(Boolean);
 if (configured.includes(origin)) return process.env.NODE_ENV !== 'production' || parsed.protocol === 'https:';
 if (process.env.NODE_ENV === 'production') return false;
 return /^(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(parsed.hostname);
}
export function corsOrigin(origin, callback) {
 if (isAllowedOrigin(origin)) callback(null, true);
 else callback(Object.assign(new Error('This browser origin is not permitted.'), { statusCode: 403 }));
}
