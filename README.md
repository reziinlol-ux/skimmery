# Gorilla Tag Marketplace

Single-origin Node service with a PostgreSQL-backed account, wallet, order history, notification, tip, and daily-bonus API. Google sign-in uses the OAuth authorization-code flow with PKCE, state, nonce, verified email, and a server-side revocable session. The app does not store Google access tokens.

## Local run

1. Install Node.js 20 or newer and run `npm ci`.
2. Create a Google OAuth web client for local work. Add `http://localhost:4179` as an authorized JavaScript origin and `http://localhost:4179/auth/google/callback` as an authorized redirect URI. Add its client ID, secret, and two independent 32-byte signing keys to `.env`.
3. Run `npm run start:local`, then open `http://localhost:4179`. This starts a persistent PGlite database in `.local-pg-data`, applies the schema, and launches the app with a separate `NOBYPASSRLS` runtime role. The local database is bound to `127.0.0.1` only. Its role is recreated with a random password on each launch.

The PGlite launcher is for local development only. Its PostgreSQL wire server does not provide TLS and must stay bound to loopback. It enables test credit top-ups on localhost. Do not use it or its database files for production; deploy to a private Railway PostgreSQL service using the production role setup below.

Use a separate OAuth client and separate secrets for production. Never commit `.env` or paste secrets into chat. `.env` and `.local-pg-data` are ignored by Git.

## Database grants

The service requires PostgreSQL row-level security and a runtime role that cannot bypass it. Apply the schema as the migration owner, then grant the runtime role limited access. Replace the role name if needed:

```sql
CREATE ROLE marketplace_runtime LOGIN NOBYPASSRLS PASSWORD 'set-this-outside-source-control';
GRANT CONNECT ON DATABASE marketplace TO marketplace_runtime;
GRANT USAGE ON SCHEMA public TO marketplace_runtime;
GRANT SELECT ON marketplace_users, marketplace_sessions, marketplace_wallets,
  marketplace_orders, marketplace_ledger, marketplace_notifications,
  marketplace_daily_claims TO marketplace_runtime;
GRANT INSERT ON marketplace_users, marketplace_sessions, marketplace_wallets TO marketplace_runtime;
GRANT UPDATE (revoked_at) ON marketplace_sessions TO marketplace_runtime;
GRANT UPDATE (viewed_at) ON marketplace_orders TO marketplace_runtime;
GRANT UPDATE (read_at) ON marketplace_notifications TO marketplace_runtime;
GRANT EXECUTE ON FUNCTION marketplace_claim_daily_bonus(uuid, bigint),
  marketplace_tip(uuid, uuid, bigint, text), marketplace_rate_limit(text, integer, integer),
  marketplace_cleanup_rate_limits() TO marketplace_runtime;
```

The `SECURITY DEFINER` procedure owner must be a distinct migration role with `BYPASSRLS` and own the protected tables. The runtime role must not own tables or procedures and must not have `BYPASSRLS`. Keep the migration owner credentials out of the Railway web service. Store only the runtime connection in the app's `DATABASE_URL`.

Do not grant `marketplace_test_topup` to the production role. A separate local-only database role may receive that grant for development. The public test-top-up endpoint is enabled only when the server is explicitly in development and `APP_ORIGIN` is a loopback HTTP origin. Production database connections require TLS. RLS is defense in depth against query mistakes; because PostgreSQL custom settings are writable by a connected role, a stolen runtime database credential can forge the application user context. Keep the database private, protect Railway secrets, and use only the least-privilege runtime role.

## Google OAuth setup

In Google Cloud Console, configure the OAuth consent screen with the operator's real app name and verified support email. Request only `openid`, `email`, and `profile`. Add the exact production app origin and callback URL (`https://YOUR-RAILWAY-DOMAIN/auth/google/callback`) to the OAuth client. Google may require a verified domain or consent-screen review before accounts outside the configured test-user list can sign in.

## Railway layout

Use one Railway project with a private PostgreSQL service and a Node web service rooted at this directory. Link the app's `DATABASE_URL` to the private database and use the non-owner runtime role. Do not expose PostgreSQL through a public TCP proxy. Set `APP_ORIGIN` to the final HTTPS app domain and set `GOOGLE_REDIRECT_URI` to that domain plus `/auth/google/callback`. Set `NODE_ENV=production`; keep `ALLOW_TEST_TOPUPS` unset or false. Generate distinct random values for `PENDING_SIGNING_KEY` and `OAUTH_STATE_SIGNING_KEY` and add them only in Railway's service variables. Deploy `schema.sql` from a separate migration connection before starting the app.

The Railway database and domain are not provisioned by this code. Review Railway's current plan and resource cost before adding services.

## Current limits

- Credit-package buttons use a server-side test grant only when `NODE_ENV=development`, `ALLOW_TEST_TOPUPS=true`, and `APP_ORIGIN` is a loopback HTTP origin. Production rejects test grants, requires TLS to PostgreSQL, and must not grant the test-top-up procedure to the runtime role. There is no payment processor or payment webhook yet.
- Daily bonus is a manual UTC-day claim worth 2% of cumulative credit top-ups, rounded down to a whole credit, once per user per day. The claim and wallet update run in one database transaction.
- Tips move whole credits between two wallets in one transaction. Both balances are locked in stable user-ID order and requests require idempotency keys.
- Account checkout is deliberately disabled and does not debit credits. Steam's Subscriber Agreement describes accounts as personal and restricts sales/transfers. The service has no account-inventory table, no password vault, and no credential-delivery route.
- The terms and privacy text are implementation drafts. The operator must add its legal name, contact address, retention periods, jurisdiction, and user-rights contact before public launch.
