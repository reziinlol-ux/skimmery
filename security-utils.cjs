'use strict';

const net = require('node:net');

function parseSigningKey(value) {
  if (typeof value !== 'string' || !value) return null;
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length < 32 || bytes.toString('base64') !== value) return null;
  return bytes;
}

function isIdempotencyKey(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{12,100}$/.test(value);
}

function isLoopbackHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  const family = net.isIP(host);
  if (family === 4) return host.startsWith('127.');
  if (family === 6) return host === '::1';
  return false;
}

function isLocalTestTopupsEnabled({ nodeEnv, allowTestTopups, appOrigin }) {
  if (nodeEnv !== 'development' || allowTestTopups !== 'true' || typeof appOrigin !== 'string') return false;
  try {
    const url = new URL(appOrigin);
    return url.protocol === 'http:' && isLoopbackHost(url.hostname) && url.pathname === '/' && !url.search && !url.hash;
  } catch {
    return false;
  }
}

module.exports = { parseSigningKey, isIdempotencyKey, isLocalTestTopupsEnabled, isLoopbackHost };
