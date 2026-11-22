import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import { verifyGoogleIdentity } from '../src/services/googleIdentity.js';
import { createGoogleAuthHandlers } from '../src/controllers/googleAuthController.js';
const audience = 'example-server-client.apps.googleusercontent.com';
const identity = { subject: 'google-subject-123', email: 'guest@gmail.com', name: 'Google Guest' };
const payload = () => ({ sub: identity.subject, email: 'Guest@gmail.com', email_verified: true, name: identity.name, iss: 'https://accounts.google.com', aud: audience, exp: Math.floor(Date.now() / 1000) + 3600 });
const response = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const account = overrides => ({ _id: new mongoose.Types.ObjectId(), name: 'Guest', email: identity.email, role: 'user', isBlocked: false, ...overrides });
process.env.JWT_SECRET = 'google-auth-test-secret';
test('Google verifier requests the exact server audience and returns verified identity only', async () => {
 let options;
 const verifier = { verifyIdToken: async input => { options = input; return { getPayload: payload }; } };
 const result = await verifyGoogleIdentity('a-token-long-enough-for-validation', verifier, audience);
 assert.equal(options.audience, audience); assert.deepEqual(result, identity);
});
test('reject missing configuration, forged tokens, expired tokens, wrong issuer/audience and unverified email', async () => {
 await assert.rejects(verifyGoogleIdentity('', {}, audience), { status: 400 });
 await assert.rejects(verifyGoogleIdentity('a-token-long-enough-for-validation', {}, ''), { status: 503 });
 await assert.rejects(verifyGoogleIdentity('a-token-long-enough-for-validation', { verifyIdToken: async () => { throw new Error('bad signature'); } }, audience), { status: 401 });
 for (const fields of [{ email_verified: false }, { exp: 1 }, { aud: 'other-client' }, { iss: 'https://attacker.example' }, { sub: '' }]) {
  await assert.rejects(verifyGoogleIdentity('a-token-long-enough-for-validation', { verifyIdToken: async () => ({ getPayload: () => ({ ...payload(), ...fields }) }) }, audience), { status: 401 });
 }
});
test('Google-only accounts do not require a password; local accounts still require one', async () => {
 const googleUser = new User({ name: 'Guest', email: identity.email, googleId: identity.subject });
 await googleUser.validate(); assert.equal(await googleUser.comparePassword('anything'), false);
 await assert.rejects(new User({ name: 'Guest', email: identity.email }).validate(), /password/);
});
test('first Google sign-in creates a customer using only verified claims and issues existing app JWT', async t => {
 let inserted;
 t.mock.method(User, 'findOne', async () => null);
 t.mock.method(User, 'create', async data => { inserted = data; return account(data); });
 const { googleLogin } = createGoogleAuthHandlers(async () => identity);
 const res = response(); await googleLogin({ body: { idToken: 'test', role: 'admin', email: 'attacker@example.test', name: 'Attacker' } }, res);
 assert.equal(res.statusCode, 200); assert.equal(inserted.role, 'user'); assert.equal(inserted.email, identity.email); assert.equal(inserted.googleId, identity.subject); assert.equal(inserted.password, undefined); assert.equal(res.body.user.googleConnected, true); assert.equal(res.body.user.googleId, undefined);
 assert.equal(jwt.verify(res.body.token, process.env.JWT_SECRET).id, String(res.body.user.id));
});
test('existing password account is never silently linked by matching email', async t => {
 let queries = 0;
 t.mock.method(User, 'findOne', async () => ++queries === 1 ? null : account());
 const { googleLogin } = createGoogleAuthHandlers(async () => identity);
 const res = response(); await googleLogin({ body: { idToken: 'test' } }, res);
 assert.equal(res.statusCode, 409); assert.equal(res.body.code, 'GOOGLE_LINK_REQUIRED'); assert.equal(res.body.token, undefined);
});
test('blocked and administrator accounts cannot use customer Google sign-in', async t => {
 for (const flags of [{ isBlocked: true }, { role: 'admin' }]) {
  t.mock.method(User, 'findOne', async () => account({ googleId: identity.subject, ...flags }));
  const { googleLogin } = createGoogleAuthHandlers(async () => identity);
  const res = response(); await googleLogin({ body: { idToken: 'test' } }, res);
  assert.equal(res.statusCode, 403); assert.equal(res.body.token, undefined);
 }
});
test('existing Google login resolves immutable Google subject and does not create another user', async t => {
 const existing = account({ googleId: identity.subject });
 t.mock.method(User, 'findOne', async filter => { assert.equal(filter.googleId, identity.subject); return existing; });
 const { googleLogin } = createGoogleAuthHandlers(async () => identity);
 const res = response(); await googleLogin({ body: { idToken: 'test' } }, res); assert.equal(String(res.body.user.id), String(existing._id));
});
test('linking rejects a wrong password, different email, and identity already linked elsewhere', async t => {
 const { linkGoogle } = createGoogleAuthHandlers(async () => identity);
 let current = account({ comparePassword: async () => false });
 t.mock.method(User, 'findById', () => ({ select: async () => current }));
 let res = response(); await linkGoogle({ user: current, body: { idToken: 'test', password: 'wrong' } }, res); assert.equal(res.statusCode, 401);
 current = account({ email: 'another@example.test' }); res = response(); await linkGoogle({ user: current, body: { idToken: 'test', password: 'secret' } }, res); assert.equal(res.statusCode, 400);
 current = account({ comparePassword: async () => true }); t.mock.method(User, 'findOne', async () => account({ googleId: identity.subject }));
 res = response(); await linkGoogle({ user: current, body: { idToken: 'test', password: 'secret' } }, res); assert.equal(res.statusCode, 409);
});
test('authenticated password re-verification links Google to the same customer', async t => {
 let saved = false;
 const current = account({ comparePassword: async password => password === 'correct', save: async () => { saved = true; } });
 t.mock.method(User, 'findById', () => ({ select: async () => current })); t.mock.method(User, 'findOne', async () => null);
 const { linkGoogle } = createGoogleAuthHandlers(async () => identity);
 const res = response(); await linkGoogle({ user: current, body: { idToken: 'test', password: 'correct' } }, res);
 assert.equal(res.statusCode, 200); assert.ok(saved); assert.equal(current.googleId, identity.subject); assert.equal(res.body.user.googleConnected, true); assert.equal(res.body.user.password, undefined);
});
test('duplicate Google account races return a recoverable conflict, without raw database errors', async t => {
 t.mock.method(User, 'findOne', async () => null); t.mock.method(User, 'create', async () => { const error = new Error('database private details'); error.code = 11000; throw error; });
 const { googleLogin } = createGoogleAuthHandlers(async () => identity);
 const res = response(); await googleLogin({ body: { idToken: 'test' } }, res); assert.equal(res.statusCode, 409); assert.doesNotMatch(res.body.message, /private details/);
});


test('connected Google identity cannot bypass enabled authenticator verification',async t=>{const {default:Challenge}=await import('../src/models/AuthChallenge.js');let issued;t.mock.method(User,'findOne',async()=>account({mfaEnabled:true,googleId:identity.subject,sessionVersion:2}));t.mock.method(Challenge,'create',async value=>{issued=value;return value;});const res=response();await createGoogleAuthHandlers(async()=>identity).googleLogin({body:{idToken:'verified-fixture'}},res);assert.equal(res.body.mfaRequired,true);assert.equal(res.body.token,undefined);assert.equal(res.body.user,undefined);assert.equal(issued.sessionVersion,2);assert.notEqual(issued._id,res.body.challengeId);});
