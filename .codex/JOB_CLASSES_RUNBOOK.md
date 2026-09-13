# Job classes — manual setup runbook

Run this against the **live shared Supabase project** — there's no local/staging DB. Go one block
at a time in the Supabase SQL Editor (and the Storage dashboard for Block 2) and check for errors
before moving on. This replaces the static class list in `components/data.js` with an admin-editable
table — nothing existing is deleted; `members.char_class` stays a plain string, just now expected to
match a `job_classes.name`.

## Block 1 — create `job_classes`

```sql
CREATE TABLE job_classes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL UNIQUE,
  short_label  TEXT NOT NULL,
  color_group  TEXT NOT NULL DEFAULT 'gray'
               CHECK (color_group IN ('red','blue','emerald','yellow','purple','orange','pink','gray')),
  icon_url     TEXT,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE job_classes DISABLE ROW LEVEL SECURITY;
```
(RLS disabled to match every other table in this project — auth is enforced entirely at the app
layer via the service-role client.)

## Block 2 — Storage bucket for icons

In the Supabase dashboard: **Storage → New bucket**.
- Name: `job-class-icons`
- **Public bucket: ON** (this auto-creates the public-read policy — no manual RLS policy needed).
  All writes only ever happen through the app's service-role client, which bypasses Storage RLS
  entirely, so no write policy is needed either.

Equivalent SQL if you'd rather script it instead of using the dashboard toggle:
```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('job-class-icons', 'job-class-icons', true);
```

## Block 3 — rename-cascade RPC

A rename must update every `members.char_class` that matches the old name in the same operation
(so the roster never ends up with an orphaned class string) — this needs to be atomic, so it's a
function rather than two separate calls from the app:

```sql
CREATE OR REPLACE FUNCTION update_job_class(
  p_id UUID,
  p_name TEXT DEFAULT NULL,
  p_short_label TEXT DEFAULT NULL,
  p_color_group TEXT DEFAULT NULL,
  p_icon_url TEXT DEFAULT NULL,
  p_clear_icon BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_before job_classes%ROWTYPE;
  v_after job_classes%ROWTYPE;
  v_members_updated INT := 0;
BEGIN
  SELECT * INTO v_before FROM job_classes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'job_class_not_found';
  END IF;

  UPDATE job_classes SET
    name = COALESCE(p_name, name),
    short_label = COALESCE(p_short_label, short_label),
    color_group = COALESCE(p_color_group, color_group),
    icon_url = CASE WHEN p_clear_icon THEN NULL ELSE COALESCE(p_icon_url, icon_url) END
  WHERE id = p_id
  RETURNING * INTO v_after;

  IF p_name IS NOT NULL AND p_name IS DISTINCT FROM v_before.name THEN
    UPDATE members SET char_class = p_name WHERE char_class = v_before.name;
    GET DIAGNOSTICS v_members_updated = ROW_COUNT;
  END IF;

  RETURN json_build_object(
    'before', to_jsonb(v_before),
    'after', to_jsonb(v_after),
    'membersUpdated', v_members_updated
  );
END;
$$;
```
Called via `.rpc("update_job_class", {...})` from `app/api/job-classes/[id]/route.js` — it safely
no-ops the cascade whenever `p_name` is null/unchanged, so the route always calls it the same way
regardless of whether a rename is actually happening.

## Block 4 — seed data

Every existing entry from `components/data.js`'s `classes` array, minus `Dancer`, unchanged, plus a
new `Gypsy` entry (no icon yet — upload one through the new admin UI after this runs). `Bard` carries
over completely as-is.

```sql
INSERT INTO job_classes (name, short_label, color_group, icon_url, sort_order) VALUES
  ('Lord Knight',     'LK',      'red',     '/icons/lord-knight.png',     10),
  ('Paladin',         'Pal',     'red',     '/icons/paladin.png',         20),
  ('High Wizard',     'HW',      'blue',    '/icons/high-wizard.png',     30),
  ('Professor',       'Prof',    'blue',    '/icons/professor.png',       40),
  ('High Priest',     'HP',      'emerald', '/icons/high-priest.png',     50),
  ('Champion',        'Champ',   'emerald', '/icons/champion.png',        60),
  ('Sniper',          'Sn',      'yellow',  '/icons/sniper.png',          70),
  ('Bard',            'Bard',    'yellow',  '/icons/bard.png',            80),
  ('Gypsy',           'Gyp',     'yellow',  NULL,                         90),
  ('Assassin Cross',  'SinX',    'purple',  '/icons/assassin-cross.png', 100),
  ('Stalker',         'Stk',     'purple',  '/icons/stalker.png',        110),
  ('Whitesmith',      'WS',      'orange',  '/icons/whitesmith.png',     120),
  ('Biochemist',      'BC',      'orange',  '/icons/biochemist.png',     130),
  ('Doram',           'Dor',     'pink',    '/icons/doram.png',          140),
  ('Unknown',         'Unknown', 'gray',    NULL,                        150);
```

No migration of existing `members.char_class = 'Dancer'` rows is included here — if any member is
currently on Dancer, reassign them to a real class from the roster after this runs (the app can't
guess which one you want).

## After all four blocks

- Confirm `job_classes` has 15 rows, `job-class-icons` bucket exists and is public.
- Manual verification (see the approved plan): add a class with an icon upload, confirm it shows up
  in the Discord-registration dropdown / Master List filter / member-edit class picker. Rename a
  class in use by a test member and confirm their `char_class` cascaded. Try deleting a class that's
  still in use (should be blocked with an accurate count) and one with zero members (should succeed).
