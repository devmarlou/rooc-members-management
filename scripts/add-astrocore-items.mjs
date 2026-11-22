// One-off: add the four Astrocore auction items (Big Blue, Big Red, Small Blue,
// Small Red) as free-for-all items listed before Puppet Card. Like the Illusion
// Card Fragment they only take up page slots: no member is assigned, no limits,
// no cycle progress. Existing items keep their order and move down four places.
//
// Dry run by default (prints what would change, writes nothing).
//   node scripts/add-astrocore-items.mjs           # preview
//   node scripts/add-astrocore-items.mjs --apply   # write
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const OPEN_AUCTION_STATUSES = ["active", "locked"];
const AUCTION_TYPES = ["gl_woe", "league_prize"];
// In-game listing order on the first auction page.
const ASTROCORES = [
  { item_key: "astrocore_big_blue", name: "Big Blue Astrocore", short_name: "Big Blue" },
  { item_key: "astrocore_big_red", name: "Big Red Astrocore", short_name: "Big Red" },
  { item_key: "astrocore_small_blue", name: "Small Blue Astrocore", short_name: "Small Blue" },
  { item_key: "astrocore_small_red", name: "Small Red Astrocore", short_name: "Small Red" }
];
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

loadEnv(path.join(process.cwd(), ".env.local"));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const [itemsResult, openAuctionsResult] = await Promise.all([
  supabase.from("auction_items").select("id,item_key,name,sort_order").order("sort_order", { ascending: true }),
  supabase.from("auctions").select("id,type,status").in("status", OPEN_AUCTION_STATUSES)
]);
if (itemsResult.error) throw itemsResult.error;
if (openAuctionsResult.error) throw openAuctionsResult.error;

const existing = itemsResult.data || [];
const newKeys = new Set(ASTROCORES.map((item) => item.item_key));
if (existing.some((item) => newKeys.has(item.item_key))) {
  console.log("Astrocore items already exist. Nothing to do.");
  process.exit(0);
}
// Item order drives page numbers, so never change it under an open auction.
if ((openAuctionsResult.data || []).length) {
  throw new Error("An auction is active or locked. Finish or cancel it first.");
}

const shift = ASTROCORES.length;
const newRows = ASTROCORES.map((item, index) => ({
  ...item,
  sort_order: index + 1,
  default_per_round_cap: 0,
  applies_to_auction_types: AUCTION_TYPES,
  gates_round_completion: false
}));

console.log("New items:");
for (const row of newRows) console.log(`  ${row.sort_order}. ${row.name} (${row.item_key}), free for all`);
console.log("Existing items move down:");
for (const item of existing) console.log(`  ${item.sort_order} -> ${item.sort_order + shift}  ${item.name}`);

if (!apply) {
  console.log("\nDry run. Re-run with --apply to write.");
  process.exit(0);
}

// sort_order is unique, so move the last item first to avoid collisions.
for (const item of [...existing].sort((a, b) => b.sort_order - a.sort_order)) {
  const { error } = await supabase.from("auction_items").update({ sort_order: item.sort_order + shift }).eq("id", item.id);
  if (error) throw error;
}
const { error: insertError } = await supabase.from("auction_items").insert(newRows);
if (insertError) throw insertError;

await supabase.from("dashboard_events").insert({ event_type: "auction_items_updated" });
console.log("\nDone. Astrocore items added.");
