alter table members
add column if not exists auction_priority_override boolean not null default false;

create index if not exists members_auction_priority_override_idx on members(auction_priority_override);
