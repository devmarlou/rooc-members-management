# Free Deployment Guide — Guild Admin Dashboard

> Everything you need to deploy the dashboard online for $0/month. Beginner-friendly, step-by-step.

---

## TL;DR — The Stack

| Layer | Service | Free Tier | What it does |
|---|---|---|---|
| **Code hosting** | GitHub | Free unlimited | Stores your source code |
| **Web hosting** | Vercel | Free hobby tier | Hosts the Next.js app |
| **Database** | Supabase | Free tier (500MB) | Postgres DB + auth |
| **Domain (optional)** | Vercel subdomain | Free `*.vercel.app` | Your URL |
| **Custom domain (optional)** | Namecheap / Porkbun | ~$10/year | If you want `myguild.com` |
| **Code editor** | VS Code | Free | Where you write/edit code |
| **Git client** | Git (CLI) or GitHub Desktop | Free | Push code to GitHub |
| **Local dev environment** | Node.js | Free | Run the app on your computer |

**Total cost: $0/month** (or ~$10/year if you want a custom domain).

---

## 1. Prerequisites — Install These First

### A. Node.js (required)
The runtime for Next.js. Install version 20+ LTS.

- Download: https://nodejs.org/
- Pick the **LTS** version (currently 20.x)
- Verify after install: open Terminal/PowerShell and run `node --version` → should print `v20.x.x`

### B. Git (required)
Version control. Pushes your code to GitHub.

- **Windows:** https://git-scm.com/download/win
- **Mac:** comes pre-installed, or `brew install git`
- **Linux:** `sudo apt install git`
- Verify: `git --version`

### C. Code editor (recommended)
- **VS Code:** https://code.visualstudio.com/ (free, best for Next.js)
- Recommended extensions inside VS Code:
  - Tailwind CSS IntelliSense
  - ES7+ React/Redux snippets
  - Prettier
  - GitLens

### D. Optional but helpful
- **GitHub Desktop:** https://desktop.github.com/ (visual Git client if you don't like the command line)
- **TablePlus** or **DBeaver:** free database GUI tools to inspect Supabase data

---

## 2. Account Sign-ups (all free)

### A. GitHub account
- Go to https://github.com/signup
- Use any email
- Pick a username (this becomes part of your repo URL)

### B. Vercel account
- Go to https://vercel.com/signup
- **Sign up with GitHub** (easiest — auto-connects your repos)
- Free Hobby plan: 100GB bandwidth/month, unlimited deployments. More than enough for 5 admins.

### C. Supabase account
- Go to https://supabase.com/dashboard/sign-up
- **Sign up with GitHub** (easiest)
- Free tier:
  - 500 MB database
  - 5 GB bandwidth
  - 50,000 monthly active users
  - 2 free projects
- Note: free Supabase projects pause after 7 days of inactivity (just visit the dashboard to wake it up, or set up a cron to ping it).

---

## 3. Set Up Supabase (the database)

### A. Create the project

1. After signing in, click **"New Project"**
2. **Name:** `guild-dashboard` (or whatever)
3. **Database Password:** Generate a strong one — **save it somewhere safe** (you might need it later, but rarely)
4. **Region:** Pick closest to your guild (e.g. Singapore for Asia, US East for NA)
5. **Pricing:** Free tier ✓
6. Click **"Create new project"** — takes ~2 minutes to provision

### B. Get your API credentials

Once the project is ready:

1. In Supabase dashboard, go to **Project Settings (gear icon)** → **API**
2. You'll see three values — **copy these somewhere safe**:
   - `Project URL` → starts with `https://xxxxx.supabase.co` → this is your `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → long string starting with `eyJ...` → this is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → also `eyJ...` → this is your `SUPABASE_SERVICE_ROLE_KEY` (server-side only, **never expose** in frontend code)

### C. Create the database tables

In Supabase dashboard, go to **SQL Editor** → **New Query**. Paste this entire block and click **Run**:

```sql
-- Members
CREATE TABLE members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  char_name TEXT NOT NULL UNIQUE,
  char_class TEXT NOT NULL,
  group_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Party groups
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE members ADD CONSTRAINT fk_member_group
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;

-- Auction item catalog
CREATE TABLE auction_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INT NOT NULL UNIQUE,
  default_per_round_cap INT NOT NULL,
  applies_to_auction_types TEXT[] NOT NULL DEFAULT ARRAY['gl_woe'],
  gates_round_completion BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed data
