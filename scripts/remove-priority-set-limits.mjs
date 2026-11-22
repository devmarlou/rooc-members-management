// One-off: remove auction priority from every member and put everyone on the
// same limits: Puppet Card 1, L&D 4, T&S 6.
//   - clears feather and card priority flags on all members
//   - deletes member limit overrides that are above the new limits (the old
//     priority 9/10 overrides); lower ones (e.g. a member set to 0) are kept
//   - sets the active round's shared limits and the saved defaults to 1/4/6
//   - recomputes each member's complete flag against the new limits
// Current-cycle counts are not touched: a member above the new limit simply
// waits for the next cycle reset, as the spec says.
//
// Dry run by default (prints what would change, writes nothing).
//   node scripts/remove-priority-set-limits.mjs           # preview
//   node scripts/remove-priority-set-limits.mjs --apply   # write
// --apply first saves a JSON backup of every touched row to codex/ (git-ignored).
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const NEW_LIMITS = { puppet_card: 1, feather_ld: 4, feather_ts: 6 };
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

const [openAuctionsResult, membersResult, itemsResult, roundCapsResult, memberCapsResult, progressResult] = await Promise.all([
  supabase.from("auctions").select("id,type,status").in("status", OPEN_AUCTION_STATUSES),
  supabase.from("members").select("id,char_name,auction_priority_override,auction_priority_card"),
  supabase.from("auction_items").select("id,item_key,short_name,default_per_round_cap,gates_round_completion"),
  supabase.from("round_item_cap_overrides").select("id,round_id,item_id,cap").eq("round_id", activeRound.id),
  supabase.from("member_cap_overrides").select("id,round_id,member_id,item_id,cap").eq("round_id", activeRound.id),
  supabase.from("member_round_progress").select("id,member_id,received,is_complete,completed_at").eq("round_id", activeRound.id)
]);
for (const result of [openAuctionsResult, membersResult, itemsResult, roundCapsResult, memberCapsResult, progressResult]) {
  if (result.error) throw result.error;
}

// An open auction's list was planned from the current priority and limits, so
// changing them under it would make the finished result disagree with the list.
if ((openAuctionsResult.data || []).length) {
  const open = openAuctionsResult.data.map((auction) => `${auction.type} (${auction.status})`).join(", ");
  throw new Error(`Open auction(s) found: ${open}. Finish or cancel them first.`);
}

const members = membersResult.data || [];
const namesById = new Map(members.map((member) => [member.id, member.char_name]));
const limitedItems = (itemsResult.data || []).filter((item) => item.item_key in NEW_LIMITS);
const itemsById = new Map((itemsResult.data || []).map((item) => [item.id, item]));
if (limitedItems.length !== Object.keys(NEW_LIMITS).length) throw new Error("Could not find every limited item.");

const priorityMembers = members.filter((member) => member.auction_priority_override || member.auction_priority_card);
const overrides = memberCapsResult.data || [];
const overridesToDelete = overrides.filter((row) => {
  const item = itemsById.get(row.item_id);
  return item && item.item_key in NEW_LIMITS && row.cap > NEW_LIMITS[item.item_key];
});
const deletedIds = new Set(overridesToDelete.map((row) => row.id));
const overridesKept = overrides.filter((row) => !deletedIds.has(row.id));
const roundCapByItemId = new Map((roundCapsResult.data || []).map((row) => [row.item_id, row.cap]));

// Same rules as auctionEngine's capFor / isMemberComplete, on the new limits.
const keptCaps = new Map(overridesKept.map((row) => [`${row.member_id}:${row.item_id}`, row.cap]));
const capFor = (memberId, item) =>
  keptCaps.get(`${memberId}:${item.id}`) ??
  (item.item_key in NEW_LIMITS ? NEW_LIMITS[item.item_key] : roundCapByItemId.get(item.id) ?? item.default_per_round_cap ?? 0);
