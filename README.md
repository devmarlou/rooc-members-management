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
- Auction tables and item catalog are prepared in the database schema.

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