INSERT INTO auction_items (name, sort_order, default_per_round_cap, applies_to_auction_types, gates_round_completion) VALUES
  ('Puppet Card', 1, 1, ARRAY['gl_woe', 'league_prize'], TRUE),
  ('Puppet Fragment', 2, 3, ARRAY['league_prize'], FALSE),
  ('Feather of L&D', 3, 5, ARRAY['gl_woe', 'league_prize'], TRUE),
  ('Feather of T&S', 4, 5, ARRAY['gl_woe', 'league_prize'], TRUE);

-- Rounds
CREATE TABLE rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_number SERIAL,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Locked rotation list per round
CREATE TABLE rotation_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  position INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (round_id, member_id),
  UNIQUE (round_id, position)
);

-- Member progress per round
CREATE TABLE member_round_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  received JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_complete BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  UNIQUE (round_id, member_id)
);

-- Per-member cap overrides (round-scoped)
CREATE TABLE member_cap_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES auction_items(id) ON DELETE CASCADE,
  cap INT NOT NULL,
  UNIQUE (round_id, member_id, item_id)
);

-- Auctions
CREATE TABLE auctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('gl_woe', 'league_prize')),
  name TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'done')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  done_at TIMESTAMPTZ
);

-- Inventory per auction
CREATE TABLE auction_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES auction_items(id) ON DELETE CASCADE,
  quantity INT NOT NULL CHECK (quantity >= 0),
  UNIQUE (auction_id, item_id)
);

-- Queue per auction
CREATE TABLE auction_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  position INT NOT NULL,
  is_carry_over BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'cant_pay')),
  removed_at TIMESTAMPTZ,
  UNIQUE (auction_id, member_id),
  UNIQUE (auction_id, position)
);

-- Allocations per auction
CREATE TABLE auction_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES auction_items(id) ON DELETE CASCADE,
  quantity INT NOT NULL,
  page_assignments JSONB NOT NULL DEFAULT '[]'::jsonb,
  fulfilled BOOLEAN NOT NULL DEFAULT TRUE
);

