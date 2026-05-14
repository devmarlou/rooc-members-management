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
  joined_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  ('puppet_fragment', 'Puppet Fragment', 'Fragment', 2, 5, array['league_prize'], false),
  ('feather_ld', 'Feather of L&D', 'L&D', 3, 5, array['gl_woe', 'league_prize'], true),
  ('feather_ts', 'Feather of T&S', 'T&S', 4, 5, array['gl_woe', 'league_prize'], true)
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
  status text not null check (status in ('active', 'done')),
  started_at timestamptz not null default now(),
  done_at timestamptz
);

create unique index if not exists one_active_auction_idx
on auctions((status))
where status = 'active';

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
