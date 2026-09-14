# Auction table indexes — manual setup runbook

Run this against the **live shared Supabase project** — there's no local/staging DB. Purely
additive (`CREATE INDEX IF NOT EXISTS`) — nothing existing is touched, no data changes, and this is
safe to run while the dashboard is in use.

## Why

`lib/auctionEngine.js` filters the `auctions` table by `round_id` + `status` on nearly every call —
finding the open auction(s) for the active round (`getAuctionState`, `selectOpenAuction`), fetching
the round's `done` history, and the finish/lock/cancel paths. None of the tables in
`docs/specs/deployment-guide.md` or `.codex/MEMBER_STATS_RUNBOOK.md` define an index on `auctions`,
so every one of those lookups is currently a full table scan. The table stays small (bounded by
rounds × 2 auction types), so this won't be a dramatic win on its own, but it's a free, zero-risk
piece of the wider performance pass and removes one more source of per-click latency.

## Block 1 — index `auctions(round_id, status)`

```sql
CREATE INDEX IF NOT EXISTS auctions_round_id_status_idx
  ON auctions (round_id, status);
```

Covers every `.eq("round_id", ...).in("status", ...)` / `.eq("round_id", ...).eq("status", "done")`
query in `auctionEngine.js` (`getAuctionState`'s open-auctions and history selects, `selectOpenAuction`).

## After running this block

- Confirm the index exists: Table Editor → `auctions` → Indexes tab, or
  `SELECT indexname FROM pg_indexes WHERE tablename = 'auctions';` in the SQL editor.
- No further verification needed — indexes don't change query results, only lookup speed. The
  broader manual test pass in the performance-optimization plan (start/lock/cancel/finish auctions)
  covers this implicitly.
