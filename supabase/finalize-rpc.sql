-- Run this once in the Supabase SQL Editor to enable atomic auction finalization.

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
