import { initializeRuntime } from './config/runtime.js';
import mongoose from 'mongoose';
import { responsePrivacy } from './utils/responsePrivacy.js';
import { corsOrigin } from './utils/originPolicy.js';
import compression from 'compression';
import { imageDeliveryReplacer } from './utils/imageDelivery.js';
import adminRoutes from './routes/adminRoutes.js';
import customerStateRoutes from './routes/customerStateRoutes.js';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import authRoutes from './routes/authRoutes.js';
import dishRoutes from './routes/dishRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import bannerRoutes from './routes/bannerRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import settingRoutes from './routes/settingRoutes.js';
import promoRoutes from './routes/promoRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import { notFound, errorHandler } from './middlewares/errorHandler.js';
import { secureHeaders, sanitizeInputs, generalLimiter, authLimiter } from './middlewares/security.js';
import { stripeWebhook } from './controllers/paymentController.js';

const app = express();
app.disable('x-powered-by');
// Preserve source URLs for editing; publish small CDN variants at the JSON boundary.
app.set('json replacer', imageDeliveryReplacer);
app.use(compression({ threshold: 1024, level: 4, brotli: { params: { 1: 4 } } }));

// Security Middlewares: Headers & CORS
// CORS Configuration
const proxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (Number.isInteger(proxyHops) && proxyHops > 0 && proxyHops <= 2) app.set('trust proxy', proxyHops);
app.use(cors({
  origin: corsOrigin,
  exposedHeaders: ['Retry-After', 'X-RateLimit-Scope'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Cache-Control',
  ],
}));

// Security Middleware
app.use(secureHeaders);
app.use(responsePrivacy);

// Vercel imports this app directly, bypassing the standalone server bootstrap.
app.use(async (req, res, next) => {
  if (!process.env.VERCEL || !req.path.startsWith('/api/') || req.path === '/api/health') return next();
  try {
    await initializeRuntime();
    next();
  } catch (error) {
    console.error('[Runtime initialization failed]', error.code || error.name);
    res.status(503).json({ success: false, message: 'Service temporarily unavailable. Please try again later.' });
  }
});

app.post('/api/payment/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

// Payload Limits (Prevents memory exhaustion and oversized attacks)
app.use(express.json({ limit: '1mb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '64kb', parameterLimit: 100 }));

// NoSQL Query Injection Sanitization
app.use(sanitizeInputs);

// General Rate Limiter
app.use('/api', (req, res, next) => ['/health','/ready'].includes(req.path) ? next() : generalLimiter(req, res, next));

if (process.env.NODE_ENV !== 'production') {
  morgan.token('safe-path', req => req.path);
  app.use(morgan(':method :safe-path :status :response-time ms'));
}

// Health check endpoint (for connectivity monitoring & load balancers)
app.get('/api/ready', (_req,res) => res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({status:mongoose.connection.readyState === 1 ? 'ready' : 'unavailable'}));
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
  });
});

// Mount Routes with specialized rate limiting

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api/customer-state', customerStateRoutes);
app.use('/api/dishes', dishRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/promos', promoRoutes);
app.use('/api/notifications', notificationRoutes);

// Error Middlewares
app.use(notFound);
app.use(errorHandler);

export default app;
