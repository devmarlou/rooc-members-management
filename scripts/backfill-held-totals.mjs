import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const HELD_TOTALS_KEY = "__held_totals";
const AUCTION_JOIN_COOLDOWN_MS = 96 * 60 * 60 * 1000;
const BASELINE_LINEUP = [
  "WeeYomiBR",
  "Rome",
  "SweetAngel",
  "WeeChrlygBR",
  "WeePriestBR",
  "WeeHuBeshy",
  "WeeSonixBR",
  "XWeeHuRye",
  "WeeMigBR",
  "Tofukidd",
  "Oxie",
  "StepBro",
  "Gradux",
  "Ryjj",
  "A1110",
  "WeeFrztttBR",
  "kimi",
  "Java",
  "Darthas",
  "TaichouBee",
  "Kreyja",
  "SADISTA",
  "Puts",
  "Senyoraaa",
  "Shammyre",
  "Sh1nboo",
  "Nyaruko",
  "Ynori",
  "Messt",
  "Doidoi",
  "BOLTSTAR",
  "Hibernate",
  "RSPKT",
  "AndromedA",
  "Autumn",
  "BanoobsDR",
  "Calixx",
  "Ordz",
  "ASTRiD",
  "YanagnapAD",
  "Tobichan",
  "SNOW",
  "DEVOURED",
  "Mamark",
  "Sanguine",
  "Akyra",
  "Akiii",
  "Miyuyua",
  "Jyliana",
  "MT999",
  "Lalaa",
  "Herius",
  "AfyGPDS",
  "WeeJOSHBR",
  "Helxine",
  "WeeJunBR",
  "Yamato",
  "Shan",
  "WeeGetziiBR",
  "Nasmi",
  "DocxBR",
  "R0dd",
  "BanoobsBR",
  "Kushinero",
  "fredplays",
  "WeeDevaBR",
  "WeeYagsBR",
  "WeeHuBR",
  "WeeSunxBR",
  "KrisJulio",
  "NakedGarfield0",
  "NakedGarfield1",
  "NakedGarfiel2",
  "Osnub",
  "Alcyone",
  "PritongPusit",
  "Supreme",
  "BELL"
];
const FULL_ITEMS = new Set([
  "Rome",
  "SweetAngel",
  "WeeChrlygBR",
  "WeePriestBR",
  "WeeHuBeshy",
  "WeeSonixBR",
  "XWeeHuRye",
  "WeeMigBR",
  "Tofukidd",
  "Oxie",
  "StepBro",
  "Gradux",
  "Ryjj",
  "A1110",
  "WeeFrztttBR",
  "kimi",
  "Java",
  "Darthas",
  "TaichouBee",
  "Kreyja",
  "SADISTA",
  "Puts",
  "Senyoraaa",
  "Shammyre",
  "Sh1nboo",
  "Nyaruko",
  "Ynori",
  "Messt",
  "Doidoi",
  "BOLTSTAR",
  "Hibernate",
  "RSPKT",
  "AndromedA",
  "Autumn",
  "BanoobsDR",
  "Calixx",
  "Ordz",
  "ASTRiD",
  "YanagnapAD"
]);
const PUPPET_TS = new Set([
  "Tobichan",
  "SNOW",
  "DEVOURED",
  "Mamark",
  "Sanguine",
  "Akyra",
  "Akiii",
  "Miyuyua",
  "Jyliana",
  "Helxine",
  "WeeYomiBR"
]);
const PUPPET_ONLY = new Set(["MT999", "Lalaa", "Herius", "AfyGPDS", "WeeJOSHBR"]);

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

function baselineHeld(memberName) {
  if (memberName === "WeeHuBeshy") return { puppet_card: 2, feather_ld: 8, feather_ts: 8 };
  if (FULL_ITEMS.has(memberName)) return { puppet_card: 1, feather_ld: 8, feather_ts: 8 };
  if (PUPPET_TS.has(memberName)) return { puppet_card: 1, feather_ld: 0, feather_ts: 8 };
  if (PUPPET_ONLY.has(memberName)) return { puppet_card: 1, feather_ld: 0, feather_ts: 0 };
  return { puppet_card: 0, feather_ld: 0, feather_ts: 0 };
}

function addTotals(left, right) {
  const total = { ...left };
  for (const [key, count] of Object.entries(right || {})) {
    total[key] = (total[key] || 0) + (Number(count) || 0);
  }
  return total;
}

