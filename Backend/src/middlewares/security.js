// Secure HTTP Headers & Rate Limiting Middleware

// 1. In-memory Rate Limiter
class MemoryRateLimiter {
  constructor(windowMs, maxRequests, message, scope = 'general') {
    this.scope = scope;
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.message = message || 'Too many requests from this IP, please try again later.';
    this.hits = new Map();

    // Periodic sweep to prevent memory leak
    setInterval(() => {
      const now = Date.now();
      for (const [ip, record] of this.hits.entries()) {
        if (now - record.startTime > this.windowMs) {
          this.hits.delete(ip);
        }
      }
    }, Math.min(this.windowMs, 60000)).unref();
  }

  middleware() {
    return (req, res, next) => {
      const ip = req.ip || req.socket?.remoteAddress || 'unknown';
      const now = Date.now();

      let record = this.hits.get(ip);
      if (!record || now - record.startTime > this.windowMs) {
        record = { count: 1, startTime: now };
        this.hits.set(ip, record);
      } else {
        record.count++;
      }

      res.setHeader('X-RateLimit-Scope', this.scope);
      res.setHeader('X-RateLimit-Limit', this.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, this.maxRequests - record.count));

      if (record.count > this.maxRequests) {
        res.setHeader('Retry-After', Math.ceil((record.startTime + this.windowMs - now) / 1000));
        return res.status(429).json({
          success: false,
          message: this.message,
          retryAfterSeconds: Math.ceil((record.startTime + this.windowMs - now) / 1000),
        });
      }

      next();
    };
  }
}

export const generalLimiter = new MemoryRateLimiter(15 * 60 * 1000, 300, 'Too many requests. Please slow down.').middleware();
export const authLimiter = new MemoryRateLimiter(15 * 60 * 1000, 20, 'Too many authentication attempts. Please try again after 15 minutes.', 'auth').middleware();
export const orderLimiter = new MemoryRateLimiter(10 * 60 * 1000, 30, 'Too many order requests. Please wait a few moments before trying again.', 'orders').middleware();

// 2. Secure HTTP Headers
export const secureHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-Download-Options', 'noopen');
  res.removeHeader('X-Powered-By');
  next();
};

// 3. NoSQL Injection Sanitizer
const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  const clean = {};
  for (const key of Object.keys(obj)) {
    // Prevent Mongo operator injection ($where, $gt, etc) and prototype pollution
    if (key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    clean[key] = typeof obj[key] === 'object' ? sanitizeObject(obj[key]) : obj[key];
  }
  return clean;
};

export const sanitizeInputs = (req, res, next) => {
  if (req.body) req.body = sanitizeObject(req.body);
  if (req.query) req.query = sanitizeObject(req.query);
  if (req.params) req.params = sanitizeObject(req.params);
  next();
};
