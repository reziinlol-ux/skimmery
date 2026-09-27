const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const { Pool } = require('pg');
const { OAuth2Client } = require('google-auth-library');
const { parseSigningKey, isIdempotencyKey, isLocalTestTopupsEnabled, isLoopbackHost } = require('./security-utils.cjs');

const app = express();
const root = __dirname;
const publicFiles = new Set(['index.html', 'app.js', 'casino-guard.js', 'styles.css']);
for (const [folder, extensions] of [['icons', new Set(['.svg', '.png'])], ['assets', new Set(['.png', '.jpg', '.webp'])]]) {
  const directory = path.join(root, folder);
  if (fs.existsSync(directory)) for (const name of fs.readdirSync(directory)) if (extensions.has(path.extname(name).toLowerCase())) publicFiles.add(`${folder}/${name}`);
}
const casinoBundle = path.join(root, 'casino-dist');
if (fs.existsSync(casinoBundle)) for (const name of fs.readdirSync(casinoBundle)) if (['.js', '.css'].includes(path.extname(name).toLowerCase())) publicFiles.add(`casino-dist/${name}`);
const port = Number(process.env.PORT || 4179);
const production = process.env.NODE_ENV === 'production';
const origin = process.env.APP_ORIGIN || `http://localhost:${port}`;
const cookieSecure = new URL(origin).protocol === 'https:';
const sessionCookie = cookieSecure ? '__Host-gtm_session' : 'gtm_session';
const pendingCookie = cookieSecure ? '__Host-gtm_pending' : 'gtm_pending';
const oauthCookie = cookieSecure ? '__Host-gtm_oauth' : 'gtm_oauth';
const cookieBase = { httpOnly: true, secure: cookieSecure, sameSite: 'lax', path: '/' };
function databaseSsl(url) {
  if (!url) return false;
  const host = new URL(url).hostname;
  return host.endsWith('.railway.internal') || (!production && process.env.PGSSLMODE === 'disable') ? false : { rejectUnauthorized: true };
}
const poolSize = Number(process.env.DB_POOL_SIZE || 8);
if (!Number.isInteger(poolSize) || poolSize < 1 || poolSize > 20) throw new Error('DB_POOL_SIZE must be an integer between 1 and 20.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: databaseSsl(process.env.DATABASE_URL), max: poolSize, idleTimeoutMillis: 10000, connectionTimeoutMillis: 5000, statement_timeout: 5000, idle_in_transaction_session_timeout: 10000, application_name: 'gorilla-tag-marketplace' });
const google = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
const pendingKey = parseSigningKey(process.env.PENDING_SIGNING_KEY);
const oauthKey = parseSigningKey(process.env.OAUTH_STATE_SIGNING_KEY);
const allowedOrigin = new URL(origin).origin;
const testTopupsEnabled = Boolean(process.env.DATABASE_URL) && isLocalTestTopupsEnabled({ nodeEnv: process.env.NODE_ENV, allowTestTopups: process.env.ALLOW_TEST_TOPUPS, appOrigin: origin });

function requiredConfiguration() {
  const missing = ['DATABASE_URL', 'APP_ORIGIN'].filter((key) => !process.env[key]);
  if (!pendingKey) missing.push('PENDING_SIGNING_KEY (base64, at least 32 bytes)');
  if (!oauthKey) missing.push('OAUTH_STATE_SIGNING_KEY (base64, at least 32 bytes)');
  if (missing.length) throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  if (production && (!cookieSecure || isLoopbackHost(new URL(origin).hostname))) throw new Error('Production requires APP_ORIGIN to be an HTTPS public origin.');
  if (production && process.env.PGSSLMODE === 'disable') throw new Error('PGSSLMODE=disable is not permitted in production.');
  if (new URL(origin).pathname !== '/' || new URL(origin).search || new URL(origin).hash) throw new Error('APP_ORIGIN must be the site origin without a path, query, or fragment.');
  if (process.env.GOOGLE_CLIENT_ID && new URL(process.env.GOOGLE_REDIRECT_URI).toString() !== new URL('/auth/google/callback', origin).toString()) throw new Error('GOOGLE_REDIRECT_URI must exactly match APP_ORIGIN/auth/google/callback.');
  if (process.env.ALLOW_TEST_TOPUPS === 'true' && !testTopupsEnabled) throw new Error('Test credit top-ups are allowed only on a local development origin.');
}

function sign(value, key) {
  if (!Buffer.isBuffer(key) || key.length < 32) throw new Error('A strong signing key is required.');
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  const mac = crypto.createHmac('sha256', key).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}
function unsign(value, key) {
  if (!Buffer.isBuffer(key) || key.length < 32 || !value || typeof value !== 'string') return null;
  const [payload, mac, extra] = value.split('.');
  if (!payload || !mac || extra) return null;
  const expected = crypto.createHmac('sha256', key).update(payload).digest();
  let actual;
  try { actual = Buffer.from(mac, 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
}
function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }
function tokenHash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function cleanUser(row) { return { id: row.id, username: row.username, email: row.email, picture: row.picture_url }; }
function sendError(res, status, code, message) { return res.status(status).json({ error: { code, message } }); }
async function withinLimit(key, max, seconds) {
  const hashed = crypto.createHash('sha256').update(key).digest('hex');
  const result = await pool.query('select marketplace_rate_limit($1,$2,$3) as allowed', [hashed, max, seconds]);
  if (!result.rows[0]?.allowed) { const error = new Error('Too many requests. Wait a moment and try again.'); error.status = 429; error.publicCode = 'rate_limited'; throw error; }
}

app.disable('x-powered-by');
app.set('trust proxy', production ? 1 : false);
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cache-Control': 'no-store' });
  if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https://*.googleusercontent.com data:; style-src 'self' https://fonts.googleapis.com; style-src-attr 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  next();
});
app.use(express.json({ limit: '16kb', strict: true }));
app.use((req, _res, next) => {
  const cookies = Object.create(null);
  for (const item of String(req.headers.cookie || '').split(';')) {
    const index = item.indexOf('='); if (index < 1) continue;
    try { cookies[item.slice(0, index).trim()] = decodeURIComponent(item.slice(index + 1).trim()); } catch {}
  }
  req.cookies = cookies; next();
});

