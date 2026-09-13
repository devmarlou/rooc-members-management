# Discord-connected member registration plan

## Confirmed product decisions

- A Discord login and local username/password are two ways into the **same account**.
- Members may share the local username/password with a pilot without granting Discord access.
- Registration is automatically approved. A completed registration immediately creates an active member in Master List.
- The current roster is test data and will be replaced with a fresh dataset. Keep the `devlou` account.
- This plan does not change Supabase data or credentials.

## Goal

Let a new guild member register through Discord, supply their in-game character details and a local login, then immediately appear in Master List. The same account can subsequently sign in with Discord or local credentials.

## Account model

Keep authentication identity separate from a roster character.

| Record | Purpose | Key fields |
| --- | --- | --- |
| Account (`app_users`) | Login identity and access role | `id`, `username`, `password_hash`, `discord_user_id`, `role`, `status` |
| Member (`members`) | In-game character used by parties and auctions | `id`, `char_name`, `char_class`, `account_id`, existing roster fields |

`discord_user_id` is the permanent Discord ID, not the mutable Discord display name. Both `username` and `discord_user_id` must be unique. `account_id` links the roster record to the account that registered it.

The initial release should support one account to one primary Master List member. The separate records keep the door open for alts later without changing auction history.

## Roles and access

- `super_admin`: current full access, including account/role management.
- `admin`: current roster, party, and auction management.
- `member`: may authenticate, but has no admin controls. Initially send members to the public auction view or a small account page.

New self-registrations receive the `member` role. Existing `devlou` remains `super_admin` and keeps local username/password access; Discord linking can be added later from Account settings.

## Registration flow

1. Visitor selects **Register with Discord**.
2. Server creates a short-lived OAuth state (and PKCE verifier) in an HTTP-only cookie, then redirects to Discord with only the `identify` scope.
3. Discord returns an authorization code to the registered callback route.
4. Server validates state, exchanges the code server-side, and reads the Discord user ID/profile.
5. If that Discord ID is already linked, show the sign-in path instead of creating another account.
6. Otherwise show the completion form: local username, password, character name, and character class.
7. Server validates the fields, creates the account and linked member in one database transaction, then issues the existing session cookie.
8. Member lands on their permitted view and is visible in Master List immediately.

The local login form continues to work. It verifies the existing password hash and creates the same session cookie used by Discord sign-in.

## Discord sign-in flow

1. Visitor selects **Continue with Discord**.
2. Run the same authorization-code flow with `identify`.
3. Look up the account by `discord_user_id`.
4. If the account is active, create the normal session cookie and redirect to its allowed page.
5. If no linked account exists, offer registration; do not silently create an incomplete roster member.

## Database and API work

Supabase changes must be designed, reviewed, and applied to the live project manually. Do not commit a schema file or run a reset script as part of this implementation.

1. Extend `app_users` with Discord identity, account status, and any registration metadata needed for recovery/audit.
2. Add `members.account_id` with a unique constraint for the one-primary-character rule.
3. Update the existing `verify_app_user_login` RPC so only active accounts can use local credentials.
4. Add a transactional registration RPC that creates the account, hashes the password, creates the linked member, and returns the session identity. It must roll back everything if any validation fails.
5. Add a safe account lookup/linking RPC for the Discord callback.
6. Add audit-log events for registration, Discord link, account disable, and role changes.
7. Add server routes for Discord start, callback, registration completion, and Discord sign-in. Reuse the existing `createSessionToken` and session cookie instead of creating a second session system.
8. Add login/register UI and an account status/error screen. The admin Master List keeps existing management behavior.

## Security requirements

- Use Discord's server-side OAuth authorization-code flow; never expose the client secret or exchanged tokens in browser code.
- Validate a cryptographically random OAuth `state` value and use PKCE.
- Request only Discord's `identify` scope unless a later feature needs more.
- Store Discord user IDs, not Discord access tokens, for ordinary sign-in. Revoke/discard tokens after identity lookup unless a future feature genuinely needs them.
- Keep the existing password hashing approach inside Supabase; never store or log plaintext passwords.
- Apply rate limits to registration and local login; return generic credential errors.
- Keep all role assignment server-side. Registration can only create the `member` role.
- Require an authenticated session for Discord unlinking or account credential changes.

## Fresh-data cutover

This is a separate, destructive live-data operation and happens only after the registration flow is tested.

1. Export or snapshot the current test roster and dependent party/auction data.
2. Identify every foreign-key dependency before deleting any member or group rows.
3. Preserve the `devlou` `app_users` record, its `super_admin` role, and its password login.
4. Remove test roster and dependent test-only records in dependency order.
5. Start with no Master List members or parties; new registrations create the real roster.
6. Verify `devlou` can sign in, manage the empty roster, and that a first Discord registration creates exactly one active member.

## Delivery order

1. Create and configure the Discord application, production redirect URI, and server environment variables.
2. Implement and test the database transaction/RPCs against non-production test records.
3. Add OAuth routes and local/Discord login UI.
4. Add member role guards and account-link display.
5. Test registration, duplicate Discord/username rejection, Discord sign-in, local sign-in, pilot local sign-in, logout, and disabled-account behavior.
6. Perform the reviewed fresh-data cutover while preserving `devlou`.
7. Release and monitor audit logs for the first registrations.

## Before implementation

The remaining product choice is what an authenticated `member` sees after sign-in. Recommended first release: redirect them to the existing public auction page plus a small account page that shows their linked character. They should not receive the admin navigation.
