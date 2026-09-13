# Local (non-Discord) registration + "connect Discord later" — manual setup runbook

Run this against the **live shared Supabase project** — there's no local/staging DB. Both blocks are
purely additive: no existing table, column, or function (including `register_member_account`,
`discord_lookup_account`, `verify_app_user_login`) is touched. Go one block at a time in the Supabase
SQL Editor and check for errors before moving to the next.

No new tables or columns are needed — `app_users.discord_user_id`/`registered_via` were already added
by `DISCORD_AUTH_SETUP_RUNBOOK.md` Block 1 with exactly this case (`registered_via` defaults `'local'`,
`discord_user_id` is nullable+unique) in mind.

### Block 1 — `register_local_account` RPC

A separate RPC from `register_member_account` (rather than making `p_discord_user_id` optional on the
existing one) so the working Discord registration path is never at risk. Same shape and error
convention (`username_taken` / `char_name_taken`), minus anything Discord-related, and lands the new
account as `status='pending'` (same admin-approval gate the Discord flow already uses).
```sql
CREATE OR REPLACE FUNCTION register_local_account(
  p_username TEXT,
  p_password TEXT,
  p_char_name TEXT,
  p_char_class TEXT
)
RETURNS TABLE (id UUID, username TEXT, role TEXT, must_reset_password BOOLEAN)
LANGUAGE plpgsql
AS $$
DECLARE
  new_user_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM app_users au WHERE lower(au.username) = lower(p_username)) THEN
    RAISE EXCEPTION 'username_taken';
  END IF;
  IF EXISTS (SELECT 1 FROM members m WHERE lower(m.char_name) = lower(p_char_name)) THEN
    RAISE EXCEPTION 'char_name_taken';
  END IF;

  INSERT INTO app_users (username, password_hash, role, must_reset_password, status, registered_via)
  VALUES (p_username, extensions.crypt(p_password, extensions.gen_salt('bf')), 'member', FALSE, 'pending', 'local')
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
Approval/rejection reuse the existing "Pending approval" admin panel and
`app/api/members/pending/[id]/route.js` unchanged — it doesn't care whether `registered_via` is
`'local'` or `'discord'`. Login afterward goes through the existing `/api/auth/login` +
`verify_app_user_login`, also unchanged — password hashing uses the same
`extensions.crypt(..., extensions.gen_salt('bf'))` call as `register_member_account`, so it's
compatible with however `verify_app_user_login` checks passwords today.

### Block 2 — `link_discord_account` RPC

Called once, after an already-logged-in member completes the Discord OAuth round trip from their
account page (`app/api/auth/discord/link/start/route.js` → the existing callback's new `intent="link"`
branch). Guards against linking a Discord identity that's already claimed by a *different* account, and
against re-linking an account that already has one.
```sql
CREATE OR REPLACE FUNCTION link_discord_account(
  p_account_id UUID,
  p_discord_user_id TEXT
)
RETURNS TABLE (id UUID, username TEXT, discord_user_id TEXT)
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM app_users au WHERE au.id = p_account_id AND au.discord_user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'already_linked';
  END IF;
  IF EXISTS (SELECT 1 FROM app_users au WHERE au.discord_user_id = p_discord_user_id) THEN
    RAISE EXCEPTION 'discord_already_linked';
  END IF;

  UPDATE app_users
  SET discord_user_id = p_discord_user_id, discord_linked_at = now()
  WHERE app_users.id = p_account_id;

  RETURN QUERY
  SELECT u.id, u.username, u.discord_user_id
  FROM app_users u
  WHERE u.id = p_account_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'discord_already_linked';
END;
$$;
```

## After running both blocks

Manual verification pass:
- Register locally from the login screen ("Register without Discord") → confirm a `pending` row lands
  in `app_users` with `registered_via='local'`, `discord_user_id` null, and a linked `members` row.
- Approve it from the existing Pending approval panel → log in with the chosen username/password.
- From "Your account", click "Connect Discord" → complete the Discord prompt → confirm
  `discord_user_id`/`discord_linked_at` are now set and the UI shows "Connected". Log out and back in
  via "Continue with Discord" → confirm it reaches the same account.
- Try registering locally with a username or character name already in use (including one registered
  via Discord) → rejected with the expected message, no partial rows.
- Try connecting a Discord account that's already linked to a different guild account → rejected, no
  change to either account.
