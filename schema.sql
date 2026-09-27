-- Apply once with a dedicated migration role. The web process should use a separate
-- NOBYPASSRLS runtime role with only the grants listed in README.md.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

CREATE TABLE IF NOT EXISTS marketplace_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_subject text NOT NULL UNIQUE,
  email text NOT NULL,
  username text NOT NULL,
  username_normalized text GENERATED ALWAYS AS (lower(username)) STORED,
  picture_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_username_format CHECK (username ~ '^[A-Za-z0-9_]{3,20}$'),
  CONSTRAINT marketplace_username_unique UNIQUE (username_normalized)
);

CREATE TABLE IF NOT EXISTS marketplace_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES marketplace_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_sessions_user_idx ON marketplace_sessions(user_id);

CREATE TABLE IF NOT EXISTS marketplace_wallets (
  user_id uuid PRIMARY KEY REFERENCES marketplace_users(id) ON DELETE CASCADE,
  balance bigint NOT NULL DEFAULT 0 CHECK (balance BETWEEN 0 AND 1000000000000),
  total_topups bigint NOT NULL DEFAULT 0 CHECK (total_topups BETWEEN 0 AND 1000000000000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES marketplace_users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('account','credits','tip','daily_bonus')),
  product_key text NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'complete' CHECK (status IN ('complete','pending','refunded')),
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  viewed_at timestamptz,
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS marketplace_orders_user_date_idx ON marketplace_orders(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES marketplace_users(id) ON DELETE CASCADE,
  amount bigint NOT NULL CHECK (amount <> 0),
  balance_after bigint NOT NULL CHECK (balance_after >= 0),
  reason text NOT NULL CHECK (reason IN ('test_topup','tip_sent','tip_received','daily_bonus')),
  reference_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, reason, reference_id)
);
CREATE INDEX IF NOT EXISTS marketplace_ledger_user_date_idx ON marketplace_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES marketplace_users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS marketplace_notifications_user_date_idx ON marketplace_notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_daily_claims (
  user_id uuid NOT NULL REFERENCES marketplace_users(id) ON DELETE CASCADE,
  claim_date date NOT NULL,
  basis bigint NOT NULL CHECK (basis >= 0),
  amount bigint NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, claim_date)
);

