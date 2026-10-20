// Rebuild each member's Puppet Card held total for the active round from
// fulfilled allocations in finished auctions, then recompute the current-cycle
// count from it. Dry run by default; pass --apply to write.
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const HELD_TOTALS_KEY = "__held_totals";
const ITEM_KEY = "puppet_card";
const AUCTION_JOIN_COOLDOWN_MS = 96 * 60 * 60 * 1000;
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

function inCooldown(member, nowMs) {
  const joinedAtMs = new Date(member?.joined_at || NaN).getTime();
  return Number.isFinite(joinedAtMs) && joinedAtMs + AUCTION_JOIN_COOLDOWN_MS > nowMs;
}

loadEnv(path.join(process.cwd(), ".env.local"));
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: round, error: roundError } = await supabase.from("rounds").select("id,round_number").eq("status", "active").limit(1).maybeSingle();
if (roundError) throw roundError;
if (!round) throw new Error("No active round found.");

const [members, items, progress, rotation, memberCaps, roundCaps, auctions] = await Promise.all([
  supabase.from("members").select("id,char_name,joined_at"),
  supabase.from("auction_items").select("id,item_key,default_per_round_cap"),
  supabase.from("member_round_progress").select("id,member_id,received").eq("round_id", round.id),
  supabase.from("rotation_list").select("member_id,position").eq("round_id", round.id),
  supabase.from("member_cap_overrides").select("member_id,item_id,cap").eq("round_id", round.id),
  supabase.from("round_item_cap_overrides").select("item_id,cap").eq("round_id", round.id),
  supabase.from("auctions").select("id,name,started_at,auction_allocations(member_id,item_id,quantity,fulfilled)").eq("round_id", round.id).eq("status", "done")
]);
for (const result of [members, items, progress, rotation, memberCaps, roundCaps, auctions]) if (result.error) throw result.error;

const item = items.data.find((row) => row.item_key === ITEM_KEY);
if (!item) throw new Error(`Item ${ITEM_KEY} not found.`);
const membersById = new Map(members.data.map((member) => [member.id, member]));
const positionByMemberId = new Map(rotation.data.map((row) => [row.member_id, row.position]));
const memberCapByMemberId = new Map(memberCaps.data.filter((row) => row.item_id === item.id).map((row) => [row.member_id, row.cap]));
const roundCap = roundCaps.data.find((row) => row.item_id === item.id)?.cap;
const capFor = (memberId) => memberCapByMemberId.get(memberId) ?? roundCap ?? item.default_per_round_cap ?? 0;

const heldByMemberId = new Map();
for (const auction of auctions.data) {
  for (const allocation of auction.auction_allocations || []) {
    if (allocation.item_id !== item.id || allocation.fulfilled === false) continue;
    heldByMemberId.set(allocation.member_id, (heldByMemberId.get(allocation.member_id) || 0) + (allocation.quantity || 0));
  }
}

const nowMs = Date.now();
const cycles = progress.data
  .filter((row) => capFor(row.member_id) > 0 && membersById.has(row.member_id) && !inCooldown(membersById.get(row.member_id), nowMs))
  .map((row) => Math.floor((heldByMemberId.get(row.member_id) || 0) / capFor(row.member_id)));
const completedCycles = cycles.length ? Math.min(...cycles) : 0;

const updates = [];
for (const row of progress.data) {
  const received = row.received && typeof row.received === "object" ? row.received : {};
  const heldTotals = { ...(received[HELD_TOTALS_KEY] || {}) };
  const cap = capFor(row.member_id);
  const held = heldByMemberId.get(row.member_id) || 0;
  const current = cap > 0 ? Math.min(Math.max(held - completedCycles * cap, 0), cap) : 0;
  const before = { held: heldTotals[ITEM_KEY] ?? 0, current: received[ITEM_KEY] ?? 0 };
  if (before.held === held && before.current === current) continue;
  updates.push({
    id: row.id,
    name: membersById.get(row.member_id)?.char_name || row.member_id,
    position: positionByMemberId.get(row.member_id) || null,
    before,
    after: { held, current },
    received: { ...received, [ITEM_KEY]: current, [HELD_TOTALS_KEY]: { ...heldTotals, [ITEM_KEY]: held } }
  });
}

updates.sort((a, b) => (a.position || 999) - (b.position || 999));
console.log(`Round ${round.round_number}: completed ${ITEM_KEY} cycles = ${completedCycles}; ${updates.length} of ${progress.data.length} progress rows change.`);
for (const update of updates) {
  console.log(`  pos ${String(update.position ?? "-").padStart(3)} ${update.name.padEnd(16)} held ${update.before.held} -> ${update.after.held}   current ${update.before.current} -> ${update.after.current}`);
}

if (!apply) {
  console.log("Dry run. Re-run with --apply to write these changes.");
  process.exit(0);
}
for (const update of updates) {
  const { error } = await supabase.from("member_round_progress").update({ received: update.received }).eq("id", update.id);
  if (error) throw error;
}
console.log(`Updated ${updates.length} rows.`);