function requireSameOrigin(req, res, next) {
  const requestOrigin = req.get('origin');
  if (!requestOrigin || requestOrigin !== allowedOrigin) return sendError(res, 403, 'origin_rejected', 'Request origin is not allowed.');
  next();
}
function route(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch((error) => {
    if (error.type === 'entity.too.large') return sendError(res, 413, 'request_too_large', 'The request is too large.');
    if (error instanceof SyntaxError && Object.prototype.hasOwnProperty.call(error, 'body')) return sendError(res, 400, 'invalid_request', 'The request body is invalid.');
    if (error.status && error.publicCode) return sendError(res, error.status, error.publicCode, error.message);
    if (error.code === '23505') {
      if (error.constraint === 'marketplace_signup_ips_pkey') return sendError(res, 409, 'ip_account_limit', 'An account has already been created from this IP address.');
      if (error.constraint === 'marketplace_email_unique') return sendError(res, 409, 'email_taken', 'This email already has an account.');
      if (req.path === '/api/username') return sendError(res, 409, 'username_taken', 'That username is already in use.');
      if (req.path === '/api/daily-bonus/claim') return sendError(res, 409, 'already_claimed', 'You have already claimed today.');
      return sendError(res, 409, 'already_processed', 'This request was already processed.');
    }
    if (error.code === 'P0001') {
      const messages = { insufficient_credits: 'Your balance is too low for that tip.', recipient_not_found: 'That username was not found.', bonus_not_available: 'A daily bonus is not available yet.', test_topups_disabled: 'Credit purchases are not available yet.', invalid_tip: 'Enter a valid username and amount.', invalid_package: 'Choose one of the listed credit packages.' };
      const known = messages[error.message];
      return sendError(res, 409, known ? error.message : 'operation_rejected', known || 'This operation cannot be completed.');
    }
    console.error('request failed', { path: req.path, code: error.code || 'internal_error' });
    if (!res.headersSent) sendError(res, 500, 'internal_error', 'The request could not be completed.');
  });
}
async function withTransaction(work) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
  catch (error) { try { await client.query('ROLLBACK'); } catch {} throw error; }
  finally { client.release(); }
}
async function currentUser(req, res, next) {
  const token = req.cookies?.[sessionCookie];
  if (!token) return sendError(res, 401, 'sign_in_required', 'Sign in to use this feature.');
  try {
    await withinLimit(`api:${req.ip}`, 120, 60);
    const row = await withTransaction(async (db) => {
      await db.query("select set_config('app.session_hash', $1, true)", [tokenHash(token)]);
      const found = await db.query('select u.id, u.username, u.email, u.picture_url from marketplace_sessions s join marketplace_users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > now() and s.revoked_at is null', [tokenHash(token)]);
      return found.rows[0] || null;
    });
    if (!row) return sendError(res, 401, 'session_expired', 'Your session expired. Sign in again.');
    req.user = cleanUser(row); req.sessionToken = token; next();
  } catch (error) { next(error); }
}
async function userTransaction(req, work) {
  return withTransaction(async (db) => { await db.query("select set_config('app.user_id', $1, true)", [req.user.id]); return work(db); });
}
function setSessionCookie(res, token) { res.cookie(sessionCookie, token, { ...cookieBase, maxAge: 30 * 24 * 60 * 60 * 1000 }); }
function clearAuthCookies(res) { for (const name of [sessionCookie, pendingCookie, oauthCookie]) res.clearCookie(name, cookieBase); }
function oauthClientId() { return process.env.GOOGLE_CLIENT_ID || ''; }

