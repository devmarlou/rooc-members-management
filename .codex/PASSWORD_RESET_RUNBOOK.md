# Forgot password — manual setup runbook

Run this against the **live shared Supabase project** in the SQL Editor. It is purely additive: no
existing table, column, or function (including `reset_app_user_password` and `verify_app_user_login`)
is touched.

Accounts have no email, so "forgot password" works two ways:

- **Discord-linked accounts**: "Forgot password?" on the login screen → Discord OAuth with
  `intent="reset"` → a session flagged `resetVerified` that can only set a new password
  (`app/api/auth/reset-password/route.js`, no current password needed).
- **Local-only accounts**: an admin opens the member and clicks "Reset password"
  (`app/api/members/[id]/reset-password/route.js`). That sets a one-time temporary password with
  `must_reset_password = true`, so the user must choose a new one at next sign-in. Only a
  `super_admin` can reset an `admin`/`super_admin` account.

Both paths need one RPC that sets a password without checking the current one.

### Block 1 — `set_app_user_password` RPC

Same `extensions.crypt(..., extensions.gen_salt('bf'))` hashing as the register RPCs, so the result
stays compatible with `verify_app_user_login`. Returns no row when the account id doesn't exist.
```sql
CREATE OR REPLACE FUNCTION set_app_user_password(
  input_user_id UUID,
  input_new_password TEXT,
  input_must_reset BOOLEAN
)
RETURNS TABLE (id UUID, username TEXT, role TEXT, must_reset_password BOOLEAN)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE app_users u
  SET password_hash = extensions.crypt(input_new_password, extensions.gen_salt('bf')),
      must_reset_password = input_must_reset
  WHERE u.id = input_user_id
  RETURNING u.id, u.username, u.role, u.must_reset_password;
END;
$$;
```

The app only calls this through the service-role client (`lib/supabaseAdmin.js`). Make sure the
public roles cannot call it directly:
```sql
REVOKE EXECUTE ON FUNCTION set_app_user_password(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
```

### Discord app setup

Nothing new. The reset flow reuses the same `DISCORD_REDIRECT_URI` callback as sign-in.
