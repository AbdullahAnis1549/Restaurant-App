import test from 'node:test';
import assert from 'node:assert/strict';
import { stripeConfiguration } from '../src/utils/stripeConfig.js';
test('original Stripe variable names remain compatible and canonical keys take priority', () => {
 assert.deepEqual(stripeConfiguration({ SecretKey: 'old-secret', PublishableKey: 'old-public' }), { secretKey: 'old-secret', publishableKey: 'old-public', mode: 'test' });
 assert.equal(stripeConfiguration({ SecretKey: 'old', STRIPE_SECRET_KEY: 'canonical' }).secretKey, 'canonical');
 assert.equal(stripeConfiguration({ PublishableKey: 'old', STRIPE_PUBLISHABLE_KEY: 'canonical' }).publishableKey, 'canonical');
});
