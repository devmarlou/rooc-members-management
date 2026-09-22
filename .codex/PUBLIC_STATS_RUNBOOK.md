# Public stats board — manual setup runbook

> **Superseded.** The opt-in was removed: stats are now public to every signed-in account, and
> nothing in the app reads or writes `members.show_stats_publicly` any more. Block 1 below is kept
> only as a record of what was applied to the live DB. The column itself is left in place (harmless,
> defaults to `false`); drop it only as a deliberate, separately confirmed cleanup.

Run this against the **live shared Supabase project** — there's no local/staging DB. Purely
additive: one new column on `members`, nothing existing is touched or backfilled with anything
other than a default.

## Block 1 — add `show_stats_publicly` to `members` (historical, no longer used)

```sql
ALTER TABLE members
  ADD COLUMN show_stats_publicly BOOLEAN NOT NULL DEFAULT false;
```

Safe to run directly as `NOT NULL DEFAULT false` regardless of existing row count.

No index needed — the roster is capped at `GUILD_MEMBER_LIMIT` (80) rows, well within a sequential
scan's comfort zone (matches the already-unindexed `account_id`/`group_id` filters elsewhere on
this table).

## Current behaviour to verify

- Log in as a `member`-role account and open `/public-stats`: the board lists every member who has
  submitted stats, with no opt-in step anywhere on the Account page.
- A member who has never submitted stats does *not* appear as a blank row on the board.
- `GET /api/member-stats/board/<member id>` returns that member's history for any signed-in
  account, and 404s only when the member id doesn't exist.
