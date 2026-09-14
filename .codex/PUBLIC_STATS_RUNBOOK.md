# Public stats board — manual setup runbook

Run this against the **live shared Supabase project** — there's no local/staging DB. Purely
additive: one new column on `members`, nothing existing is touched or backfilled with anything
other than a default.

## Block 1 — add `show_stats_publicly` to `members`

```sql
ALTER TABLE members
  ADD COLUMN show_stats_publicly BOOLEAN NOT NULL DEFAULT false;
```

Safe to run directly as `NOT NULL DEFAULT false` regardless of existing row count — every current
member defaults to opted-out, which is the correct starting state (nobody's stats become visible
to anyone until they explicitly opt in from their own Account page).

No index needed — `member-stats/board` filters `members` by this column but the roster is capped
at `GUILD_MEMBER_LIMIT` (80) rows, well within a sequential scan's comfort zone (matches the
already-unindexed `account_id`/`group_id` filters elsewhere on this table).

## After running this block

- Confirm the column exists in Table Editor, `false` for every existing row.
- Manual verification (see the approved plan): log in as a `member`-role account, open the Account
  page, check "Show in Public Stats board," confirm the account then appears at `/public-stats`
  with its latest submitted stats. Uncheck it and confirm it disappears again. Log in as a second
  account that has never submitted stats and confirm opting in alone (no submission yet) does *not*
  add a blank row to the board.
- Confirm an account that hasn't opted in returns 404 from `GET /api/member-stats/board/<their id>`
  even when called directly (not just hidden from the list UI).
