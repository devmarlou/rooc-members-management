# ENCORE Member Dashboard

Next.js + Supabase guild admin dashboard for members, parties, and the upcoming auction system.

## Development Setup

This is a Next.js app connected to the team-owned live Supabase database. Do not create a new Supabase project for local development; use the shared environment values from the team.

### Prerequisites

- Node.js 20+
- npm
- Team-provided `.env.local` values for the shared Supabase project

### macOS

```bash
git clone <repo-url>
cd "Member Dashboard"
npm install
```

Create `.env.local` from the example:

```bash
cp .env.example .env.local
```

Fill in the team-provided environment values:

```bash
SUPABASE_URL="https://your-project-ref.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
SESSION_SECRET="replace-with-a-long-random-string"
NEXT_PUBLIC_SUPABASE_URL="https://your-project-ref.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="your-publishable-or-anon-key"
```

Start the dev server:

```bash
npm run dev
```

Open `http://localhost:3000`.

### Windows

Use PowerShell:

```powershell
git clone <repo-url>
cd "Member Dashboard"
npm install
```

Create `.env.local` from the example:

```powershell
Copy-Item .env.example .env.local
```

Fill in the team-provided environment values:

```powershell
SUPABASE_URL="https://your-project-ref.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
SESSION_SECRET="replace-with-a-long-random-string"
NEXT_PUBLIC_SUPABASE_URL="https://your-project-ref.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="your-publishable-or-anon-key"
```

Start the dev server:

```powershell
npm run dev
```

Open `http://localhost:3000`.

## Useful Scripts

```bash
npm run dev
npm run build
npm run lint
```

`npm run dev` starts the local Next.js server. `npm run build` verifies the app compiles. `npm run lint` runs ESLint against the repo.

## Current Scope

- Manual Supabase row-managed admin login backed by a signed httpOnly session cookie.
- `super_admin` users can view audit logs; `admin` users can manage dashboard data.
- Server-side Supabase access through API routes.
- Persistent member roster CRUD.
- Persistent party/group CRUD.
- Assign and remove members from parties.
- Auction lineup, Guild Auction, League Prize, shared progress, and public read-only views.
- 96h auction cooldown based on each member's PH joined date/time.

## Core Logic

- `app/api/**/route.js` contains the server actions used by the UI.
- `lib/supabaseAdmin.js` creates the server-side Supabase client using the service role key.
- `lib/session.js` handles the signed admin session cookie.
- `lib/auctionEngine.js` owns the main auction flow: active rounds, lineup order, item caps, allocation state, cant-pay handling, auction finalization, and public/admin state hydration.
- `lib/dashboardEvents.js` emits dashboard refresh events after mutations so open clients can reload current state.

## Shared Database

Local development points at the live team database. Treat local actions as real data changes unless you are working in a separate test account or agreed test window.

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
