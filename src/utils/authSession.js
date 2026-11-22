import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
export function jwtSecret() {
 const secret = process.env.JWT_SECRET;
 if (!secret || /^(your_|change_me|placeholder|zaykora_super_secret)/i.test(secret) || (process.env.NODE_ENV === 'production' && secret.length < 32)) throw Object.assign(new Error('Authentication is not configured.'), { status: 503 });
 return secret;
}
export function generateToken(id, sessionVersion = 0, mfa = false) {
 return jwt.sign({ id: String(id), ver: sessionVersion, mfa }, jwtSecret(), { algorithm: 'HS256', jwtid: randomUUID(), issuer: 'zaykora-api', audience: 'zaykora-app', expiresIn: '30d' });
}
export const serializeUser = user => ({
 id: user._id, name: user.name, email: user.email, role: user.role,
 phone: user.phone || '', address: user.address || '', savedAddresses: user.savedAddresses || [],
 googleConnected: Boolean(user.googleId), emailVerified: Boolean(user.emailVerifiedAt), mfaEnabled: Boolean(user.mfaEnabled),
});
