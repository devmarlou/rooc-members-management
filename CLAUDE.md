# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ENCORE Member Dashboard — a Next.js (App Router) + Supabase admin dashboard for a guild's members, parties, and auction system. There is no local database: **local dev connects to the team's shared, live Supabase project.** Treat every mutation (including ones you trigger while testing) as a real data change unless the user says otherwise. Ask before running scripts or actions that import, reset, delete, or bulk-update data.

## Commands

```bash
npm install
npm run dev      # start local Next.js server (http://localhost:3000)
npm run build    # compile check — run this to verify changes, there is no test suite
npm run lint     # ESLint (eslint-config-next). Warnings may already exist; don't introduce new errors.
```

There are no automated tests in this repo. `npm run build` is the correctness check for compile/type issues; manual verification against the live dashboard is the check for behavior.

One-off data scripts (destructive — confirm with the user before running):
```bash
npm run import:members
npm run import:party-groups
npm run import:auction-state
```
Other scripts under `scripts/` (`backfill-held-totals.mjs`, `check-auction-page-search.mjs`, `check-auction-priority-order.mjs`, `restore-auction-snapshot.mjs`) are run directly with `node scripts/<name>.mjs` and are similarly one-off/data-affecting.

Required env vars (see `.env.example`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, plus `ADMIN_USERNAME`/`ADMIN_PASSWORD` for the static admin gate. Never commit `.env.local`.

## Architecture

**Routing shell is deliberately thin.** Every page under `app/**/page.js` (`/`, `/auctions`, `/parties`, `/audit-logs`, `/public`, `/pending`, `/member-stats`, `/job-classes`) is a ~7-line client component that just renders `components/DashboardApp.jsx`. Nearly all UI logic — including which "page" is shown — lives in that one ~5,000-line client component, not in Next.js routing/layouts. When working on UI, go straight to `DashboardApp.jsx` rather than expecting per-route files to hold logic.

**Backend is API routes + a small `lib/` layer**, no separate server framework:
- `app/api/**/route.js` — one file per endpoint (members, groups, parties, auctions, auth, audit-logs, bootstrap, member-stats, job-classes). Each route follows the same shape: `requireAuth`/`requireRole` guard → call into `lib/` → `emitDashboardEvent` on mutation → `writeAuditLog` → `NextResponse.json`, with `handleApiError` for the catch block. Follow this shape for new routes rather than inventing a new pattern.
- `lib/supabaseAdmin.js` — the only place a Supabase client is constructed server-side, using the service-role key (cached singleton). All privileged DB access goes through `getSupabaseAdmin()`.
- `lib/supabaseBrowser.js` — publishable-key client for client-side use (public/anon-level access only).
- `lib/session.js` — auth model: a signed, HMAC'd, httpOnly cookie (no server-side session store, no Supabase Auth). `createSessionToken`/`verifySessionToken` handle signing/verification; roles are `admin` and `super_admin`. `super_admin` can view audit logs; `admin` manages dashboard data. `mustResetPassword` is enforced via `requireAuth`'s `allowPasswordReset` option.
- `lib/api.js` — shared route helpers (`requireAuth`, `requireRole`, `unauthorized`, `handleApiError`) and the member/group/auction-item select column lists used for bootstrap loads, including a graceful-fallback query path for Postgres columns that may not exist yet (`isMissingMemberColumnError`).
- `lib/auditLog.js` — `writeAuditLog` inserts into `audit_logs`, attributing actions to the session's user/role; call after every mutating action.
- `lib/dashboardEvents.js` — `emitDashboardEvent` inserts into `dashboard_events` so open clients know to refetch; call after every mutation that should propagate live.
- `lib/bootstrapData.js` — `fetchBootstrapData` is the single loader for members + groups + auction items + auction state + job classes, shared by both the authenticated bootstrap route and the public one (`app/api/public/bootstrap/route.js` wraps it and strips private fields like `notes` before returning).
- `lib/jobClasses.js` — shared select column list, color-group palette, icon validation/upload helpers, and `mapJobClassRow` for the `job_classes` table (admin-editable job class list; see `JOB_CLASSES_RUNBOOK.md` for the table/Storage bucket/rename-cascade RPC).
- `lib/memberStatsRetention.js` — `enforceMemberStatsRetention` trims a member's `member_stats` rows to the latest 2 (JS-side follow-up after insert, no DB trigger; see `MEMBER_STATS_RUNBOOK.md`).

**Auction system is the core domain logic**, concentrated in `lib/auctionEngine.js` (~1,700 lines) with supporting modules:
- `lib/auctionEngine.js` — active rounds, the locked rotation list, lineup/queue ordering, per-item/per-round caps (with member-level overrides), allocation (`buildAllocationRows`), "can't pay" handling, starting/locking/canceling/finishing auctions, and building admin + public auction state (`getAuctionState`). Read `docs/specs/auction-logic-spec.md` before making non-trivial changes here — it's the authoritative spec for round/queue/cap/carry-over semantics (rounds gate on items with `gates_round_completion=true`; bonus items like Puppet Fragment don't gate but are still tracked; the rotation list is locked once per round and only appended-to/removed-from, never reshuffled mid-round; priority members get L&D/T&S first up to hard per-auction limits; leftover inventory beyond caps goes unallocated).
- `lib/auctionSavepoint.js` — capture/restore a full snapshot of round + auction tables (stored as JSON in an `audit_logs` row) so an admin can checkpoint and roll back an in-progress auction.
- `lib/auctionPageSearch.js` — pure helper for paginating/searching the auction queue's per-page member slots (4 items/page, fixed by the game UI).

Two parallel auction types (`type` column) share one algorithm/schema/UI: **GL/WoE** (primary, runs every event) and **League Prize** (optional, only for overflow members who didn't complete their GL/WoE haul; shares caps with GL/WoE within the same round). See `docs/specs/auction-logic-spec.md` for full rules and `docs/specs/auction-design-brief.md` / `docs/specs/deployment-guide.md` for broader design/ops context.

`components/data.js` holds only the static color-group palette (`colorGroups`) — the RO class list/icons themselves live in the admin-editable `job_classes` Supabase table (`lib/jobClasses.js`, `JobClassesContext` in `DashboardApp.jsx`), not in this file.

## Conventions

- Smallest working change; remove duplication before adding abstraction; avoid new dependencies when an existing one covers it.
- Comment the general purpose of core logic, not every line.
- Preserve existing behavior unless the task explicitly asks to change it — this is especially important in `auctionEngine.js`, where round/cap/carry-over rules are exact and spec'd.
- Commits: semantic format `<type>(optional-scope): <summary>` (e.g. `fix: handle missing auction state`).
- `codex/` is local-only scratch space (git-ignored); `.codex/` is shared/committed team config.
