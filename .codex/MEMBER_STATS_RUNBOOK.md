# Member stats — manual setup runbook

Run this against the **live shared Supabase project** — there's no local/staging DB. Go one block
at a time in the Supabase SQL Editor and check for errors before moving to the next block. This is
purely additive — one new table, nothing existing is touched.

## Block 1 — create `member_stats`

```sql
CREATE TABLE member_stats (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id                   UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,

  -- snapshot of members.char_class at submission time, not independently editable
  class                       TEXT NOT NULL,

  -- member-selected build type — not derivable from class alone (e.g. a "battle"
  -- Professor build is physical even though the class is usually played as magic)
  damage_type                 TEXT NOT NULL CHECK (damage_type IN ('physical', 'magic')),

  -- core, member-supplied, required
  hp                          INT NOT NULL,
  patk_matk                   INT NOT NULL,
  pdef                        INT NOT NULL,
  mdef                        INT NOT NULL,
  equipment_pdef              INT NOT NULL,
  equipment_mdef              INT NOT NULL,
  equipment_pdef_pct          NUMERIC NOT NULL,
  equipment_mdef_pct          NUMERIC NOT NULL,

  -- server-computed from the two equipment pairs above, never trusted from the client
  effective_pdef              NUMERIC NOT NULL,
  effective_mdef              NUMERIC NOT NULL,

  -- optional/nullable, independently member-supplied, no cross-validation
  pdmg_mdmg                   NUMERIC,
  pdmg_reduction               NUMERIC,
  mdmg_reduction               NUMERIC,
  ignore_pdef                  NUMERIC,
  ignore_mdef                  NUMERIC,
  healing_done                 NUMERIC,
  healing_taken                NUMERIC,
  pvp_dmg_bonus                NUMERIC,
  pvp_dmg_reduction            NUMERIC,
  crit                         NUMERIC,
  crit_dmg                     NUMERIC,
  crit_res                     NUMERIC,
  crit_dmg_res                 NUMERIC,
  dmg_vs_small                 NUMERIC,
  dmg_reduction_vs_small       NUMERIC,
  dmg_vs_medium                NUMERIC,
  dmg_reduction_vs_medium      NUMERIC,
  dmg_vs_large                 NUMERIC,
  dmg_reduction_vs_large       NUMERIC,
  dmg_vs_brute                 NUMERIC,
  dmg_reduction_vs_brute       NUMERIC,
  dmg_vs_demi_human            NUMERIC,
  dmg_reduction_vs_demi_human  NUMERIC,

  video_link                   TEXT NOT NULL CHECK (btrim(video_link) <> ''),

  submitted_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX member_stats_member_id_submitted_at_idx
  ON member_stats (member_id, submitted_at DESC);

ALTER TABLE member_stats DISABLE ROW LEVEL SECURITY;
```
(RLS disabled to match every other table in this project — auth is enforced entirely at the app
layer via the service-role client, see `docs/specs/deployment-guide.md`.)

Only the latest 2 submissions per member are ever kept — the app deletes the oldest row itself
right after a 3rd insert (`lib/memberStatsRetention.js`), so there's no retention logic in the
database itself and nothing further to run here.

## After running this block

- Confirm the table exists in Table Editor with zero rows.
- No seed data needed — this table only ever fills in from real member submissions.
- Manual verification (see the approved plan): log in as a `member`-role account, submit stats via
  the Account page, confirm the row lands with `effective_pdef`/`effective_mdef` computed correctly;
  submit a 3rd time and confirm the oldest of the previous two rows is gone.

## Migration — add `damage_type` (run only if `member_stats` already exists without it)

If you ran Block 1 before this column was added to the schema above, run this once against the live
project instead of recreating the table. Confirmed safe to run as `NOT NULL` directly — the table has
zero rows in production as of this writing, so there's no existing data to backfill.

```sql
ALTER TABLE member_stats
  ADD COLUMN damage_type TEXT NOT NULL CHECK (damage_type IN ('physical', 'magic'));
```

If the table already has rows by the time you run this, drop the inline `NOT NULL`, backfill
`damage_type` for existing rows first, then add the `NOT NULL` constraint as a follow-up
`ALTER TABLE member_stats ALTER COLUMN damage_type SET NOT NULL;`.

## Migration — race matchups trimmed to reduction vs Medium / Demi-Human

No SQL needed. The app stopped collecting and reading `dmg_vs_small`, `dmg_vs_medium`,
`dmg_vs_large`, `dmg_vs_brute`, `dmg_vs_demi_human`, `dmg_reduction_vs_small`,
`dmg_reduction_vs_large` and `dmg_reduction_vs_brute`. The columns are left in place (nullable) so
older rows aren't touched. Drop them later only if you're sure nothing else reads them.

## Block 2 — create `stat_baselines` (Base Stats admin page)

```sql
CREATE TABLE stat_baselines (
  -- a member_stats column name, e.g. 'effective_pdef' (validated app-side
  -- against STAT_BASELINE_KEYS in lib/memberStats.js)
  stat_key    TEXT PRIMARY KEY,
  -- 0 = no base for this stat (never flagged)
  base_value  NUMERIC NOT NULL DEFAULT 0 CHECK (base_value >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE stat_baselines DISABLE ROW LEVEL SECURITY;
```

No seed rows needed: a missing row is treated the same as 0. Until this block is run, the app reads
every base as 0 and saving on the Base Stats page returns a clear error.

## Migration — add `compare` to `stat_baselines` (Compare checkbox on Base Stats)

Run after Block 2. Adds the per-stat Compare toggle (OLD vs UPDATED up/down arrows) and ticks the
10 stats that were hardcoded before, so nothing changes visually until an admin edits it.

```sql
ALTER TABLE stat_baselines
  ADD COLUMN compare BOOLEAN NOT NULL DEFAULT false;

INSERT INTO stat_baselines (stat_key, base_value, compare)
VALUES
  ('pdef', 0, true), ('mdef', 0, true),
  ('equipment_pdef', 0, true), ('equipment_mdef', 0, true),
  ('equipment_pdef_pct', 0, true), ('equipment_mdef_pct', 0, true),
  ('effective_pdef', 0, true), ('effective_mdef', 0, true),
  ('pdmg_reduction', 0, true), ('mdmg_reduction', 0, true)
ON CONFLICT (stat_key) DO UPDATE SET compare = true;
```

Until this runs, the app uses those same 10 stats as the default and saving on Base Stats returns a
clear error.