app.get('/api/health', route(async (_req, res) => {
  if (!process.env.DATABASE_URL) return sendError(res, 503, 'database_not_configured', 'Marketplace database is not configured.');
  await pool.query('select 1');
  res.json({ ok: true });
}));
app.get('/api/config', (_req, res) => res.json({ googleClientId: oauthClientId(), databaseConfigured: Boolean(process.env.DATABASE_URL), testTopupsEnabled, emailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM) || !production, localEmailPreview: !production && !process.env.RESEND_API_KEY }));
app.use('/api', (req, res, next) => {
  if (!process.env.DATABASE_URL && req.path !== '/config' && req.path !== '/health') return sendError(res, 503, 'database_not_configured', 'Marketplace database is not configured.');
  next();
});

app.get('/api/profile/avatar', currentUser, route(async (req, res) => {
  let imageUrl;
  try { imageUrl = new URL(req.user.picture); } catch { return res.sendStatus(404); }
  if (imageUrl.protocol !== 'https:' || imageUrl.port || !(imageUrl.hostname === 'googleusercontent.com' || imageUrl.hostname.endsWith('.googleusercontent.com'))) return res.sendStatus(404);
  const image = await fetch(imageUrl, { redirect: 'error', signal: AbortSignal.timeout(5000) });
  const type = image.headers.get('content-type')?.split(';')[0].toLowerCase();
  if (!image.ok || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(type)) return res.sendStatus(404);
  const announcedSize = Number(image.headers.get('content-length') || 0);
  if (announcedSize > 2_000_000) return res.sendStatus(413);
  const bytes = Buffer.from(await image.arrayBuffer());
  if (!bytes.length || bytes.length > 2_000_000) return res.sendStatus(413);
  res.set({ 'Content-Type': type, 'Cache-Control': 'private, max-age=3600', 'Cross-Origin-Resource-Policy': 'same-origin' }).send(bytes);
}));

app.get('/auth/google/start', route(async (_req, res) => {
  if (!process.env.DATABASE_URL) return sendError(res, 503, 'database_not_configured', 'The marketplace database must be connected before sign-in can create an account.');
  if (!oauthClientId() || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI || !oauthKey) return sendError(res, 503, 'oauth_not_configured', 'Google sign-in is not configured yet.');
  await withinLimit(`google-start:${_req.ip}`, 15, 60);
  const verifier = await google.generateCodeVerifierAsync();
  const nonce = randomToken(24); const state = randomToken(32);
  const envelope = { verifier: verifier.codeVerifier, nonce, state, exp: Date.now() + 10 * 60 * 1000 };
  res.cookie(oauthCookie, sign(envelope, oauthKey), { ...cookieBase, maxAge: 10 * 60 * 1000 });
  const url = google.generateAuthUrl({ access_type: 'online', prompt: 'select_account', scope: ['openid', 'email', 'profile'], state, nonce, code_challenge: verifier.codeChallenge, code_challenge_method: 'S256' });
  res.redirect(302, url);
}));

