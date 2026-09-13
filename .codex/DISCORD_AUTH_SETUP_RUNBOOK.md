# Discord auth — manual setup runbook (steps 2 & 4)

Run these against the **live shared Supabase project** — there's no local/staging DB. Go one block
at a time in the Supabase SQL Editor and check for errors before moving to the next block. Nothing
here touches existing tables' data or the existing `verify_app_user_login` function — see the note
at the end for why that function is intentionally left alone.

## Step 2 — Supabase SQL

### Block 1 — extend `app_users` with Discord identity + status
```sql
ALTER TABLE app_users
  ADD COLUMN discord_user_id   TEXT UNIQUE,
  ADD COLUMN status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  ADD COLUMN registered_via    TEXT NOT NULL DEFAULT 'local' CHECK (registered_via IN ('local','discord')),
  ADD COLUMN discord_linked_at TIMESTAMPTZ;
```
All four columns are nullable/defaulted, so this is purely additive — existing rows (including
`devlou`) get `status='active'`, `registered_via='local'` automatically.

### Block 1a — widen the `role` check constraint to allow `member`
> **Fixed 2026-09-13**: `app_users_role_check` predates this feature and only allowed `('admin',
> 'super_admin')`, so every `register_member_account` call failed at the `INSERT` with
> `23514 new row for relation "app_users" violates check constraint "app_users_role_check"`. Confirmed
> via `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'app_users'::regclass AND
> conname = 'app_users_role_check';` before widening it — no other roles existed.
```sql
ALTER TABLE app_users DROP CONSTRAINT app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('admin', 'super_admin', 'member'));
```

### Block 2 — link a `members` row to an account
```sql
ALTER TABLE members
  ADD COLUMN account_id UUID UNIQUE REFERENCES app_users(id) ON DELETE SET NULL;
```
`UNIQUE` enforces one account ↔ one primary character. `ON DELETE SET NULL` (not CASCADE) so
disabling/removing an account never deletes roster or auction history.

### Block 3 — rate-limit table
```sql
CREATE TABLE auth_rate_limits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope         TEXT NOT NULL,        -- 'login' | 'register'
  identifier    TEXT NOT NULL,        -- lower(username) for login; client IP for register
  attempt_count INT NOT NULL DEFAULT 1,
  window_start  TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, identifier)
);
ALTER TABLE auth_rate_limits DISABLE ROW LEVEL SECURITY;
```
(RLS disabled to match every other table in this project — see `docs/specs/deployment-guide.md`.)

### Block 4 — `check_rate_limit` RPC
Atomic upsert-then-check in one round trip (no read-then-write race):
```sql
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_scope TEXT,
  p_identifier TEXT,
  p_max_attempts INT,
  p_window_seconds INT,
  p_lockout_seconds INT
)
RETURNS TABLE (allowed BOOLEAN, retry_after_seconds INT)
LANGUAGE plpgsql
AS $$
DECLARE
  row_data auth_rate_limits%ROWTYPE;
  now_ts TIMESTAMPTZ := now();
BEGIN
  INSERT INTO auth_rate_limits (scope, identifier, attempt_count, window_start, updated_at)
  VALUES (p_scope, p_identifier, 1, now_ts, now_ts)
  ON CONFLICT (scope, identifier) DO UPDATE
    SET attempt_count = CASE
          WHEN auth_rate_limits.locked_until IS NOT NULL AND auth_rate_limits.locked_until > now_ts THEN auth_rate_limits.attempt_count
          WHEN auth_rate_limits.window_start < now_ts - (p_window_seconds || ' seconds')::interval THEN 1
          ELSE auth_rate_limits.attempt_count + 1
        END,
        window_start = CASE
          WHEN auth_rate_limits.locked_until IS NOT NULL AND auth_rate_limits.locked_until > now_ts THEN auth_rate_limits.window_start
          WHEN auth_rate_limits.window_start < now_ts - (p_window_seconds || ' seconds')::interval THEN now_ts
          ELSE auth_rate_limits.window_start
        END,
        locked_until = CASE
          WHEN auth_rate_limits.locked_until IS NOT NULL AND auth_rate_limits.locked_until > now_ts THEN auth_rate_limits.locked_until
          WHEN auth_rate_limits.window_start < now_ts - (p_window_seconds || ' seconds')::interval THEN NULL
          WHEN auth_rate_limits.attempt_count + 1 >= p_max_attempts THEN now_ts + (p_lockout_seconds || ' seconds')::interval
          ELSE NULL
        END,
        updated_at = now_ts
  RETURNING * INTO row_data;

  IF row_data.locked_until IS NOT NULL AND row_data.locked_until > now_ts THEN
    RETURN QUERY SELECT FALSE, CEIL(EXTRACT(EPOCH FROM (row_data.locked_until - now_ts)))::INT;
  ELSE
    RETURN QUERY SELECT TRUE, 0;
  END IF;
END;
$$;
```
`lib/rateLimit.js` already calls this with `login` = 8 attempts / 15 min window / 15 min lockout,
and `register` = 5 attempts / 60 min window / 60 min lockout.

