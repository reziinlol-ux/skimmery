const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const root = __dirname;
const databasePort = Number(process.env.LOCAL_DATABASE_PORT || 5441);
const databaseHost = '127.0.0.1';
const dataDir = path.join(root, '.local-pg-data');
const runtimePassword = randomBytes(32).toString('base64url');
let database;
let databaseServer;
let appProcess;
let stopping = false;

async function waitForDatabase(pool) {
  const deadline = Date.now() + 15000;
  let lastError;
  while (Date.now() < deadline) {
    try { await pool.query('select 1'); return; }
    catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  throw lastError || new Error('Local database did not start.');
}

async function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  if (appProcess && appProcess.exitCode === null) appProcess.kill();
  try { await databaseServer?.stop(); } catch {}
  try { await database?.close(); } catch {}
  process.exitCode = exitCode;
}

async function start() {
  if (process.env.NODE_ENV === 'production') throw new Error('The local PGlite database cannot be used in production.');
  if (process.env.DATABASE_URL) throw new Error('Remove DATABASE_URL before using the local PGlite launcher.');
  const [{ PGlite }, { PGLiteSocketServer }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('@electric-sql/pglite-socket'),
  ]);

  database = new PGlite(dataDir);
  await database.waitReady;
  databaseServer = new PGLiteSocketServer({ db: database, host: databaseHost, port: databasePort });
  await databaseServer.start();

  const adminPool = new Pool({ host: databaseHost, port: databasePort, user: 'postgres', password: 'postgres', database: 'postgres', ssl: false, max: 1 });
  try {
    await waitForDatabase(adminPool);
    await adminPool.query(fs.readFileSync(path.join(root, 'schema.sql'), 'utf8'));
    await adminPool.query(fs.readFileSync(path.join(root, 'casino-schema.sql'), 'utf8'));
    await adminPool.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marketplace_local') THEN CREATE ROLE marketplace_local LOGIN NOBYPASSRLS; END IF; END $$;");
    await adminPool.query(`ALTER ROLE marketplace_local WITH PASSWORD '${runtimePassword}'`);
    await adminPool.query('GRANT CONNECT ON DATABASE postgres TO marketplace_local');
    await adminPool.query('GRANT USAGE ON SCHEMA public TO marketplace_local');
    await adminPool.query('GRANT SELECT ON marketplace_users, marketplace_sessions, marketplace_wallets, marketplace_orders, marketplace_ledger, marketplace_notifications, marketplace_daily_claims TO marketplace_local');
    await adminPool.query('GRANT INSERT ON marketplace_users, marketplace_sessions, marketplace_wallets TO marketplace_local');
    await adminPool.query('GRANT UPDATE (revoked_at) ON marketplace_sessions TO marketplace_local');
    await adminPool.query('GRANT UPDATE (viewed_at) ON marketplace_orders TO marketplace_local');
    await adminPool.query('GRANT UPDATE (read_at) ON marketplace_notifications TO marketplace_local');
    await adminPool.query('GRANT EXECUTE ON FUNCTION marketplace_claim_daily_bonus(uuid, bigint), marketplace_tip(uuid, uuid, bigint, text), marketplace_rate_limit(text, integer, integer), marketplace_cleanup_rate_limits() TO marketplace_local');
    await adminPool.query('GRANT EXECUTE ON FUNCTION marketplace_test_topup(uuid, integer, text) TO marketplace_local');
    await adminPool.query('GRANT SELECT,INSERT,UPDATE,DELETE ON marketplace_email_codes TO marketplace_local');
    await adminPool.query('GRANT SELECT,INSERT ON marketplace_signup_ips TO marketplace_local');
    await adminPool.query('GRANT SELECT,INSERT,UPDATE ON casino_wallets,casino_rounds,casino_actions TO marketplace_local');
    const role = await adminPool.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'marketplace_local'");
    if (role.rows[0]?.rolsuper || role.rows[0]?.rolbypassrls) throw new Error('The local application role must not bypass row-level security.');
  } finally {
    await adminPool.end();
  }

  const databaseUrl = `postgresql://marketplace_local:${runtimePassword}@${databaseHost}:${databasePort}/postgres?sslmode=disable`;
  appProcess = spawn(process.execPath, ['server.cjs'], {
    cwd: root,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DB_POOL_SIZE: '1',
      ALLOW_TEST_TOPUPS: 'true',
      NODE_ENV: 'development',
    },
    stdio: 'inherit',
  });
  appProcess.on('error', (error) => { console.error('Local marketplace server failed to start:', error.message); void stop(1); });
  appProcess.on('exit', (code) => { void stop(code || 0); });
}

process.once('SIGINT', () => { void stop(0); });
process.once('SIGTERM', () => { void stop(0); });
start().catch((error) => {
  console.error('Local marketplace setup failed:', error.message);
  void stop(1);
});