CREATE TABLE IF NOT EXISTS marketplace_rate_limits (
  bucket_key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  hit_count integer NOT NULL CHECK (hit_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['marketplace_users','marketplace_sessions','marketplace_wallets','marketplace_orders','marketplace_ledger','marketplace_notifications','marketplace_daily_claims'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

DROP POLICY IF EXISTS marketplace_users_select ON marketplace_users;
CREATE POLICY marketplace_users_select ON marketplace_users FOR SELECT USING (
  id::text = current_setting('app.user_id', true)
  OR google_subject = current_setting('app.google_subject', true)
  OR id IN (SELECT user_id FROM marketplace_sessions WHERE token_hash = current_setting('app.session_hash', true))
  OR username_normalized = lower(current_setting('app.tip_lookup', true))
);
DROP POLICY IF EXISTS marketplace_users_insert ON marketplace_users;
CREATE POLICY marketplace_users_insert ON marketplace_users FOR INSERT WITH CHECK (id::text = current_setting('app.user_id', true));
DROP POLICY IF EXISTS marketplace_users_update ON marketplace_users;
CREATE POLICY marketplace_users_update ON marketplace_users FOR UPDATE USING (id::text = current_setting('app.user_id', true)) WITH CHECK (id::text = current_setting('app.user_id', true));

DROP POLICY IF EXISTS marketplace_sessions_select ON marketplace_sessions;
CREATE POLICY marketplace_sessions_select ON marketplace_sessions FOR SELECT USING (
  user_id::text = current_setting('app.user_id', true) OR token_hash = current_setting('app.session_hash', true)
);
DROP POLICY IF EXISTS marketplace_sessions_insert ON marketplace_sessions;
CREATE POLICY marketplace_sessions_insert ON marketplace_sessions FOR INSERT WITH CHECK (user_id::text = current_setting('app.user_id', true));
DROP POLICY IF EXISTS marketplace_sessions_update ON marketplace_sessions;
CREATE POLICY marketplace_sessions_update ON marketplace_sessions FOR UPDATE USING (user_id::text = current_setting('app.user_id', true)) WITH CHECK (user_id::text = current_setting('app.user_id', true));

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['marketplace_wallets','marketplace_orders','marketplace_ledger','marketplace_notifications','marketplace_daily_claims'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', table_name || '_owner', table_name);
    EXECUTE format('CREATE POLICY %I ON %I USING (user_id::text = current_setting(''app.user_id'', true)) WITH CHECK (user_id::text = current_setting(''app.user_id'', true))', table_name || '_owner', table_name);
  END LOOP;
END $$;

-- SECURITY DEFINER functions are owned by the migration owner (a distinct BYPASSRLS
-- role). The runtime role receives EXECUTE only, never direct cross-user table access.
CREATE OR REPLACE FUNCTION marketplace_test_topup(p_user uuid, p_credits integer, p_idem text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE current_balance bigint; order_id uuid;
BEGIN
  IF current_setting('app.user_id', true)::uuid IS DISTINCT FROM p_user THEN RAISE EXCEPTION 'user_mismatch' USING ERRCODE='P0001'; END IF;
  IF current_setting('app.allow_test_topups', true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'test_topups_disabled' USING ERRCODE='P0001'; END IF;
  IF p_credits NOT IN (900,1600,2000,3000,10000) OR p_idem !~ '^[A-Za-z0-9_-]{12,100}$' THEN RAISE EXCEPTION 'invalid_package' USING ERRCODE='P0001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text || p_idem, 0));
  IF EXISTS (SELECT 1 FROM marketplace_orders WHERE user_id=p_user AND idempotency_key=p_idem) THEN RETURN; END IF;
  UPDATE marketplace_wallets SET balance=balance+p_credits, total_topups=total_topups+p_credits, updated_at=now() WHERE user_id=p_user RETURNING balance INTO current_balance;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_missing' USING ERRCODE='P0001'; END IF;
  INSERT INTO marketplace_orders(user_id,kind,product_key,amount,idempotency_key) VALUES(p_user,'credits','test_topup',p_credits,p_idem) RETURNING id INTO order_id;
  INSERT INTO marketplace_ledger(user_id,amount,balance_after,reason,reference_id) VALUES(p_user,p_credits,current_balance,'test_topup',order_id);
  INSERT INTO marketplace_notifications(user_id,title,body) VALUES(p_user,'Credits added',p_credits::text || ' credits were added to your balance.');
END $$;

CREATE OR REPLACE FUNCTION marketplace_claim_daily_bonus(p_user uuid, p_amount bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE current_balance bigint; claim_date date := (now() AT TIME ZONE 'UTC')::date; topup_basis bigint; claim_id uuid;
BEGIN
  IF current_setting('app.user_id', true)::uuid IS DISTINCT FROM p_user THEN RAISE EXCEPTION 'user_mismatch' USING ERRCODE='P0001'; END IF;
  SELECT total_topups INTO topup_basis FROM marketplace_wallets WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND OR topup_basis < 1 OR p_amount <> floor(topup_basis * 0.02) OR p_amount < 1 THEN RAISE EXCEPTION 'bonus_not_available' USING ERRCODE='P0001'; END IF;
  INSERT INTO marketplace_daily_claims(user_id,claim_date,basis,amount) VALUES(p_user,claim_date,topup_basis,p_amount) RETURNING user_id INTO claim_id;
  UPDATE marketplace_wallets SET balance=balance+p_amount, updated_at=now() WHERE user_id=p_user RETURNING balance INTO current_balance;
  INSERT INTO marketplace_orders(user_id,kind,product_key,amount) VALUES(p_user,'daily_bonus','daily_bonus',p_amount) RETURNING id INTO claim_id;
  INSERT INTO marketplace_ledger(user_id,amount,balance_after,reason,reference_id) VALUES(p_user,p_amount,current_balance,'daily_bonus',claim_id);
  INSERT INTO marketplace_notifications(user_id,title,body) VALUES(p_user,'Daily bonus claimed',p_amount::text || ' credits were added.');
END $$;

CREATE OR REPLACE FUNCTION marketplace_tip(p_sender uuid, p_recipient uuid, p_amount bigint, p_idem text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE sender_balance bigint; recipient_balance bigint; tip_order uuid;
BEGIN
  IF current_setting('app.user_id', true)::uuid IS DISTINCT FROM p_sender THEN RAISE EXCEPTION 'user_mismatch' USING ERRCODE='P0001'; END IF;
  IF p_sender=p_recipient OR p_amount<1 OR p_amount>100000 OR p_idem !~ '^[A-Za-z0-9_-]{12,100}$' THEN RAISE EXCEPTION 'invalid_tip' USING ERRCODE='P0001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_sender::text || p_idem, 0));
  IF EXISTS (SELECT 1 FROM marketplace_orders WHERE user_id=p_sender AND idempotency_key=p_idem) THEN RETURN; END IF;
  PERFORM 1 FROM marketplace_wallets WHERE user_id IN (p_sender,p_recipient) ORDER BY user_id FOR UPDATE;
  UPDATE marketplace_wallets SET balance=balance-p_amount,updated_at=now() WHERE user_id=p_sender AND balance>=p_amount RETURNING balance INTO sender_balance;
  IF NOT FOUND THEN RAISE EXCEPTION 'insufficient_credits' USING ERRCODE='P0001'; END IF;
  UPDATE marketplace_wallets SET balance=balance+p_amount,updated_at=now() WHERE user_id=p_recipient RETURNING balance INTO recipient_balance;
  IF NOT FOUND THEN RAISE EXCEPTION 'recipient_not_found' USING ERRCODE='P0001'; END IF;
  INSERT INTO marketplace_orders(user_id,kind,product_key,amount,idempotency_key) VALUES(p_sender,'tip','tip_sent',p_amount,p_idem) RETURNING id INTO tip_order;
  INSERT INTO marketplace_ledger(user_id,amount,balance_after,reason,reference_id) VALUES(p_sender,-p_amount,sender_balance,'tip_sent',tip_order);
  INSERT INTO marketplace_ledger(user_id,amount,balance_after,reason,reference_id) VALUES(p_recipient,p_amount,recipient_balance,'tip_received',tip_order);
  INSERT INTO marketplace_notifications(user_id,title,body) VALUES(p_recipient,'Credits received',p_amount::text || ' credits were sent to you.');
END $$;

CREATE OR REPLACE FUNCTION marketplace_rate_limit(p_bucket text, p_max integer, p_window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE current_row marketplace_rate_limits%ROWTYPE; now_at timestamptz := clock_timestamp();
BEGIN
  INSERT INTO marketplace_rate_limits(bucket_key,window_start,hit_count,updated_at)
    VALUES(p_bucket,now_at,1,now_at) ON CONFLICT(bucket_key) DO NOTHING;
  SELECT * INTO current_row FROM marketplace_rate_limits WHERE bucket_key=p_bucket FOR UPDATE;
  IF current_row.window_start <= now_at - make_interval(secs => p_window_seconds) THEN
    UPDATE marketplace_rate_limits SET window_start=now_at,hit_count=1,updated_at=now_at WHERE bucket_key=p_bucket;
    RETURN true;
  END IF;
  IF current_row.hit_count >= p_max THEN RETURN false; END IF;
  UPDATE marketplace_rate_limits SET hit_count=hit_count+1,updated_at=now_at WHERE bucket_key=p_bucket;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION marketplace_cleanup_rate_limits()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE removed integer;
BEGIN
  DELETE FROM marketplace_rate_limits WHERE updated_at < now() - interval '2 days';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END $$;

REVOKE ALL ON FUNCTION marketplace_test_topup(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION marketplace_claim_daily_bonus(uuid, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION marketplace_tip(uuid, uuid, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION marketplace_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION marketplace_cleanup_rate_limits() FROM PUBLIC;

