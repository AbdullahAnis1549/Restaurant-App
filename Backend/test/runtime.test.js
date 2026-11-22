import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeInitializer } from '../src/config/runtime.js';

test('concurrent requests share initialization and reuse successful result', async () => {
  let calls = 0;
  const start = createRuntimeInitializer(async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); });
  await Promise.all(Array.from({ length: 20 }, () => start()));
  await start();
  assert.equal(calls, 1);
});

test('initialization failures reject all waiting requests and allow retry', async () => {
  let calls = 0;
  const start = createRuntimeInitializer(async () => { if (++calls === 1) throw new Error('unavailable'); });
  const results = await Promise.allSettled([start(), start()]);
  assert.ok(results.every(result => result.status === 'rejected'));
  await start();
  assert.equal(calls, 2);
});
