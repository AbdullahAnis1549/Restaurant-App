import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
export function firebaseMessaging() {
 if (!getApps().length) {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_SERVICE_ACCOUNT_JSON && process.env.FIREBASE_USE_ADC !== 'true') {
   const error = new Error('Firebase is not configured. Follow FIREBASE_NOTIFICATIONS_SETUP.md and set GOOGLE_APPLICATION_CREDENTIALS on the backend.');
   error.status = 503; throw error;
  }
  try {
   const credential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) : applicationDefault();
   initializeApp({ credential });
  } catch { const error = new Error('Firebase credentials could not be loaded. Check backend configuration; do not put private keys in the mobile app.'); error.status = 503; throw error; }
 }
 return getMessaging();
}
