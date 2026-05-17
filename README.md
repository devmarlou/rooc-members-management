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
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="change-this-password"
SESSION_SECRET="replace-with-a-long-random-string"
```

4. Run the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Current Scope

- Static admin login backed by a signed httpOnly session cookie.
- Server-side Supabase access through API routes.
- Persistent member roster CRUD.
- Persistent party/group CRUD.
- Assign and remove members from parties.
- Auction lineup, GL/WoE, League Prize, shared progress, and public read-only views.
- 96h auction cooldown based on each member's PH joined date/time.

## Imports

Import the original member masterfile:

```bash
npm run import:members -- "/path/to/Encore Masterfile - Sheet1.csv"
```

Import the current auction cycle from the ROOC Auction Log. The Auction Log is the source of truth for who is in the active lineup and in what order; the Masterfile only supplies missing class names.

Dry-run first:

```bash
npm run import:auction-state -- "/path/to/Copy of Encore ROOC - Auction Log.csv" \
  --class-source "/path/to/Encore Masterfile - Sheet1.csv" \
  --joined-at "Osnub=2026-05-14 23:00" \
  --replace-active \
  --dry-run
```

Apply it:

```bash
npm run import:auction-state -- "/path/to/Copy of Encore ROOC - Auction Log.csv" \
  --class-source "/path/to/Encore Masterfile - Sheet1.csv" \
  --joined-at "Osnub=2026-05-14 23:00" \
  --replace-active \
  --clear-auctions
```

`--clear-auctions` removes open/history auctions for the active lineup so the imported cycle can be tested cleanly.

## Vercel

Set these environment variables in Vercel before deploying:

```bash
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ADMIN_USERNAME
ADMIN_PASSWORD
SESSION_SECRET
```

Do not commit `.env.local`.
