# Pending-approval schema change + full data reset

Run these in the Supabase SQL Editor, against the live shared project. Go block by
block and check for errors before moving on. This file is a one-off runbook for two
things done together on 2026-09-13 — the pending-approval schema change is now also
documented permanently in `DISCORD_AUTH_SETUP_RUNBOOK.md` (Block 7); this file is safe
to delete once both blocks below have been run.

## Block 1 — widen `status` to allow `pending`

First confirm the constraint name (should be `app_users_status_check`, same naming
pattern as `app_users_role_check` from the original runbook's Block 1a):

```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'app_users'::regclass AND conname LIKE '%status%';
```

Then widen it:

```sql
ALTER TABLE app_users DROP CONSTRAINT app_users_status_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_status_check
  CHECK (status IN ('active', 'disabled', 'pending'));
```

## Block 2 — `register_member_account` now inserts new accounts as `pending`

Only change from the existing function is one literal in the `INSERT` (`'active'` →
`'pending'`):

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

## Block 3 — full account/member reset

Deletes all 81 `members` rows and everything keyed off them (rounds, auctions,
rotation/progress/caps, 1,743 `auction_allocations` rows), the `osnub` test account,
and all `audit_logs` / `dashboard_events` / `auth_rate_limits` rows. Keeps `devlou` and
`mamark` as empty admin logins (no linked character). `groups` and `auction_items`
(reference data) are untouched — nothing references them the other way around.

```sql
BEGIN;

DELETE FROM auction_allocations;
DELETE FROM auction_inventory;
DELETE FROM member_cap_overrides;
DELETE FROM member_round_progress;
DELETE FROM rotation_list;
DELETE FROM auctions;
DELETE FROM rounds;
DELETE FROM members;
DELETE FROM app_users WHERE username NOT IN ('devlou', 'mamark');
DELETE FROM audit_logs;
DELETE FROM dashboard_events;
DELETE FROM auth_rate_limits;

COMMIT;
```

## After both blocks

Run `npm run dev` yourself. You should have a completely clean roster with just
`devlou`/`mamark` logins. Any new Discord registration will now sit in the "Pending
approval" panel on the Members page (admin/super_admin only) until approved — approving
flips the account active and enrolls the character into the active round; rejecting
deletes both rows so the username/character name are free to try again.