-- Indexes for query performance
CREATE INDEX idx_rotation_list_round ON rotation_list(round_id, position);
CREATE INDEX idx_progress_round ON member_round_progress(round_id);
CREATE INDEX idx_queue_auction ON auction_queue(auction_id, position);
CREATE INDEX idx_allocations_auction ON auction_allocations(auction_id);
```

### D. Disable RLS (Row Level Security) for v1

Because this is a single-admin tool with a shared password, we don't need Supabase's row-level security. For each table, run:

```sql
ALTER TABLE members DISABLE ROW LEVEL SECURITY;
ALTER TABLE groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE auction_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE rounds DISABLE ROW LEVEL SECURITY;
ALTER TABLE rotation_list DISABLE ROW LEVEL SECURITY;
ALTER TABLE member_round_progress DISABLE ROW LEVEL SECURITY;
ALTER TABLE member_cap_overrides DISABLE ROW LEVEL SECURITY;
ALTER TABLE auctions DISABLE ROW LEVEL SECURITY;
ALTER TABLE auction_inventory DISABLE ROW LEVEL SECURITY;
ALTER TABLE auction_queue DISABLE ROW LEVEL SECURITY;
ALTER TABLE auction_allocations DISABLE ROW LEVEL SECURITY;
```

> **Security note:** Without RLS, anyone with the anon key could theoretically read/write data via the Supabase REST API. We rely on:
> 1. The shared admin password (gates app access)
> 2. The service_role key for sensitive operations (server-side only)
> 3. Not publicly advertising the URL
>
> For 5 internal users on an obscure URL, this is fine. If you ever go public, add RLS policies.

---

## 4. Set Up the Next.js Project Locally

### A. Generate the project

Open Terminal/PowerShell and run:

```bash
npx create-next-app@latest guild-dashboard --typescript --tailwind --app --no-src-dir --import-alias "@/*"
cd guild-dashboard
```

When prompted:
- ESLint: **Yes**
- Customize import alias: **No** (use default `@/*`)

### B. Install dependencies

```bash
# Supabase client
npm install @supabase/supabase-js

# shadcn/ui setup
npx shadcn@latest init
```

When shadcn asks:
- Style: **Default** (or New York)
- Base color: **Zinc**
- CSS variables: **Yes**

Then add components you'll need:

```bash
npx shadcn@latest add button card dialog input label select badge table tabs toggle toggle-group dropdown-menu sheet alert-dialog toast combobox
```

```bash
# Form handling
npm install react-hook-form zod @hookform/resolvers

# Icons (already included with shadcn)
npm install lucide-react

# Utility
npm install clsx tailwind-merge
```

### C. Set up environment variables

Create a file `.env.local` in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-anon-key...
SUPABASE_SERVICE_ROLE_KEY=eyJ...your-service-role-key...
ADMIN_PASSWORD=pick-a-strong-shared-password
AUTH_SECRET=run-`openssl rand -base64 32`-to-generate-this
```

> **Important:** `.env.local` is already in `.gitignore` by default in Next.js — your secrets won't be pushed to GitHub.

To generate `AUTH_SECRET`, run in terminal:
```bash
openssl rand -base64 32
```

(On Windows without openssl, use https://generate-secret.vercel.app/32)

### D. Drop in your class icons

Copy your `guild-icons/png-web/` folder contents into `public/icons/`:

```
guild-dashboard/
  public/
    icons/
      lord-knight.png
      paladin.png
      ...all 14 icons
```

### E. Test it runs

```bash
npm run dev
```

Open http://localhost:3000 — you should see the default Next.js page. If yes, your environment is working.

---

## 5. Push to GitHub

### A. Create the GitHub repo

1. Go to https://github.com/new
2. **Repository name:** `guild-dashboard`
3. **Visibility:** **Private** (don't make this public — your admin password might leak)
4. **Don't** initialize with README/gitignore (Next.js already made them)
5. Click **Create repository**

### B. Push your code

GitHub shows you commands. Run these in your project folder:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/guild-dashboard.git
git push -u origin main
```

If using GitHub Desktop instead:
1. **File → Add Local Repository** → pick your `guild-dashboard` folder
2. **Publish repository** (uncheck "public")
3. **Commit to main** → **Push origin**

---

## 6. Deploy to Vercel

### A. Connect GitHub

1. Go to https://vercel.com/dashboard
2. Click **"Add New..."** → **"Project"**
3. Find your `guild-dashboard` repo → click **Import**
4. Configure:
   - **Framework Preset:** Next.js (auto-detected)
   - **Root Directory:** `.` (default)
   - **Build Command:** `next build` (default)
   - **Output Directory:** `.next` (default)

### B. Add environment variables

In the same Vercel import screen, expand **Environment Variables** and add the same ones from `.env.local`:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your service role key |
| `ADMIN_PASSWORD` | Your chosen admin password |
| `AUTH_SECRET` | Your generated secret |

Click **Deploy**. First deploy takes ~2 minutes.

### C. You're live!

Vercel gives you a URL like `https://guild-dashboard-yourname.vercel.app`. Share with the 4 other admins. Done.

---

## 7. Auto-deploy on every code push

Already done — Vercel auto-deploys whenever you push to `main` on GitHub. To update your site:

```bash
# After editing code
git add .
git commit -m "What you changed"
git push
```

Vercel detects the push, rebuilds, and updates the live site within ~1 minute.

---

## 8. Optional: Custom Domain

If you want `myguild.com` instead of `guild-dashboard-xyz.vercel.app`:

### A. Buy a domain
- **Namecheap** (https://www.namecheap.com) — ~$10/year for `.com`
- **Porkbun** (https://porkbun.com) — often cheaper, decent UI
- **Cloudflare Registrar** (https://www.cloudflare.com/products/registrar/) — at-cost pricing

### B. Connect to Vercel
1. In Vercel dashboard → your project → **Settings** → **Domains**
2. Add your domain
3. Vercel gives you DNS records to add at your registrar
4. Go to your registrar → DNS settings → add the records
5. Wait 5-60 minutes for propagation

Free SSL certificate auto-provisioned by Vercel.

---

## 9. Keeping Supabase Awake

Free Supabase projects pause after **7 days of inactivity** to save resources. If 7 days pass without any DB activity:
- Your dashboard will show errors until you wake it up
- Just visit the Supabase project dashboard → it auto-resumes (takes ~1 minute)

**To prevent pausing**, options:
1. Just use the dashboard regularly (likely if your guild auctions weekly)
2. Set up a free uptime monitor (https://uptimerobot.com — free for 50 monitors) to ping a Supabase endpoint daily
3. Upgrade Supabase to the Pro plan ($25/month) — but probably not needed for 5 admins

---

## 10. Backup Strategy (recommended but optional)

Supabase free tier doesn't include automated backups. To back up manually:

### Option A: Supabase dashboard
1. Project → Database → Backups → Download (manual, takes 1 minute)
2. Run weekly or before any major change

### Option B: Use `pg_dump` (advanced)
```bash
pg_dump "postgresql://postgres:YOUR-PASSWORD@db.YOUR-PROJECT.supabase.co:5432/postgres" > backup.sql
```

Store backups in Google Drive, Dropbox, or just locally.

---

## 11. Troubleshooting Common Issues

| Problem | Fix |
|---|---|
| **`npm install` errors** | Make sure Node.js is v20+. Run `node --version` |
| **Vercel build fails** | Check the build logs. Most common: missing env var. Add it in Project Settings → Environment Variables, then redeploy |
| **Supabase connection error** | Double-check `NEXT_PUBLIC_SUPABASE_URL` and `_KEY` in both `.env.local` AND Vercel. They must match Supabase project |
| **"Auth secret missing"** | Run `openssl rand -base64 32`, add to env vars |
| **Database project paused** | Visit Supabase dashboard, wait ~1 min for resume |
| **Forgot admin password** | Update `ADMIN_PASSWORD` in Vercel env vars → trigger redeploy (Vercel dashboard → Deployments → ⋯ → Redeploy) |
| **Need to inspect data** | Supabase dashboard → Table Editor (built-in) or connect TablePlus using DB credentials |

---

## 12. Quick Reference — Project Structure

After setup, your project should look like:

```
guild-dashboard/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    ← main dashboard SPA
│   ├── login/
│   │   └── page.tsx                ← admin password screen
│   └── api/
│       ├── login/route.ts
│       └── logout/route.ts
├── components/
│   ├── ui/                         ← shadcn components
│   ├── banner.tsx
│   ├── statistics.tsx
│   ├── members-section.tsx
│   ├── member-card.tsx
│   ├── parties-section.tsx
│   ├── auctions-section.tsx
│   ├── active-auction-view.tsx
│   ├── adjust-limits-dialog.tsx
│   └── rotation-list-dialog.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts               ← browser client
│   │   └── server.ts               ← server client
│   ├── auth.ts
│   ├── classes.ts                  ← class catalog with icons + colors
│   └── actions/
│       ├── members.ts
│       ├── groups.ts
│       └── auctions.ts             ← allocation algorithm here
├── public/
│   └── icons/                      ← class PNG icons
├── middleware.ts                   ← auth check on every page
├── .env.local                      ← local secrets (gitignored)
├── tailwind.config.ts
└── package.json
```

---

## 13. Total Setup Time Estimate

For someone new to this:
- Account sign-ups: 15 min
- Local environment: 30 min
- Supabase tables: 10 min
- Initial Next.js project: 20 min
- First Vercel deploy: 10 min
- **Total: ~1.5 hours from zero to deployed empty shell**

Building out the actual UI/features (using the design briefs + Claude Design) is a separate phase, but the infrastructure is then ready to receive your code as you build it.

---

## 14. Next Steps After Deployment

1. Verify the empty shell deploys (default Next.js page on Vercel URL)
2. Use Claude Design with `auction-design-brief.md` to generate UI components
3. Wire up Supabase calls in server actions (use `auction-logic-spec.md` for the algorithm)
4. Test locally with `npm run dev`
5. Push to GitHub → auto-deploys to Vercel
6. Add the other 4 admins (just share the URL + admin password)

---

## 15. Useful Resources

- Next.js docs: https://nextjs.org/docs
- Supabase docs: https://supabase.com/docs
- shadcn/ui docs: https://ui.shadcn.com
- Tailwind docs: https://tailwindcss.com/docs
- Vercel docs: https://vercel.com/docs

---

**That's it. Welcome to free deployment.** If you hit a snag, the error messages in Vercel build logs and Supabase dashboard are usually clear enough to Google.