### Block 5 — `register_member_account` RPC
One atomic transaction: rejects on a Discord id, username, or character name already in use, then
inserts both the account and the linked member row. `role` is hard-coded to `'member'` in the
function body — never a parameter — so registration can never mint `admin`/`super_admin`.

> **Fixed 2026-09-13**: the original version below referenced `username`/`char_name` unqualified in
> the `EXISTS` checks. In PL/pgSQL, `RETURNS TABLE (id, username, role, must_reset_password)` makes
> those output names visible as variables for the whole function body, so `lower(username)` was
> ambiguous between the `app_users.username` column and that variable — Postgres accepts the
> `CREATE OR REPLACE` fine but throws `42702 column reference "username" is ambiguous` at call time.
> Every table reference below is now aliased (`au`, `m`) to avoid it. If you ran the original version,
> re-run this corrected one (`CREATE OR REPLACE`, same signature, no data affected).
```sql
CREATE OR REPLACE FUNCTION register_member_account(
  p_username TEXT,
  p_password TEXT,
  p_discord_user_id TEXT,
  p_char_name TEXT,
  p_char_class TEXT
)
RETURNS TABLE (id UUID, username TEXT, role TEXT, must_reset_password BOOLEAN)
LANGUAGE plpgsql
AS $$
DECLARE
  new_user_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM app_users au WHERE au.discord_user_id = p_discord_user_id) THEN
    RAISE EXCEPTION 'discord_already_linked';
  END IF;
  IF EXISTS (SELECT 1 FROM app_users au WHERE lower(au.username) = lower(p_username)) THEN
    RAISE EXCEPTION 'username_taken';
  END IF;
  IF EXISTS (SELECT 1 FROM members m WHERE lower(m.char_name) = lower(p_char_name)) THEN
    RAISE EXCEPTION 'char_name_taken';
  END IF;

  INSERT INTO app_users (username, password_hash, role, must_reset_password, status, registered_via, discord_user_id, discord_linked_at)
  VALUES (p_username, extensions.crypt(p_password, extensions.gen_salt('bf')), 'member', FALSE, 'active', 'discord', p_discord_user_id, now())
  RETURNING app_users.id INTO new_user_id;

  INSERT INTO members (char_name, char_class, account_id, joined_at)
  VALUES (p_char_name, p_char_class, new_user_id, now());

  RETURN QUERY
  SELECT u.id, u.username, u.role, u.must_reset_password
  FROM app_users u
  WHERE u.id = new_user_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'username_taken';
END;
$$;
```
Password hashing uses `extensions.crypt(..., extensions.gen_salt('bf'))` — the same bcrypt-via-
pgcrypto call your deployment guide already documents for manually resetting a password, so it's
compatible with however `verify_app_user_login` checks passwords today.

If your `app_users`/`members` tables have any other `NOT NULL` columns without defaults beyond what's
listed above, this insert will fail loudly (not silently) — add them to both `INSERT` statements if so.

### Block 6 — `discord_lookup_account` RPC
Read-only lookup used by the OAuth callback:
```sql
CREATE OR REPLACE FUNCTION discord_lookup_account(p_discord_user_id TEXT)
RETURNS TABLE (id UUID, username TEXT, role TEXT, status TEXT, must_reset_password BOOLEAN)
LANGUAGE sql
STABLE
AS $$
  SELECT u.id, u.username, u.role, u.status, u.must_reset_password
  FROM app_users u
  WHERE u.discord_user_id = p_discord_user_id;
$$;
```

### Block 7 — pending-approval status (added 2026-09-13)
New Discord registrations no longer go live immediately — they land as `status='pending'`
and can't log in (and aren't enrolled in the active round) until an admin approves them
from the "Pending approval" panel on the Members page. Two changes, both against
existing objects — no new tables.

**7a — widen the `status` check constraint to allow `pending`:**
```sql
-- Confirm the constraint name first (should be app_users_status_check, same
-- naming pattern as app_users_role_check from Block 1a):
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'app_users'::regclass AND conname LIKE '%status%';

ALTER TABLE app_users DROP CONSTRAINT app_users_status_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_status_check
  CHECK (status IN ('active', 'disabled', 'pending'));
```

