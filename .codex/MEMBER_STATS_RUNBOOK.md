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
