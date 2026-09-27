const fs=require('node:fs');
const path=require('node:path');
const {Pool}=require('pg');
module.exports=async function migrate() {
  const url=process.env.MIGRATION_DATABASE_URL;
  const privateHost=new URL(url).hostname.endsWith('.railway.internal');
  const admin=new Pool({connectionString:url,ssl:privateHost?false:{rejectUnauthorized:true},max:1});
  const client=await admin.connect();
  try {
    await client.query('BEGIN');
    await client.query('select pg_advisory_xact_lock(9272026)');
    await client.query(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
    await client.query(fs.readFileSync(path.join(__dirname,'casino-schema.sql'),'utf8'));
    await client.query("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='marketplace_app') THEN CREATE ROLE marketplace_app LOGIN NOBYPASSRLS; END IF; END $$;");
    const password=new URL(process.env.DATABASE_URL).password;
    if (!/^[A-Za-z0-9_-]{32,}$/.test(password)) throw new Error('Runtime database password must be at least 32 safe characters.');
    await client.query(`ALTER ROLE marketplace_app WITH PASSWORD '${password}'`);
    await client.query('GRANT CONNECT ON DATABASE railway TO marketplace_app');
    await client.query('GRANT USAGE ON SCHEMA public TO marketplace_app');
    await client.query('GRANT SELECT ON marketplace_users,marketplace_sessions,marketplace_wallets,marketplace_orders,marketplace_ledger,marketplace_notifications,marketplace_daily_claims TO marketplace_app');
    await client.query('GRANT INSERT ON marketplace_users,marketplace_sessions,marketplace_wallets TO marketplace_app');
    await client.query('GRANT UPDATE(revoked_at) ON marketplace_sessions TO marketplace_app');
    await client.query('GRANT UPDATE(viewed_at) ON marketplace_orders TO marketplace_app');
    await client.query('GRANT UPDATE(read_at) ON marketplace_notifications TO marketplace_app');
    await client.query('GRANT SELECT,INSERT,UPDATE,DELETE ON marketplace_email_codes TO marketplace_app');
    await client.query('GRANT SELECT,INSERT ON marketplace_signup_ips TO marketplace_app');
    await client.query('GRANT SELECT,INSERT,UPDATE ON casino_wallets,casino_rounds,casino_actions TO marketplace_app');
    await client.query('GRANT EXECUTE ON FUNCTION marketplace_claim_daily_bonus(uuid,bigint),marketplace_tip(uuid,uuid,bigint,text),marketplace_rate_limit(text,integer,integer),marketplace_cleanup_rate_limits() TO marketplace_app');
    await client.query('COMMIT');console.log('Database migrations complete.');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();await admin.end();}
};