const gatingItems = (itemsResult.data || []).filter((item) => item.gates_round_completion);
const progressChanges = [];
for (const progress of progressResult.data || []) {
  const received = normalizeReceived(progress.received);
  const isComplete = gatingItems.every((item) => (received[item.item_key] || 0) >= capFor(progress.member_id, item));
  if (isComplete === Boolean(progress.is_complete)) continue;
  progressChanges.push({
    id: progress.id,
    member: namesById.get(progress.member_id) || progress.member_id,
    is_complete: isComplete,
    completed_at: isComplete ? progress.completed_at || new Date().toISOString() : null
  });
}

const label = (row) => `${namesById.get(row.member_id) || row.member_id} ${itemsById.get(row.item_id)?.short_name} ${row.cap}`;
console.log(`Round ${activeRound.round_number}, ${members.length} members\n`);
console.log(`Priority removed from ${priorityMembers.length}:`);
for (const member of priorityMembers) {
  console.log(`  ${member.char_name}${member.auction_priority_override ? " [feather]" : ""}${member.auction_priority_card ? " [card]" : ""}`);
}
console.log(`\nMember limit overrides deleted (${overridesToDelete.length}):`);
for (const row of overridesToDelete) console.log(`  ${label(row)}`);
console.log(`\nMember limit overrides kept (${overridesKept.length}):`);
for (const row of overridesKept) console.log(`  ${label(row)}`);
console.log("\nShared limits:");
for (const item of limitedItems) {
  console.log(`  ${item.short_name}: round ${roundCapByItemId.get(item.id) ?? "-"} -> ${NEW_LIMITS[item.item_key]}, default ${item.default_per_round_cap} -> ${NEW_LIMITS[item.item_key]}`);
}
console.log(`\nComplete flag changes (${progressChanges.length}):`);
for (const change of progressChanges) console.log(`  ${change.member}: complete=${change.is_complete}`);

if (!apply) {
  console.log("\nDry run only. Re-run with --apply to write.");
  process.exit(0);
}

const backupDir = path.join(process.cwd(), "codex");
fs.mkdirSync(backupDir, { recursive: true });
const backupPath = path.join(backupDir, `remove-priority-backup-round${activeRound.round_number}-${Date.now()}.json`);
fs.writeFileSync(backupPath, JSON.stringify({
  priorityMembers,
  memberCapOverrides: overrides,
  roundCaps: roundCapsResult.data || [],
  itemDefaults: limitedItems,
  progress: (progressResult.data || []).map(({ id, member_id, is_complete, completed_at }) => ({ id, member_id, is_complete, completed_at }))
}, null, 2));
console.log(`\nBackup written: ${backupPath}`);

if (priorityMembers.length) {
  const { error } = await supabase
    .from("members")
    .update({ auction_priority_override: false, auction_priority_card: false })
    .in("id", priorityMembers.map((member) => member.id));
  if (error) throw error;
}
if (overridesToDelete.length) {
  const { error } = await supabase.from("member_cap_overrides").delete().in("id", overridesToDelete.map((row) => row.id));
  if (error) throw error;
}
const { error: roundCapError } = await supabase
  .from("round_item_cap_overrides")
  .upsert(limitedItems.map((item) => ({ round_id: activeRound.id, item_id: item.id, cap: NEW_LIMITS[item.item_key] })), { onConflict: "round_id,item_id" });
if (roundCapError) throw roundCapError;
for (const item of limitedItems) {
  const { error } = await supabase.from("auction_items").update({ default_per_round_cap: NEW_LIMITS[item.item_key] }).eq("id", item.id);
  if (error) throw error;
}
for (const change of progressChanges) {
  const { error } = await supabase
    .from("member_round_progress")
    .update({ is_complete: change.is_complete, completed_at: change.completed_at })
    .eq("id", change.id);
  if (error) throw error;
}

await supabase.from("dashboard_events").insert({ event_type: "auction_limits_updated" });
console.log("Done. Priority removed and limits set to 1/4/6.");
