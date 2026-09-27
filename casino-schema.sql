
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_email_unique ON marketplace_users(lower(email));
CREATE TABLE IF NOT EXISTS marketplace_signup_ips (ip_hash text PRIMARY KEY, user_id uuid UNIQUE NOT NULL REFERENCES marketplace_users(id));
CREATE TABLE IF NOT EXISTS marketplace_email_codes (email text PRIMARY KEY, code_hash text NOT NULL, ip_hash text NOT NULL, attempts integer NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS casino_wallets (user_id uuid PRIMARY KEY REFERENCES marketplace_users(id), balance numeric(16,2) NOT NULL DEFAULT 100000 CHECK (balance >= 0), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS casino_rounds (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES marketplace_users(id), game text NOT NULL, stake numeric(16,2) NOT NULL CHECK(stake>=10), state jsonb NOT NULL, completed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS casino_active_round ON casino_rounds(user_id) WHERE NOT completed;
CREATE TABLE IF NOT EXISTS casino_actions (user_id uuid NOT NULL REFERENCES marketplace_users(id), action_id uuid NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,action_id));
ALTER TABLE casino_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE casino_wallets FORCE ROW LEVEL SECURITY;
ALTER TABLE casino_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE casino_rounds FORCE ROW LEVEL SECURITY;
ALTER TABLE casino_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE casino_actions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS casino_wallet_owner ON casino_wallets;
CREATE POLICY casino_wallet_owner ON casino_wallets USING (user_id::text=current_setting('app.user_id',true)) WITH CHECK(user_id::text=current_setting('app.user_id',true));
DROP POLICY IF EXISTS casino_round_owner ON casino_rounds;
CREATE POLICY casino_round_owner ON casino_rounds USING (user_id::text=current_setting('app.user_id',true)) WITH CHECK(user_id::text=current_setting('app.user_id',true));
DROP POLICY IF EXISTS casino_action_owner ON casino_actions;
CREATE POLICY casino_action_owner ON casino_actions USING (user_id::text=current_setting('app.user_id',true)) WITH CHECK(user_id::text=current_setting('app.user_id',true));
DROP POLICY IF EXISTS marketplace_email_lookup ON marketplace_users;
CREATE POLICY marketplace_email_lookup ON marketplace_users FOR SELECT USING(lower(email)=current_setting('app.email',true));

ALTER TABLE marketplace_users ADD COLUMN IF NOT EXISTS password_hash text;
