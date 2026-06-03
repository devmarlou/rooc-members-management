import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(filePath = ".env.local") {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] ||= value;
  }
}

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

async function deleteMissingById(supabase, table, existingRows, snapshotRows) {
  const keepIds = new Set(snapshotRows.map((row) => row.id));
  const deleteIds = existingRows.map((row) => row.id).filter((id) => !keepIds.has(id));
  if (!deleteIds.length) return;
  for (const batch of chunks(deleteIds)) {
    const { error } = await supabase.from(table).delete().in("id", batch);
    if (error) throw error;
  }
}

async function upsertRows(supabase, table, tableRows) {
  if (!tableRows.length) return;
  for (const batch of chunks(tableRows, 100)) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict: "id" });
    if (error) throw error;
  }
}

async function main() {
  const snapshotPath = process.argv[2];
  if (!snapshotPath) throw new Error("Usage: node scripts/restore-auction-snapshot.mjs /path/to/snapshot.json");
  loadEnv();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error("Supabase is not configured.");

  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  const roundId = snapshot.round?.id;
  if (!roundId) throw new Error("Snapshot is missing round.id.");

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const currentAuctions = await supabase.from("auctions").select("id").eq("round_id", roundId);
  if (currentAuctions.error) throw currentAuctions.error;
  const currentAuctionIds = (currentAuctions.data || []).map((row) => row.id);

  for (const table of ["auction_allocations", "auction_queue", "auction_inventory"]) {
    const current = currentAuctionIds.length
      ? await supabase.from(table).select("id").in("auction_id", currentAuctionIds)
      : { data: [], error: null };
    if (current.error) throw current.error;
    await deleteMissingById(supabase, table, current.data || [], rows(snapshot, table));
  }

  await deleteMissingById(supabase, "auctions", currentAuctions.data || [], rows(snapshot, "auctions"));

  for (const table of ["rounds", "rotation_list", "member_round_progress", "round_item_cap_overrides", "member_cap_overrides", "auctions", "auction_inventory", "auction_queue", "auction_allocations"]) {
    await upsertRows(supabase, table, rows(snapshot, table));
  }

  console.log(`Restored auction snapshot for round ${snapshot.round.round_number || roundId}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
