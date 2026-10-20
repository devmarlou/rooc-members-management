// One-off: align Puppet Card current-cycle counts with the plain list-walk
// rule after the 2026-10-20 auction was finalized by the older engine.
// Every member who received a card since the last cycle reset (the 2026-10-15
// auction) is marked 1/1; the members still waiting in this cycle are 0/1.
// Dry run by default; pass --apply to write.
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ITEM_KEY = "puppet_card";
const CYCLE_START = "2026-10-15T13:00:00Z";
const apply = process.argv.includes("--apply");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[trimmed.slice(0, eq).trim()] ||= value;
  }
}

loadEnv(path.join(process.cwd(), ".env.local"));
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: round, error: roundError } = await supabase.from("rounds").select("id,round_number").eq("status", "active").limit(1).maybeSingle();
if (roundError) throw roundError;
if (!round) throw new Error("No active round found.");

const [members, items, progress, rotation, auctions] = await Promise.all([
  supabase.from("members").select("id,char_name"),
  supabase.from("auction_items").select("id,item_key"),
  supabase.from("member_round_progress").select("id,member_id,received").eq("round_id", round.id),
  supabase.from("rotation_list").select("member_id,position").eq("round_id", round.id),
  supabase.from("auctions").select("id,name,started_at,auction_allocations(member_id,item_id,quantity,fulfilled,page_assignments)").eq("round_id", round.id).eq("status", "done").gte("started_at", CYCLE_START)
]);
for (const result of [members, items, progress, rotation, auctions]) if (result.error) throw result.error;

const item = items.data.find((row) => row.item_key === ITEM_KEY);
if (!item) throw new Error(`Item ${ITEM_KEY} not found.`);
const nameById = new Map(members.data.map((member) => [member.id, member.char_name]));
const positionByMemberId = new Map(rotation.data.map((row) => [row.member_id, row.position]));

// The 10-15 auction reset the cycle mid-auction; only its post-reset cards
// (recorded with a higher item_cycle) belong to the current cycle, plus every
// card handed out in the auctions after it. Rotation positions have changed
// since, so this keys on the stored cycle number, not on position.
const servedThisCycle = new Set();
for (const auction of auctions.data) {
  const isResetAuction = auction.name.startsWith("GL-10-15");
  for (const allocation of auction.auction_allocations || []) {
    if (allocation.item_id !== item.id || allocation.fulfilled === false || !(allocation.quantity > 0)) continue;
    const cycles = (allocation.page_assignments || []).map((assignment) => Number(assignment.item_cycle || 0));
    if (isResetAuction && !cycles.some((cycle) => cycle > 0)) continue;
    servedThisCycle.add(allocation.member_id);
  }
}

// Admin decision: porkchop69 keeps his current-cycle card (moved to the
// priority block; his next card comes with the next cycle).
for (const member of members.data) if (member.char_name === "porkchop69") servedThisCycle.add(member.id);

const updates = [];
for (const row of progress.data) {
  const received = row.received && typeof row.received === "object" ? row.received : {};
  const before = Number(received[ITEM_KEY] || 0);
  const after = servedThisCycle.has(row.member_id) ? 1 : 0;
  if (before === after) continue;
  updates.push({
    id: row.id,
    name: nameById.get(row.member_id) || row.member_id,
    position: positionByMemberId.get(row.member_id) || null,
    before,
    after,
    received: { ...received, [ITEM_KEY]: after }
  });
}
updates.sort((a, b) => (a.position || 999) - (b.position || 999));

console.log(`Round ${round.round_number}: ${servedThisCycle.size} members hold a card this cycle; ${updates.length} of ${progress.data.length} rows change.`);
for (const update of updates) {
  console.log(`  pos ${String(update.position ?? "-").padStart(3)} ${update.name.padEnd(16)} current ${update.before} -> ${update.after}`);
}
const waiting = progress.data.filter((row) => !servedThisCycle.has(row.member_id)).map((row) => `${positionByMemberId.get(row.member_id)}:${nameById.get(row.member_id)}`).sort();
console.log("Still waiting this cycle:", waiting.join(", "));

if (!apply) {
  console.log("Dry run. Re-run with --apply to write these changes.");
  process.exit(0);
}
for (const update of updates) {
  const { error } = await supabase.from("member_round_progress").update({ received: update.received }).eq("id", update.id);
  if (error) throw error;
}
console.log(`Updated ${updates.length} rows.`);
