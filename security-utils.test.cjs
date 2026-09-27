'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSigningKey, isIdempotencyKey, isLocalTestTopupsEnabled, isLoopbackHost } = require('./security-utils.cjs');

test('signing keys must be canonical base64 with at least 256 bits', () => {
  const valid = Buffer.alloc(32, 7).toString('base64');
  assert.equal(parseSigningKey(valid)?.length, 32);
  assert.equal(parseSigningKey(Buffer.alloc(31, 7).toString('base64')), null);
  assert.equal(parseSigningKey('not-base64'), null);
  assert.equal(parseSigningKey(''), null);
});

test('idempotency keys accept bounded URL-safe values only', () => {
  assert.equal(isIdempotencyKey('a'.repeat(12)), true);
  assert.equal(isIdempotencyKey('a'.repeat(100)), true);
  assert.equal(isIdempotencyKey('a'.repeat(11)), false);
  assert.equal(isIdempotencyKey('a'.repeat(101)), false);
  assert.equal(isIdempotencyKey('bad/key/value'), false);
  assert.equal(isIdempotencyKey(null), false);
});

test('loopback detection covers localhost names and IP ranges without accepting public hosts', () => {
  for (const host of ['localhost', 'admin.localhost', '127.0.0.1', '127.8.4.2', '::1', '[::1]']) assert.equal(isLoopbackHost(host), true, host);
  for (const host of ['example.com', '10.0.0.1', '192.168.1.1', '::2']) assert.equal(isLoopbackHost(host), false, host);
});

test('test credit grants are local development only', () => {
  const local = { nodeEnv: 'development', allowTestTopups: 'true', appOrigin: 'http://localhost:4179' };
  assert.equal(isLocalTestTopupsEnabled(local), true);
  assert.equal(isLocalTestTopupsEnabled({ ...local, nodeEnv: 'production' }), false);
  assert.equal(isLocalTestTopupsEnabled({ ...local, appOrigin: 'https://localhost:4179' }), false);
  assert.equal(isLocalTestTopupsEnabled({ ...local, appOrigin: 'http://marketplace.example' }), false);
  assert.equal(isLocalTestTopupsEnabled({ ...local, appOrigin: 'http://localhost:4179/path' }), false);
  assert.equal(isLocalTestTopupsEnabled({ ...local, allowTestTopups: 'false' }), false);
});
