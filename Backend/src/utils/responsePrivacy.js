import { randomUUID } from 'node:crypto';
import { imageDeliveryReplacer } from './imageDelivery.js';
const hidden = new Set(['encryptedsecret','pendingsecret','recoveryhashes','codehash','laststep','password','passwordhash','currentpassword','newpassword','confirmpassword','otphash','otp','resettokenhash','resettokenexpiresat','verifiedat','sessionversion','sessionhash','googleid','checkoutpayloadhash','checkoutrequestid','paymentresult','deliveryemailsent','cloudinarypublicid','logocloudinarypublicid','privatekey','apikey','apisecret','secretkey','secret','serviceaccount','credentials','authorization','accesstoken','refreshtoken','idtoken','devicetoken','fcmtoken','stack']);
const authRoutes = new Set(['/api/auth/login','/api/auth/register','/api/auth/google','/api/auth/mfa/verify','/api/auth/mfa/enable','/api/auth/mfa/disable']);
export function privacyReplacer(context, root) {
 return function(key, value) {
  const name = key.replace(/[_-]/g, '').toLowerCase();
  if (key === 'challengeId' && !(this === root && context.success && context.method === 'POST' && ['/api/auth/login','/api/auth/google'].includes(context.path))) return undefined;
  if (['setupKey','recoveryCodes'].includes(key) && !(this === root && context.authenticated && context.success && context.method === 'POST' && context.path === (key === 'setupKey' ? '/api/auth/mfa/setup' : '/api/auth/mfa/enable'))) return undefined;
  if (key === '__v' || hidden.has(name)) return undefined;
  if (name === 'token' && !(this === root && context.success && ((authRoutes.has(context.path) && context.method === 'POST') || (context.path === '/api/auth/profile' && context.method === 'PUT' && context.authenticated)))) return undefined;
  if (name === 'resettoken' && !(this === root && context.success && context.path === '/api/auth/verify-reset-otp' && context.method === 'POST')) return undefined;
  if (name === 'clientsecret' && !(this === root && context.authenticated && context.success && context.path === '/api/payment/payment-sheet' && context.method === 'POST')) return undefined;
  if (/(?:password|secret|secretkey|privatekey|apikey|token|tokenhash)$/.test(name) && !['token', 'resettoken', 'clientsecret'].includes(name)) return undefined;
  if (['mongouri','databaseurl','connectionstring'].includes(name)) return undefined;
  return imageDeliveryReplacer(key, value);
 };
}
export function responsePrivacy(req, res, next) {
 const requestId = randomUUID(); res.setHeader('X-Request-ID', requestId);
 res.setHeader('Cache-Control', 'no-store'); res.setHeader('Pragma', 'no-cache');
 res.json = function(body) {
  if (res.statusCode >= 500 && !res.locals.safeError) body = { success: false, message: 'The request could not be completed. Please try again later.', requestId };
  const path = req.originalUrl.split('?')[0].replace(/\/+$/, '') || '/';
  const replacer = privacyReplacer({ path, method: req.method, success: res.statusCode < 400, authenticated: !!req.user }, body);
  const json = JSON.stringify(body, replacer).replace(/[<>&]/g, char => ({'<':'\\u003c','>':'\\u003e','&':'\\u0026'})[char]);
  return res.type('application/json').send(json);
 };
 next();
}
