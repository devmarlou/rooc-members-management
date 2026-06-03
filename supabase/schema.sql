-- ENCORE Guild Admin Dashboard schema
-- Run this in Supabase SQL Editor before deploying the app.

create extension if not exists pgcrypto;

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  char_name text not null unique,
  char_class text not null,
  group_id uuid references groups(id) on delete set null,
  joined_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table members
alter column joined_at type timestamptz
using joined_at::timestamptz;

create index if not exists members_group_id_idx on members(group_id);
create index if not exists members_char_class_idx on members(char_class);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists members_set_updated_at on members;
create trigger members_set_updated_at
before update on members
for each row execute function set_updated_at();

create table if not exists auction_items (
  id uuid primary key default gen_random_uuid(),
  item_key text not null unique,
  name text not null unique,
  short_name text not null,
  sort_order int not null unique,
  default_per_round_cap int not null check (default_per_round_cap >= 0),
  applies_to_auction_types text[] not null default array['gl_woe'],
  gates_round_completion boolean not null default true,
  created_at timestamptz not null default now()
);

insert into auction_items
  (item_key, name, short_name, sort_order, default_per_round_cap, applies_to_auction_types, gates_round_completion)
values
  ('puppet_card', 'Puppet Card', 'Puppet', 1, 1, array['gl_woe', 'league_prize'], true),
  ('puppet_fragment', 'Illusion Fragment', 'Fragment', 2, 0, array['league_prize'], false),
  ('feather_ld', 'Light & Dark', 'L&D', 3, 8, array['gl_woe', 'league_prize'], true),
  ('feather_ts', 'Time & Space', 'T&S', 4, 8, array['gl_woe', 'league_prize'], true)
on conflict (item_key) do update set
  name = excluded.name,
  short_name = excluded.short_name,
  sort_order = excluded.sort_order,
  default_per_round_cap = excluded.default_per_round_cap,
  applies_to_auction_types = excluded.applies_to_auction_types,
  gates_round_completion = excluded.gates_round_completion;

create table if not exists rounds (
  id uuid primary key default gen_random_uuid(),
  round_number int not null unique,
  status text not null check (status in ('active', 'completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists one_active_round_idx
on rounds((status))
where status = 'active';

create table if not exists rotation_list (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  position int not null,
  created_at timestamptz not null default now(),
  unique (round_id, member_id),
  unique (round_id, position)
);

create table if not exists member_round_progress (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  received jsonb not null default '{}'::jsonb,
  is_complete boolean not null default false,
  completed_at timestamptz,
  unique (round_id, member_id)
);

create table if not exists member_cap_overrides (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  item_id uuid not null references auction_items(id) on delete cascade,
  cap int not null check (cap >= 0),
  unique (round_id, member_id, item_id)
);

create table if not exists round_item_cap_overrides (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  item_id uuid not null references auction_items(id) on delete cascade,
  cap int not null check (cap >= 0),
  updated_at timestamptz not null default now(),
  unique (round_id, item_id)
);

drop trigger if exists round_item_cap_overrides_set_updated_at on round_item_cap_overrides;
create trigger round_item_cap_overrides_set_updated_at
before update on round_item_cap_overrides
for each row execute function set_updated_at();

create table if not exists auctions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  type text not null check (type in ('gl_woe', 'league_prize')),
  name text,
  status text not null check (status in ('active', 'locked', 'done')),
  started_at timestamptz not null default now(),
  done_at timestamptz
);

alter table auctions drop constraint if exists auctions_status_check;
alter table auctions add constraint auctions_status_check check (status in ('active', 'locked', 'done'));

drop index if exists one_active_auction_idx;

create unique index if not exists one_open_auction_per_type_idx
on auctions(type)
where status in ('active', 'locked');

create table if not exists auction_inventory (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references auctions(id) on delete cascade,
  item_id uuid not null references auction_items(id) on delete cascade,
  quantity int not null check (quantity >= 0),
  unique (auction_id, item_id)
);

create table if not exists auction_queue (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references auctions(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  position int not null,
  is_carry_over boolean not null default false,
  status text not null default 'assigned' check (status in ('assigned', 'cant_pay')),
  removed_at timestamptz,
  unique (auction_id, member_id),
  unique (auction_id, position)
);

create table if not exists auction_allocations (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references auctions(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  item_id uuid not null references auction_items(id) on delete cascade,
  quantity int not null check (quantity >= 0),
  page_assignments jsonb not null default '[]'::jsonb,
  fulfilled boolean not null default true
);

create or replace function finish_auction_tx(p_auction_id uuid, p_updates jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction auctions%rowtype;
  v_update jsonb;
  v_updated_count int := 0;
  v_expected_count int := coalesce(jsonb_array_length(p_updates), 0);
begin
  if p_auction_id is null then
    raise exception 'Auction id is required.';
  end if;

  if p_updates is null or jsonb_typeof(p_updates) <> 'array' or v_expected_count = 0 then
    raise exception 'Finalize updates are required.';
  end if;

  select *
    into v_auction
    from auctions
    where id = p_auction_id
      and status in ('active', 'locked')
    for update;

  if not found then
    raise exception 'There is no open auction to finalize.';
  end if;

  for v_update in select * from jsonb_array_elements(p_updates)
  loop
    update member_round_progress
       set received = v_update->'received',
           is_complete = coalesce((v_update->>'is_complete')::boolean, false),
           completed_at = case
             when coalesce((v_update->>'is_complete')::boolean, false)
               then nullif(v_update->>'completed_at', '')::timestamptz
             else null
           end
     where id = (v_update->>'id')::uuid
       and round_id = v_auction.round_id;

    if not found then
      raise exception 'Finalize update references a missing progress row: %', v_update->>'id';
    end if;

    v_updated_count := v_updated_count + 1;
  end loop;

  if v_updated_count <> v_expected_count then
    raise exception 'Finalize update count mismatch.';
  end if;

  update auctions
     set status = 'done',
         done_at = now()
   where id = v_auction.id
     and status in ('active', 'locked');

  if not found then
    raise exception 'Auction changed before finalize could complete.';
  end if;

  return jsonb_build_object(
    'auction_id', v_auction.id,
    'round_id', v_auction.round_id,
    'updated_progress_rows', v_updated_count,
    'status', 'done'
  );
end;
$$;

create table if not exists dashboard_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null default 'dashboard_update',
  created_at timestamptz not null default now()
);

alter table dashboard_events enable row level security;

drop policy if exists "Public can listen to dashboard events" on dashboard_events;
create policy "Public can listen to dashboard events"
on dashboard_events
for select
using (true);

do $$
begin
  alter publication supabase_realtime add table public.dashboard_events;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

insert into groups (name, sort_order)
values
  ('Alpha 1', 10),
  ('Bravo 1', 20),
  ('Charlie 1', 30),
  ('Delta 1', 40)
on conflict (name) do nothing;

-- Security: the browser never talks to these tables directly.
-- The Next.js API uses the server-only Supabase service role key, which bypasses RLS.
-- With RLS enabled and no public policies, leaked anon/publishable keys cannot read or write dashboard data.
alter table groups enable row level security;
alter table members enable row level security;
alter table auction_items enable row level security;
alter table rounds enable row level security;
alter table rotation_list enable row level security;
alter table member_round_progress enable row level security;
alter table member_cap_overrides enable row level security;
alter table round_item_cap_overrides enable row level security;
alter table auctions enable row level security;
alter table auction_inventory enable row level security;
alter table auction_queue enable row level security;
alter table auction_allocations enable row level security;
alter table dashboard_events enable row level security;