app.get('/auth/google/callback', route(async (req, res) => {
  if (!process.env.DATABASE_URL || !oauthClientId() || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI || !oauthKey || !pendingKey) return sendError(res, 503, 'oauth_not_configured', 'Google sign-in is not configured yet.');
  await withinLimit(`google-callback:${req.ip}`, 30, 60);
  const saved = unsign(req.cookies?.[oauthCookie], oauthKey);
  res.clearCookie(oauthCookie, cookieBase);
  if (!saved || saved.exp < Date.now() || typeof req.query.state !== 'string' || req.query.state !== saved.state || typeof req.query.code !== 'string') return res.redirect('/#signin-error');
  const { tokens } = await google.getToken({ code: req.query.code, codeVerifier: saved.verifier, redirect_uri: process.env.GOOGLE_REDIRECT_URI });
  if (!tokens.id_token) return res.redirect('/#signin-error');
  const ticket = await google.verifyIdToken({ idToken: tokens.id_token, audience: oauthClientId() });
  const claims = ticket.getPayload();
  if (!claims?.sub || claims.nonce !== saved.nonce || !claims.email_verified || !claims.email) return res.redirect('/#signin-error');
  const found = await withTransaction(async (db) => {
    await db.query("select set_config('app.google_subject', $1, true)", [claims.sub]);
    return (await db.query('select id, username, email, picture_url from marketplace_users where google_subject = $1', [claims.sub])).rows[0] || null;
  });
  if (!found) {
    const pending = sign({ sub: claims.sub, email: claims.email.toLowerCase(), ipHash: crypto.createHmac('sha256', pendingKey).update(String(req.ip).replace(/^::ffff:/,'')).digest('hex'), picture: String(claims.picture || '').slice(0, 1000), exp: Date.now() + 10 * 60 * 1000 }, pendingKey);
    res.cookie(pendingCookie, pending, { ...cookieBase, maxAge: 10 * 60 * 1000 });
    return res.redirect('/#choose-username');
  }
  const token = randomToken();
  await withTransaction(async (db) => { await db.query("select set_config('app.user_id', $1, true)", [found.id]); await db.query('insert into marketplace_sessions (user_id, token_hash, expires_at) values ($1, $2, now() + interval \'30 days\')', [found.id, tokenHash(token)]); });
  setSessionCookie(res, token);
  res.redirect('/#marketplace');
}));

app.get('/api/me', currentUser, route(async (req, res) => {
  const data = await userTransaction(req, async (db) => {
    const wallet = await db.query('select balance, total_topups from marketplace_wallets where user_id = $1', [req.user.id]);
    const unread = await db.query('select count(*)::int as count from marketplace_orders where user_id = $1 and kind = \'account\' and viewed_at is null', [req.user.id]);
    const claimed = await db.query("select exists(select 1 from marketplace_daily_claims where user_id=$1 and claim_date=(now() at time zone 'UTC')::date) as claimed", [req.user.id]);
    return { wallet: wallet.rows[0], unreadPurchases: unread.rows[0].count, dailyClaimed: claimed.rows[0].claimed };
  });
  res.json({ user: req.user, balance: Number(data.wallet?.balance || 0), totalTopups: Number(data.wallet?.total_topups || 0), unreadPurchases: data.unreadPurchases, dailyClaimed: data.dailyClaimed });
}));

app.post('/api/username', requireSameOrigin, route(async (req, res) => {
  if (!pendingKey) return sendError(res, 503, 'account_setup_unavailable', 'Account setup is not configured yet.');
  await withinLimit(`username:${req.ip}`, 8, 3600);
  const pending = unsign(req.cookies?.[pendingCookie], pendingKey);
  if (!pending || pending.exp < Date.now()) return sendError(res, 401, 'username_setup_expired', 'Continue with Google again to set your username.');
  const username = typeof req.body?.username === 'string' ? req.body.username.normalize('NFKC').trim() : '';
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return sendError(res, 400, 'invalid_username', 'Use 3 to 20 letters, numbers, or underscores.');
  const id = crypto.randomUUID(); const token = randomToken();
  const created = await withTransaction(async (db) => {
    await db.query("select set_config('app.user_id', $1, true)", [id]);
    const user = await db.query('insert into marketplace_users (id, google_subject, email, username, picture_url) values ($1, $2, $3, $4, $5) returning id, username, email, picture_url', [id, pending.sub, pending.email, username, pending.picture]);
    await db.query('insert into marketplace_signup_ips(ip_hash,user_id) values($1,$2)', [pending.ipHash, id]);
    await db.query('insert into marketplace_wallets (user_id) values ($1)', [id]);
    await db.query('insert into marketplace_sessions (user_id, token_hash, expires_at) values ($1, $2, now() + interval \'30 days\')', [id, tokenHash(token)]);
    return user.rows[0];
  });
  res.clearCookie(pendingCookie, cookieBase); setSessionCookie(res, token); res.json({ user: cleanUser(created), firstLogin: true });
}));

