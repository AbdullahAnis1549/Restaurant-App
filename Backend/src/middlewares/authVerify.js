import { createHash } from 'node:crypto';
import RevokedSession from '../models/RevokedSession.js';
import { jwtSecret } from '../utils/authSession.js';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
export function validateSessionClaims(claims, user) {
 if (!user) throw Object.assign(new Error('This account no longer exists.'), { status: 401 });
 if (user.mfaEnabled && claims.mfa !== true) throw Object.assign(new Error('Two-step verification is required. Sign in again.'), { status: 401 });
 if (user.isBlocked) throw Object.assign(new Error('This account is blocked.'), { status: 403, code: 'ACCOUNT_BLOCKED' });
 if (!Number.isSafeInteger(claims.ver ?? 0) || (claims.ver ?? 0) !== (user.sessionVersion || 0)) throw Object.assign(new Error('Your session was revoked. Please sign in again.'), { status: 401 });
}
export async function authenticateToken(token) {
 if (typeof token !== 'string' || token.length > 8192) throw Object.assign(new Error('Invalid session. Please sign in again.'), { status: 401 });
 const secret = jwtSecret();
 let claims;
 try { claims = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: 'zaykora-api', audience: 'zaykora-app' }); }
 catch { throw Object.assign(new Error('Session expired. Please sign in again.'), { status: 401 }); }
 if (!claims || typeof claims !== 'object' || typeof claims.id !== 'string' || !/^[a-fA-F0-9]{24}$/.test(claims.id) || !Number.isSafeInteger(claims.exp)) throw Object.assign(new Error('Invalid session. Please sign in again.'), { status: 401 });
 const tokenHash = createHash('sha256').update(token).digest('hex');
 const [user, revoked] = await Promise.all([User.findById(claims.id).select('-password'), RevokedSession.exists({ _id: tokenHash })]);
 if (revoked) throw Object.assign(new Error('This session was signed out. Please sign in again.'), { status: 401 });
 validateSessionClaims(claims, user);
 return { user, claims, tokenHash };
}
export const authVerify = async (req, res, next) => {
 try {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ') || !header.slice(7)) return res.status(401).json({ message: 'Authentication token required.' });
  const { user, claims, tokenHash } = await authenticateToken(header.slice(7));
  req.user = user; req.auth = claims; req.sessionHash = tokenHash; next();
 } catch (error) { return res.status(error.status || 500).json({ message: error.status ? error.message : 'Authentication is temporarily unavailable.', ...(error.code ? { code: error.code } : {}) }); }
};
