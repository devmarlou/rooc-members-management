# POV List — implementation plan

## Confirmed product decisions

- Each entry has exactly three member-supplied fields: **link**, **title**, and
  **date** (date-only, no time — the date the POV was recorded, not submitted-at).
- Only the **latest 2 entries per member** are kept in the database, same retention
  rule as `member_stats` (see `lib/memberStatsRetention.js`) — the DB itself has no
  archive, by design (80 members x 2 rows = 160 rows max, keeps the live page fast).
- Full history is **not** dropped, though — every submission is also appended to an
  **external Google Sheet**, unbounded, so nothing is ever truly lost even after the
  DB trims it off the live page. The Sheet is the archive; the DB is the live cache.
- A dedicated "POV List" page, not part of the Account page. Any logged-in member
  (not just admins) sees everyone's latest entries there and can submit their own.
- A public opt-in board mirrors `/public-stats`: opt-in per member, visible to
  anonymous visitors only for members who've opted in.

## Data model

New table, manual Supabase setup (see `.codex/MEMBER_STATS_RUNBOOK.md` for the
block-by-block pattern to follow):

```sql
CREATE TABLE member_pov_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  title         TEXT NOT NULL CHECK (btrim(title) <> ''),
  link          TEXT NOT NULL CHECK (btrim(link) <> ''),
  recorded_date DATE NOT NULL,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX member_pov_links_member_id_submitted_at_idx
  ON member_pov_links (member_id, submitted_at DESC);

ALTER TABLE member_pov_links DISABLE ROW LEVEL SECURITY;
```

Also add, same opt-in pattern as `members.show_stats_publicly`
(`.codex/PUBLIC_STATS_RUNBOOK.md`):

```sql
ALTER TABLE members
  ADD COLUMN show_pov_publicly BOOLEAN NOT NULL DEFAULT false;
```

Retention: generalize `lib/memberStatsRetention.js` into a reusable helper (e.g.
`lib/retention.js`'s `enforceLatestNRows(supabase, { table, memberId, keep: 2 })`)
instead of copy-pasting the same trim-to-N-rows logic for a second table — call it
right after every `member_pov_links` insert, same as the stats route does today.

## Google Sheets archive (full history)

New scope, since the DB intentionally only keeps 2 rows per member:

- New dependency: `googleapis` (Google's own maintained client). No existing
  dependency covers this, so a new one is genuinely justified here even though
  the general convention is to reuse before adding.
- New service-account credentials as env vars, never committed (same handling as
  `SUPABASE_SERVICE_ROLE_KEY`): e.g. `GOOGLE_SHEETS_CLIENT_EMAIL`,
  `GOOGLE_SHEETS_PRIVATE_KEY`, `GOOGLE_SHEETS_SPREADSHEET_ID`.
- New setup runbook needed (same shape as `.codex/DISCORD_AUTH_SETUP_RUNBOOK.md`):
  create a Google Cloud project, enable the Sheets API, create a service account +
  JSON key, share the target Sheet with the service account's email as an editor,
  add a header row (member, title, link, date, submitted at).
- New `lib/googleSheets.js` — a small helper, e.g. `appendPovLinkRow(row)`, calling
  `spreadsheets.values.append` with the service-account credentials.
- Called as a **best-effort, deferred** follow-up in the POST route right after the
  DB insert + retention trim, using the same `after()` pattern already used for the
  best-effort stats-insert/audit-log follow-up in
  `app/api/auth/register/route.js`. A Sheets failure must log loudly but never
  fail or block the member's submission response.

## API routes

Mirror the existing member-stats route shapes:

- `app/api/pov-links/route.js` — GET (everyone's latest entry, for the shared list
  page) + POST (self-service submit for the caller's own member row via
  `requireAuth`, not `requireAdmin` — every role can see and use this page). Runs
  the retention helper, then the Google Sheets append, after insert.
- `app/api/pov-links/board/route.js` + `app/api/pov-links/board/[memberId]/route.js`
  — public opt-in variant, mirrors `app/api/member-stats/board/route.js` and
  `app/api/member-stats/board/[memberId]/route.js`, gated on `show_pov_publicly`.
- `app/api/account/route.js` PATCH — extend with a `showPovPublicly` toggle
  alongside the existing `showStatsPublicly` one (same independent-optional-field
  pattern already used there).

## Validation

Extend `lib/validation.js` (and reuse what already exists):

- `link` — reuse the scheme-sanitizing fix already in `ensureAbsoluteUrl`
  (`lib/memberStats.js`, only accepts http(s):// as a pre-existing scheme). Worth
  extracting into a shared `lib/urls.js` so both `member_stats` and
  `member_pov_links` import the same function instead of a second copy.
- `title` — new validator, short text, e.g. 1-80 chars, same control-character
  check as `validateCharName`.
- `recorded_date` — required, must parse as a valid calendar date (a plain
  `<input type="date">` gives `YYYY-MM-DD`), stored as `DATE`.

## UI

- New page `app/pov-list/page.js` -> `<DashboardApp povListView adminPage="pov-list" />`
  (same thin-page pattern as every other route). Add to `AdminSidebar`, reachable by
  every authenticated role — `checkSession`'s role-based routing in
  `components/DashboardApp.jsx` currently sends the `member` role to `/account` for
  every admin page except `accountView`/`publicStatsView`/`auditLogView`; `pov-list`
  needs to join that allow-list.
- Page body: a table (link/title/date columns, same `roster-table` pattern used by
  the member-stats admin view) listing every member's latest entry, plus a small
  submit form for the caller's own new entry (title, link, date-picker).
- Public opt-in board: same `publicStatsView`-prop pattern as `/public-stats`, e.g.
  a `/public-pov` route or a second tab on the existing public page — gated on
  `show_pov_publicly`, same shape as `PublicStatsBoardScreen`.
- New `formatDateOnly(value)` display helper (MM-DD-YYYY). The existing
  `formatStatsTimestamp` includes a time component, not reusable as-is.

## Open questions to resolve before building

- Exact route slug/nav label wording for the new page.
- Whether a member can edit/delete their own entries directly, or only ever add
  new ones (letting the 2-latest retention naturally roll old ones off).
- Whether an admin can delete/moderate another member's POV entry.

## Delivery order

1. Manual Supabase setup: `member_pov_links` table + `members.show_pov_publicly`
   column (two small runbook blocks).
2. Google Cloud setup (new runbook): service account, Sheets API enabled, sheet
   shared with the service account, header row created, env vars added.
3. `lib/urls.js` extraction + `lib/validation.js` additions (title, date) +
   `lib/googleSheets.js`.
4. API routes: self-service list+submit (DB insert + retention + Sheets append),
   public board, account PATCH toggle.
5. UI: POV List page, sidebar entry, public board screen.
6. Retention: generalize `lib/memberStatsRetention.js` or add its POV-links twin.
7. Verify: submit a 3rd link as a member and confirm the oldest of the previous
   two is gone from the live page but every submission (including that dropped
   one) is present in the Google Sheet; confirm any logged-in member (not just
   admins) sees the shared list; confirm the public board only shows opted-in
   members; confirm a Sheets API failure (e.g. bad credentials) still lets the
   submission succeed; `npm run build` + `npm run lint`.