app.post('/api/logout', requireSameOrigin, currentUser, route(async (req, res) => {
  await userTransaction(req, (db) => db.query('update marketplace_sessions set revoked_at = now() where token_hash = $1', [tokenHash(req.sessionToken)]));
  clearAuthCookies(res); res.json({ ok: true });
}));

require('./casino-backend.cjs')({ app, pool, route, currentUser, requireSameOrigin, userTransaction, withTransaction, withinLimit, sendError, setSessionCookie, tokenHash, cleanUser, production, pendingKey });

app.get('/api/orders', currentUser, route(async (req, res) => {
  const rows = await userTransaction(req, async (db) => {
    await db.query('update marketplace_orders set viewed_at = now() where user_id = $1 and kind = \'account\' and viewed_at is null', [req.user.id]);
    return (await db.query('select id, kind, product_key, amount, created_at, status from marketplace_orders where user_id = $1 order by created_at desc limit 100', [req.user.id])).rows;
  });
  res.json({ orders: rows.map((row) => ({ id: row.id, kind: row.kind, product: row.product_key, amount: Number(row.amount), date: row.created_at, status: row.status })) });
}));

app.get('/api/notifications', currentUser, route(async (req, res) => {
  const rows = await userTransaction(req, async (db) => (await db.query('select id, title, body, created_at, read_at from marketplace_notifications where user_id = $1 order by created_at desc limit 20', [req.user.id])).rows);
  res.json({ notifications: rows });
}));
app.post('/api/notifications/read', requireSameOrigin, currentUser, route(async (req, res) => {
  await userTransaction(req, (db) => db.query('update marketplace_notifications set read_at = coalesce(read_at, now()) where user_id = $1', [req.user.id])); res.json({ ok: true });
}));

app.post('/api/test-topups', requireSameOrigin, currentUser, route(async (req, res) => {
  if (!testTopupsEnabled) return sendError(res, 404, 'not_available', 'Credit purchases are not available yet.');
  const credits = Number(req.body?.credits);
  if (![900, 1600, 2000, 3000, 10000].includes(credits)) return sendError(res, 400, 'invalid_package', 'Choose one of the listed credit packages.');
  const idempotencyKey = req.get('idempotency-key') || '';
  if (!isIdempotencyKey(idempotencyKey)) return sendError(res, 400, 'idempotency_required', 'Refresh and try again.');
  await withinLimit(`topup:${req.user.id}`, 5, 3600);
  const data = await userTransaction(req, async (db) => {
    await db.query("select set_config('app.allow_test_topups', 'true', true)");
    const existing = await db.query('select amount from marketplace_orders where user_id=$1 and idempotency_key=$2', [req.user.id, idempotencyKey]);
    if (existing.rowCount) {
      const wallet = (await db.query('select balance,total_topups from marketplace_wallets where user_id=$1', [req.user.id])).rows[0];
      return { balance: Number(wallet.balance), totalTopups: Number(wallet.total_topups), credits: Number(existing.rows[0].amount), replay: true };
    }
    await db.query('select marketplace_test_topup($1, $2, $3)', [req.user.id, credits, idempotencyKey]);
    const wallet = (await db.query('select balance,total_topups from marketplace_wallets where user_id=$1', [req.user.id])).rows[0];
    return { balance: Number(wallet.balance), totalTopups: Number(wallet.total_topups), credits, replay: false };
  });
  res.json({ ok: true, ...data });
}));

app.post('/api/daily-bonus/claim', requireSameOrigin, currentUser, route(async (req, res) => {
  await withinLimit(`bonus:${req.user.id}`, 5, 3600);
  const result = await userTransaction(req, async (db) => {
    const wallet = await db.query('select total_topups from marketplace_wallets where user_id = $1 for update', [req.user.id]);
    const basis = Number(wallet.rows[0]?.total_topups || 0);
    if (!basis) return { claimed: false, reason: 'no_topups', amount: 0 };
    const amount = Math.floor(basis * 0.02);
    const claim = await db.query('select marketplace_claim_daily_bonus($1, $2)', [req.user.id, amount]);
    const balance = await db.query('select balance from marketplace_wallets where user_id=$1', [req.user.id]);
    return { claimed: true, amount, balance: Number(balance.rows[0].balance) };
  });
  if (!result.claimed) return res.status(409).json({ error: { code: result.reason, message: 'Add credits before claiming the daily bonus.' } });
  res.json(result);
}));

