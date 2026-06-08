alter table members
add column if not exists party_slot int check (party_slot is null or (party_slot between 1 and 5));

create index if not exists members_group_slot_idx on members(group_id, party_slot);
