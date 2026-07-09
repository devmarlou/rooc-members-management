import { getAuctionState } from "@/lib/auctionEngine";

const SNAPSHOT_VERSION = 1;
const ROUND_TABLES = ["rounds", "rotation_list", "member_round_progress", "round_item_cap_overrides", "member_cap_overrides"];
const AUCTION_TABLES = ["auctions", "auction_inventory", "auction_queue", "auction_allocations"];
const SNAPSHOT_TABLES = [...ROUND_TABLES, ...AUCTION_TABLES];
const AUCTION_CHILD_TABLES = ["auction_allocations", "auction_queue", "auction_inventory"];

function rows(snapshot, table) {
  return snapshot.tables?.[table]?.rows || [];
}

function chunks(values, size = 100) {
  const output = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

async function selectRows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function selectMaybeSingle(query) {
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

async function upsertRows(supabase, table, tableRows) {
  if (!tableRows.length) return;
  for (const batch of chunks(tableRows)) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict: "id" });
    if (error) throw error;
  }
}

async function deleteMissingById(supabase, table, currentRows, snapshotRows) {
  const keepIds = new Set(snapshotRows.map((row) => row.id));
  const deleteIds = currentRows.map((row) => row.id).filter((id) => !keepIds.has(id));
  for (const batch of chunks(deleteIds)) {
    const { error } = await supabase.from(table).delete().in("id", batch);
    if (error) throw error;
  }
}

function snapshotCounts(snapshot) {
  return Object.fromEntries(SNAPSHOT_TABLES.map((table) => [table, rows(snapshot, table).length]));
}

export async function captureAuctionSavepoint(supabase) {
  const round = await selectMaybeSingle(
    supabase
      .from("rounds")
      .select("*")
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
  );
  if (!round) throw new Error("Create an auction lineup before saving a checkpoint.");

  const [rotation, progress, roundCaps, memberCaps, auctions] = await Promise.all([
    selectRows(supabase.from("rotation_list").select("*").eq("round_id", round.id).order("position", { ascending: true })),
    selectRows(supabase.from("member_round_progress").select("*").eq("round_id", round.id)),
    selectRows(supabase.from("round_item_cap_overrides").select("*").eq("round_id", round.id)),
    selectRows(supabase.from("member_cap_overrides").select("*").eq("round_id", round.id)),
    selectRows(supabase.from("auctions").select("*").eq("round_id", round.id).order("started_at", { ascending: true }))
  ]);

  const auctionIds = auctions.map((auction) => auction.id);
  const [inventory, queue, allocations] = auctionIds.length
    ? await Promise.all([
      selectRows(supabase.from("auction_inventory").select("*").in("auction_id", auctionIds)),
      selectRows(supabase.from("auction_queue").select("*").in("auction_id", auctionIds).order("position", { ascending: true })),
      selectRows(supabase.from("auction_allocations").select("*").in("auction_id", auctionIds))
    ])
    : [[], [], []];

  const snapshot = {
    version: SNAPSHOT_VERSION,
    saved_at: new Date().toISOString(),
    round: { id: round.id, round_number: round.round_number },
    tables: {
      rounds: { rows: [round] },
      rotation_list: { rows: rotation },
      member_round_progress: { rows: progress },
      round_item_cap_overrides: { rows: roundCaps },
      member_cap_overrides: { rows: memberCaps },
      auctions: { rows: auctions },
      auction_inventory: { rows: inventory },
      auction_queue: { rows: queue },
      auction_allocations: { rows: allocations }
    }
  };

  return { snapshot, counts: snapshotCounts(snapshot) };
}

export async function latestAuctionSavepoint(supabase) {
  const savepoint = await selectMaybeSingle(
    supabase
      .from("audit_logs")
      .select("id,created_at,actor_username,metadata")
      .eq("action", "auction.savepoint_saved")
      .order("created_at", { ascending: false })
      .limit(1)
  );
  if (!savepoint?.metadata?.snapshot) return null;

  return {
    id: savepoint.id,
    created_at: savepoint.created_at,
    actor_username: savepoint.actor_username,
    snapshot: savepoint.metadata.snapshot,
    counts: savepoint.metadata.counts || snapshotCounts(savepoint.metadata.snapshot)
  };
}

export async function restoreAuctionSavepoint(supabase, snapshot) {
  if (!snapshot?.round?.id) throw new Error("Saved checkpoint is missing its auction lineup id.");
  if (snapshot.version !== SNAPSHOT_VERSION) throw new Error("Saved checkpoint version is not supported.");

  const roundId = snapshot.round.id;
  const currentAuctions = await selectRows(supabase.from("auctions").select("id").eq("round_id", roundId));
  const currentAuctionIds = currentAuctions.map((row) => row.id);

  for (const table of AUCTION_CHILD_TABLES) {
    const currentRows = currentAuctionIds.length
      ? await selectRows(supabase.from(table).select("id").in("auction_id", currentAuctionIds))
      : [];
    await deleteMissingById(supabase, table, currentRows, rows(snapshot, table));
  }

  await deleteMissingById(supabase, "auctions", currentAuctions, rows(snapshot, "auctions"));

  const [rotation, progress, roundCaps, memberCaps] = await Promise.all([
    selectRows(supabase.from("rotation_list").select("id").eq("round_id", roundId)),
    selectRows(supabase.from("member_round_progress").select("id").eq("round_id", roundId)),
    selectRows(supabase.from("round_item_cap_overrides").select("id").eq("round_id", roundId)),
    selectRows(supabase.from("member_cap_overrides").select("id").eq("round_id", roundId))
  ]);

  await deleteMissingById(supabase, "member_cap_overrides", memberCaps, rows(snapshot, "member_cap_overrides"));
  await deleteMissingById(supabase, "round_item_cap_overrides", roundCaps, rows(snapshot, "round_item_cap_overrides"));
  await deleteMissingById(supabase, "member_round_progress", progress, rows(snapshot, "member_round_progress"));
  await deleteMissingById(supabase, "rotation_list", rotation, rows(snapshot, "rotation_list"));

  for (const table of SNAPSHOT_TABLES) {
    await upsertRows(supabase, table, rows(snapshot, table));
  }

  return getAuctionState(supabase);
}