function isMemberInAuctionCooldown(member, nowMs = Date.now()) {
  if (!member?.joined_at) return false;
  const joinedAtMs = new Date(member.joined_at).getTime();
  if (Number.isNaN(joinedAtMs)) return false;
  return joinedAtMs + AUCTION_JOIN_COOLDOWN_MS > nowMs;
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

const [
  membersResult,
  progressResult,
  itemsResult,
  auctionsResult
] = await Promise.all([
  supabase.from("members").select("id,char_name,joined_at"),
  supabase.from("member_round_progress").select("id,member_id,received").eq("round_id", activeRound.id),
  supabase.from("auction_items").select("id,item_key,default_per_round_cap,gates_round_completion"),
  supabase
    .from("auctions")
    .select("id,auction_allocations(member_id,item_id,quantity)")
    .eq("round_id", activeRound.id)
    .eq("status", "done")
]);
if (membersResult.error) throw membersResult.error;
if (progressResult.error) throw progressResult.error;
if (itemsResult.error) throw itemsResult.error;
if (auctionsResult.error) throw auctionsResult.error;

const roundCapsResult = await supabase
  .from("round_item_cap_overrides")
  .select("item_id,cap")
  .eq("round_id", activeRound.id);
if (roundCapsResult.error) throw roundCapsResult.error;

const membersById = new Map((membersResult.data || []).map((member) => [member.id, member]));
const itemKeyById = new Map((itemsResult.data || []).map((item) => [item.id, item.item_key]));
const roundCapsByItemId = new Map((roundCapsResult.data || []).map((row) => [row.item_id, row.cap]));
const capFor = (item) => roundCapsByItemId.get(item.id) ?? item.default_per_round_cap ?? 0;
const historyTotalsByMemberId = new Map();
for (const auction of auctionsResult.data || []) {
  for (const allocation of auction.auction_allocations || []) {
    const itemKey = itemKeyById.get(allocation.item_id);
    if (!itemKey) continue;
    const current = historyTotalsByMemberId.get(allocation.member_id) || {};
    current[itemKey] = (current[itemKey] || 0) + (allocation.quantity || 0);
    historyTotalsByMemberId.set(allocation.member_id, current);
  }
}

const heldByMemberId = new Map();
for (const progress of progressResult.data || []) {
  const member = membersById.get(progress.member_id);
  if (!member) continue;
  heldByMemberId.set(progress.member_id, addTotals(baselineHeld(member.char_name), historyTotalsByMemberId.get(progress.member_id)));
}

const completedCyclesByItemKey = new Map();
for (const item of itemsResult.data || []) {
  if (!item.gates_round_completion) continue;
  const cap = capFor(item);
  if (cap <= 0) continue;
  const eligibleCycles = [];
  for (const progress of progressResult.data || []) {
    const member = membersById.get(progress.member_id);
    if (!member || isMemberInAuctionCooldown(member)) continue;
    const held = heldByMemberId.get(progress.member_id) || {};
    eligibleCycles.push(Math.floor((held[item.item_key] || 0) / cap));
  }
  completedCyclesByItemKey.set(item.item_key, eligibleCycles.length ? Math.min(...eligibleCycles) : 0);
}

let updated = 0;
const summary = { puppet_card: 0, feather_ld: 0, feather_ts: 0 };
for (const progress of progressResult.data || []) {
  const member = membersById.get(progress.member_id);
  if (!member) continue;
  const held = heldByMemberId.get(progress.member_id) || {};
  const received = {
    ...(progress.received || {}),
    [HELD_TOTALS_KEY]: held
  };
  for (const item of itemsResult.data || []) {
    if (!item.gates_round_completion) continue;
    const cap = capFor(item);
    if (cap <= 0) {
      received[item.item_key] = 0;
      continue;
    }
    const completedCycles = completedCyclesByItemKey.get(item.item_key) || 0;
    received[item.item_key] = Math.min(Math.max((held[item.item_key] || 0) - completedCycles * cap, 0), cap);
  }
  const { error } = await supabase
    .from("member_round_progress")
    .update({ received })
    .eq("id", progress.id);
  if (error) throw error;
  updated += 1;
  summary.puppet_card += held.puppet_card || 0;
  summary.feather_ld += held.feather_ld || 0;
  summary.feather_ts += held.feather_ts || 0;
}

console.log(JSON.stringify({
  round: activeRound.round_number,
  updated,
  completedCycles: Object.fromEntries(completedCyclesByItemKey),
  summary
}, null, 2));
