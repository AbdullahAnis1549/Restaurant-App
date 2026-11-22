import { loginResult } from '../services/accountSecurity.js';
import User from '../models/User.js';
import { verifyGoogleIdentity } from '../services/googleIdentity.js';
import { serializeUser } from '../utils/authSession.js';
const failure = (res, error) => res.status(error.status || (error.code === 11000 ? 409 : 500)).json({ success: false, message: error.status ? error.message : error.code === 11000 ? 'This account changed during sign-in. Please try again.' : 'Google sign-in failed. Please try again.' });
export function createGoogleAuthHandlers(verifyIdentity = verifyGoogleIdentity) {
 return {
  googleLogin: async (req, res) => {
   try {
    const identity = await verifyIdentity(req.body?.idToken);
    let user = await User.findOne({ googleId: identity.subject });
    if (user && (user.isBlocked || user.role !== 'user')) return res.status(403).json({ success: false, message: 'This account cannot use customer Google sign-in.' });
    if (!user) {
     const existing = await User.findOne({ email: identity.email });
     if (existing) return res.status(409).json({ success: false, code: 'GOOGLE_LINK_REQUIRED', message: 'This email already has an account. Sign in with your password, then connect Google from Profile.' });
     user = await User.create({ googleId: identity.subject, emailVerifiedAt: new Date(), name: identity.name || identity.email.split('@')[0], email: identity.email, role: 'user' });
    }
    // Identity is keyed by Google's immutable subject, not client-supplied email or role.
    res.json(await loginResult(user));
   } catch (error) { failure(res, error); }
  },
  linkGoogle: async (req, res) => {
   try {
    const identity = await verifyIdentity(req.body?.idToken);
    const user = await User.findById(req.user._id).select('+password');
    if (!user || user.isBlocked || user.role !== 'user') return res.status(403).json({ message: 'Only active customer accounts may connect Google.' });
    if (user.email !== identity.email) return res.status(400).json({ message: 'Choose the Google account with the same email as your restaurant account.' });
    if (user.googleId && user.googleId !== identity.subject) return res.status(409).json({ message: 'A different Google identity is already connected.' });
    if (!user.googleId && (typeof req.body.password !== 'string' || !await user.comparePassword(req.body.password))) return res.status(401).json({ message: 'Enter your current restaurant account password to connect Google.' });
    const linked = await User.findOne({ googleId: identity.subject });
    if (linked && String(linked._id) !== String(user._id)) return res.status(409).json({ message: 'This Google account is already connected to another user.' });
    user.googleId = identity.subject; user.emailVerifiedAt ||= new Date(); await user.save();
    res.json({ success: true, user: serializeUser(user) });
   } catch (error) { failure(res, error); }
  },
 };
}
export const { googleLogin, linkGoogle } = createGoogleAuthHandlers();