**7b — `register_member_account` now inserts new accounts as `'pending'` instead of
`'active'`** (the only change from Block 5 is that one literal in the `INSERT`):
```sql
CREATE OR REPLACE FUNCTION register_member_account(
  p_username TEXT,
  p_password TEXT,
  p_discord_user_id TEXT,
  p_char_name TEXT,
  p_char_class TEXT
)
RETURNS TABLE (id UUID, username TEXT, role TEXT, must_reset_password BOOLEAN)
LANGUAGE plpgsql
AS $$
DECLARE
  new_user_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM app_users au WHERE au.discord_user_id = p_discord_user_id) THEN
    RAISE EXCEPTION 'discord_already_linked';
  END IF;
  IF EXISTS (SELECT 1 FROM app_users au WHERE lower(au.username) = lower(p_username)) THEN
    RAISE EXCEPTION 'username_taken';
  END IF;
  IF EXISTS (SELECT 1 FROM members m WHERE lower(m.char_name) = lower(p_char_name)) THEN
    RAISE EXCEPTION 'char_name_taken';
  END IF;

  INSERT INTO app_users (username, password_hash, role, must_reset_password, status, registered_via, discord_user_id, discord_linked_at)
  VALUES (p_username, extensions.crypt(p_password, extensions.gen_salt('bf')), 'member', FALSE, 'pending', 'discord', p_discord_user_id, now())
  RETURNING app_users.id INTO new_user_id;

  INSERT INTO members (char_name, char_class, account_id, joined_at)
  VALUES (p_char_name, p_char_class, new_user_id, now());

  RETURN QUERY
  SELECT u.id, u.username, u.role, u.must_reset_password
  FROM app_users u
  WHERE u.id = new_user_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'username_taken';
END;
$$;
```
No change needed to `discord_lookup_account` (Block 6) — it already returns `status`,
and the callback route (`app/api/auth/discord/callback/route.js`) and login route
(`app/api/auth/login/route.js`) both now treat `status='pending'` the same way they
already treated `'disabled'`, just with a different message.

Approve/reject live entirely in JS — `app/api/members/pending/route.js` (list) and
`app/api/members/pending/[id]/route.js` (approve/reject) — no new RPCs needed. Approve
flips `status` to `'active'` and calls the existing `enrollMemberInActiveRound` (which
used to run at registration time and now only runs here). Reject deletes both the
`app_users` and `members` rows outright so the username/character name are free to
try again, rather than leaving a permanently-disabled placeholder behind.

### About `verify_app_user_login` — deliberately NOT changed
The original plan called for adding `AND status = 'active'` to this existing function. I don't have
the live function's source (no migration files are committed — the schema only lives in your
Supabase project), so rewriting it here would mean guessing at a business-critical function that
gates every admin's login. Instead, `app/api/auth/login/route.js` now does a small follow-up query
against the new `status` column and rejects disabled accounts with a 403 — same end result, zero risk
to the existing function. No SQL change needed for this part.

If you'd rather have the check live inside the RPC itself, run:
```sql
SELECT pg_get_functiondef('verify_app_user_login'::regproc);
```
and paste me the result — I'll hand back an exact, reviewed `CREATE OR REPLACE` instead of guessing.

---

## Step 4 — Create the Discord OAuth application

1. Go to https://discord.com/developers/applications → **New Application** → name it (e.g. `ENCORE Guild Dashboard`).
2. Left sidebar → **OAuth2** → **General**.
3. Under **Redirects**, add both:
   - `http://localhost:3000/api/auth/discord/callback` (local dev)
   - `https://<your-vercel-domain>/api/auth/discord/callback` (production — use your actual Vercel URL)
4. Still on the OAuth2 page, copy:
   - **Client ID** → `DISCORD_CLIENT_ID`
   - **Client Secret** (click "Reset Secret" if none is shown yet) → `DISCORD_CLIENT_SECRET`
5. Set `DISCORD_REDIRECT_URI` to whichever redirect URI matches the environment that's running (the
   code sends this exact value to Discord, so local dev and prod need it to match their own
   redirect entry above — e.g. `.env.local` gets the `localhost:3000` one, Vercel's env vars get the
   production one).
6. Add all three to `.env.local` (already scaffolded in `.env.example`), and to Vercel → Project →
   Settings → Environment Variables for production/preview.
7. No bot, no privileged intents, no scopes beyond `identify` are needed — this is sign-in only, not
   a Discord bot.

## After both steps are done

Manual verification pass (from the approved plan):
- Discord registration happy path → lands on `/account` with the new character; confirm in Table
  Editor that `app_users` (`role='member'`, `discord_user_id` set) and `members` (`account_id`
  linked) both exist.
- Duplicate Discord id / duplicate username (including trying `devlou`) → rejected, no partial rows.
- `member` session blocked on a swept admin route; sidebar shows only Auction view + Account.
- Trip the rate limit on login and on registration; confirm it clears after the window.
- Set a row's `status='disabled'` manually → both local and Discord sign-in reject it.
