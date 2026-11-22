import { OAuth2Client } from 'google-auth-library';
const client = new OAuth2Client();
export async function verifyGoogleIdentity(idToken, verifier = client, audience = process.env.GOOGLE_WEB_CLIENT_ID) {
 if (typeof idToken !== 'string' || idToken.length < 20 || idToken.length > 12000) {
  const error = new Error('A valid Google ID token is required.'); error.status = 400; throw error;
 }
 if (!audience || !audience.endsWith('.apps.googleusercontent.com')) {
  const error = new Error('Google sign-in is not configured on the server. Set GOOGLE_WEB_CLIENT_ID.'); error.status = 503; throw error;
 }
 let payload;
 try { const ticket = await verifier.verifyIdToken({ idToken, audience }); payload = ticket.getPayload(); }
 catch { const error = new Error('Google sign-in could not be verified. Please try again.'); error.status = 401; throw error; }
 if (!payload?.sub || !payload.email || payload.email_verified !== true || !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss) || payload.aud !== audience || !payload.exp || payload.exp * 1000 <= Date.now()) {
  const error = new Error('A current Google account with a verified email is required.'); error.status = 401; throw error;
 }
 return { subject: payload.sub, email: payload.email.toLowerCase().trim(), name: typeof payload.name === 'string' ? payload.name.trim().slice(0, 100) : '' };
}
