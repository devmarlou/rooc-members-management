// One-off: reset L&D / T&S feather progress to 0 for every member in the
// active round, so the next feather allocation starts again from rotation #1.
// Puppet Card (and any other item) progress is left exactly as it is.
//
// Dry run by default (prints what would change, writes nothing).
//   node scripts/reset-feather-progress.mjs           # preview
//   node scripts/reset-feather-progress.mjs --apply   # write
// --apply first saves a JSON backup of every touched row to codex/ (git-ignored).
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const HELD_TOTALS_KEY = "__held_totals";
const FEATHER_KEYS = ["feather_ld", "feather_ts"];
const OPEN_AUCTION_STATUSES = ["active", "locked"];
const apply = process.argv.includes("--apply");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] ||= value;
  }
}

function normalizeReceived(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

loadEnv(path.join(process.cwd(), ".env.local"));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const { data: activeRound, error: roundError } = await supabase
  .from("rounds")
  .select("id,round_number")
  .eq("status", "active")
  .order("started_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (roundError) throw roundError;
if (!activeRound) throw new Error("No active round found.");

const [openAuctionsResult, membersResult, rotationResult, progressResult, itemsResult, roundCapsResult, memberCapsResult] =
  await Promise.all([
    supabase.from("auctions").select("id,type,status").in("status", OPEN_AUCTION_STATUSES),
    supabase.from("members").select("id,char_name"),
    supabase.from("rotation_list").select("member_id,position").eq("round_id", activeRound.id).order("position", { ascending: true }),
    supabase.from("member_round_progress").select("id,member_id,received,is_complete,completed_at").eq("round_id", activeRound.id),
    supabase.from("auction_items").select("id,item_key,default_per_round_cap,gates_round_completion"),
    supabase.from("round_item_cap_overrides").select("item_id,cap").eq("round_id", activeRound.id),
    supabase.from("member_cap_overrides").select("member_id,item_id,cap").eq("round_id", activeRound.id)
  ]);
for (const result of [openAuctionsResult, membersResult, rotationResult, progressResult, itemsResult, memberCapsResult]) {
  if (result.error) throw result.error;
}
const missingRoundCaps = roundCapsResult.error && ["42P01", "PGRST205"].includes(roundCapsResult.error.code);
if (roundCapsResult.error && !missingRoundCaps) throw roundCapsResult.error;

// An open auction's allocations were planned from the current progress —
// resetting under it would let finishing it re-apply the old feather counts.
if ((openAuctionsResult.data || []).length) {
  const open = openAuctionsResult.data.map((auction) => `${auction.type} (${auction.status})`).join(", ");
  throw new Error(`Open auction(s) found: ${open}. Finish or cancel them first.`);
}

const namesById = new Map((membersResult.data || []).map((member) => [member.id, member.char_name]));
const positionById = new Map((rotationResult.data || []).map((entry) => [entry.member_id, entry.position]));
const gatingItems = (itemsResult.data || []).filter((item) => item.gates_round_completion);
const roundCaps = new Map((missingRoundCaps ? [] : roundCapsResult.data || []).map((row) => [row.item_id, row.cap]));
const memberCaps = new Map((memberCapsResult.data || []).map((row) => [`${row.member_id}:${row.item_id}`, row.cap]));
const capFor = (memberId, item) =>
  memberCaps.get(`${memberId}:${item.id}`) ?? roundCaps.get(item.id) ?? item.default_per_round_cap ?? 0;

const changes = [];
for (const progress of progressResult.data || []) {
  const before = normalizeReceived(progress.received);
  const held = { ...normalizeReceived(before[HELD_TOTALS_KEY]) };
  const received = { ...before };
  for (const key of FEATHER_KEYS) {
    received[key] = 0;
    if (key in held) held[key] = 0;
  }
  if (Object.keys(held).length) received[HELD_TOTALS_KEY] = held;

  // Same rule as auctionEngine's isMemberComplete, on the reset counts.
  const isComplete = gatingItems.every((item) => (received[item.item_key] || 0) >= capFor(progress.member_id, item));
  changes.push({
    id: progress.id,
    member: namesById.get(progress.member_id) || progress.member_id,
    position: positionById.get(progress.member_id) ?? null,
    before: progress,
    after: {
      received,
      is_complete: isComplete,
      completed_at: isComplete ? progress.completed_at || new Date().toISOString() : null
    }
  });
}
changes.sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));

const fmt = (received) => {
  const r = normalizeReceived(received);
  const h = normalizeReceived(r[HELD_TOTALS_KEY]);
  return `L&D ${r.feather_ld ?? 0} (held ${h.feather_ld ?? "-"}) | T&S ${r.feather_ts ?? 0} (held ${h.feather_ts ?? "-"}) | Card ${r.puppet_card ?? 0} (held ${h.puppet_card ?? "-"})`;
};
console.log(`Round ${activeRound.round_number}: ${changes.length} members\n`);
for (const change of changes) {
  console.log(`#${change.position ?? "?"} ${change.member}`);
  console.log(`   before: ${fmt(change.before.received)}  complete=${change.before.is_complete}`);
  console.log(`   after:  ${fmt(change.after.received)}  complete=${change.after.is_complete}`);
}

if (!apply) {
  console.log("\nDry run only. Re-run with --apply to write.");
  process.exit(0);
}

const backupDir = path.join(process.cwd(), "codex");
fs.mkdirSync(backupDir, { recursive: true });
const backupPath = path.join(backupDir, `feather-reset-backup-round${activeRound.round_number}-${Date.now()}.json`);
fs.writeFileSync(backupPath, JSON.stringify(changes.map((change) => change.before), null, 2));
console.log(`\nBackup written: ${backupPath}`);

for (const change of changes) {
  const { error } = await supabase.from("member_round_progress").update(change.after).eq("id", change.id);
  if (error) throw error;
}

await supabase.from("dashboard_events").insert({ event_type: "feather_progress_reset" });
console.log(`Updated ${changes.length} rows.`);