app.post('/api/tips', requireSameOrigin, currentUser, route(async (req, res) => {
  await withinLimit(`tip:${req.user.id}`, 8, 3600);
  const username = typeof req.body?.username === 'string' ? req.body.username.normalize('NFKC').trim() : '';
  const units = Number(req.body?.amount);
  const currency = req.body?.currency === 'usd' ? 'usd' : 'credits';
  const credits = currency === 'usd' ? Math.round(units * 100) : Math.trunc(units);
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username) || !Number.isSafeInteger(credits) || credits < 1 || credits > 100000) return sendError(res, 400, 'invalid_tip', 'Enter a valid username and amount.');
  const idem = req.get('idempotency-key') || '';
  if (!isIdempotencyKey(idem)) return sendError(res, 400, 'idempotency_required', 'Refresh and try again.');
  const result = await userTransaction(req, async (db) => {
    await db.query("select set_config('app.tip_lookup', $1, true)", [username]);
    const recipient = await db.query('select id from marketplace_users where username_normalized = lower($1)', [username]);
    if (!recipient.rowCount) return { error: 'recipient_not_found' };
    if (recipient.rows[0].id === req.user.id) return { error: 'self_tip' };
    await db.query('select marketplace_tip($1, $2, $3, $4)', [req.user.id, recipient.rows[0].id, credits, idem]);
    return { balance: Number((await db.query('select balance from marketplace_wallets where user_id=$1', [req.user.id])).rows[0].balance), credits };
  });
  if (result.error) return sendError(res, 400, result.error, result.error === 'self_tip' ? 'You cannot tip your own account.' : 'That username was not found.');
  res.json(result);
}));

app.post('/api/purchases', requireSameOrigin, currentUser, route(async (_req, res) => {
  return sendError(res, 503, 'inventory_unavailable', 'Account orders are paused until compliant inventory and secure delivery are configured. No credits were charged.');
}));

app.post('/api/oauth/pending/logout', requireSameOrigin, (req, res) => { res.clearCookie(pendingCookie, cookieBase); res.json({ ok: true }); });

app.get('*', (req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, origin).pathname); } catch { return res.status(400).send('Bad request'); }
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (!publicFiles.has(relative)) return res.status(404).send('Not found');
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) return res.status(404).send('Not found');
  fs.readFile(file, (error, data) => {
    if (error) return res.status(error.code === 'ENOENT' ? 404 : 500).send('Not found');
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
    res.type(types[path.extname(file)] || 'application/octet-stream').send(data);
  });
});
app.use((error, _req, res, _next) => {
  console.error('request failed', { code: error.code || 'internal_error' });
  if (!res.headersSent) {
    if (error.type === 'entity.too.large') return sendError(res, 413, 'request_too_large', 'The request is too large.');
    if (error instanceof SyntaxError && Object.prototype.hasOwnProperty.call(error, 'body')) return sendError(res, 400, 'invalid_request', 'The request body is invalid.');
    sendError(res, 500, 'internal_error', 'The request could not be completed.');
  }
});

async function start() {
  if (process.env.MIGRATION_DATABASE_URL) await require('./migrate.cjs')();
  if (production) requiredConfiguration();
  if (process.env.ALLOW_TEST_TOPUPS === 'true' && !testTopupsEnabled) throw new Error('Test credit top-ups are allowed only on a local development origin.');
  if (!process.env.DATABASE_URL) {
    if (production) throw new Error('DATABASE_URL is required in production.');
    console.warn('Database is not configured; API routes will return an unavailable response.');
  }
  const server = app.listen(port, production ? '0.0.0.0' : '127.0.0.1', () => console.log(`Gorilla Tag Marketplace listening on ${port}`));
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.keepAliveTimeout = 5000;
}
if (process.env.DATABASE_URL) start().catch((error) => { console.error(error.message); process.exitCode = 1; });
else if (!production) {
  const server = app.listen(port, '127.0.0.1', () => console.log(`Gorilla Tag Marketplace UI: http://localhost:${port}`));
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.keepAliveTimeout = 5000;
}
else start().catch((error) => { console.error(error.message); process.exitCode = 1; });

