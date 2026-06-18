# ENCORE Member Dashboard

Next.js + Supabase guild admin dashboard for members, parties, and the upcoming auction system.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create a Supabase project and run [supabase/schema.sql](./supabase/schema.sql) in the SQL Editor.

3. Copy `.env.example` to `.env.local` and fill in:

```bash
SUPABASE_URL="https://your-project-ref.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
SESSION_SECRET="replace-with-a-long-random-string"
NEXT_PUBLIC_SUPABASE_URL="https://your-project-ref.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="your-publishable-or-anon-key"
```

4. Create app users manually in Supabase SQL Editor:

```sql
insert into app_users (username, role, password_hash, must_reset_password)
values ('your-name', 'super_admin', extensions.crypt('default-password-here', extensions.gen_salt('bf')), true);

insert into app_users (username, role, password_hash, must_reset_password)
values ('guild-admin', 'admin', extensions.crypt('default-password-here', extensions.gen_salt('bf')), true);
```

Users must change the default password after first login.

5. Run the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Current Scope

- Manual Supabase row-managed admin login backed by a signed httpOnly session cookie.
- `super_admin` users can view audit logs; `admin` users can manage dashboard data.
- Server-side Supabase access through API routes.
- Persistent member roster CRUD.
- Persistent party/group CRUD.
- Assign and remove members from parties.
- Auction lineup, Guild Auction, League Prize, shared progress, and public read-only views.
- 96h auction cooldown based on each member's PH joined date/time.

## Imports

Import the original member masterfile:

```bash
npm run import:members -- "/path/to/Encore Masterfile - Sheet1.csv"
```

Import the party groups and slot order from the main-field CSV:

```bash
npm run import:party-groups -- "/path/to/main-field.csv" --create-missing
```

Before using manual party slot reordering, run [supabase/migrations/20260609_add_member_party_slot.sql](./supabase/migrations/20260609_add_member_party_slot.sql) in the Supabase SQL Editor.

Import the current auction cycle from the ROOC Auction Log. The Auction Log is the source of truth for who is in the active lineup and in what order; the Masterfile only supplies missing class names.

Dry-run first:

```bash
npm run import:auction-state -- "/path/to/Copy of Encore ROOC - Auction Log.csv" \
  --class-source "/path/to/Encore Masterfile - Sheet1.csv" \
  --roster-source "/path/to/current-rooc-members.txt" \
  --joined-at "Osnub=2026-05-14 23:00" \
  --replace-active \
  --dry-run
```

Apply it:

```bash
npm run import:auction-state -- "/path/to/Copy of Encore ROOC - Auction Log.csv" \
  --class-source "/path/to/Encore Masterfile - Sheet1.csv" \
  --roster-source "/path/to/current-rooc-members.txt" \
  --joined-at "Osnub=2026-05-14 23:00" \
  --replace-active \
  --clear-auctions
```

`--clear-auctions` removes open/history auctions for the active lineup so the imported cycle can be tested cleanly.
`--roster-source` lets a plain text or CSV member list control the current auction queue while copying item progress from matching names in the Auction Log.

## Vercel

Set these environment variables in Vercel before deploying:

```bash
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SESSION_SECRET
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Do not commit `.env.local`.
