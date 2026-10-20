// One-off: move every member who currently holds auction priority (feather or
// card) into the top block of the active round's rotation, keeping their
// relative order and reusing the round's existing position numbers.
// Dry run by default; pass --apply to write.
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { reorderRotation } from "../lib/memberRoundEnrollment.js";

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

const [rotation, members] = await Promise.all([
  supabase.from("rotation_list").select("member_id,position").eq("round_id", round.id).order("position", { ascending: true }),
  supabase.from("members").select("id,char_name,auction_priority_override,auction_priority_card")
]);
if (rotation.error) throw rotation.error;
if (members.error) throw members.error;

const membersById = new Map(members.data.map((member) => [member.id, member]));
const isPriority = (memberId) => {
  const member = membersById.get(memberId);
  return Boolean(member?.auction_priority_override || member?.auction_priority_card);
};
const rows = rotation.data;
const ordered = [...rows.filter((row) => isPriority(row.member_id)), ...rows.filter((row) => !isPriority(row.member_id))];

console.log(`Round ${round.round_number}: ${rows.length} rotation rows.`);
let moved = 0;
ordered.forEach((row, index) => {
  const position = rows[index].position;
  if (position === row.position) return;
  moved += 1;
  console.log(`  ${membersById.get(row.member_id)?.char_name || row.member_id}: ${row.position} -> ${position}${isPriority(row.member_id) ? "  (priority)" : ""}`);
});
console.log(`${moved} rows move.`);

if (!apply) {
  console.log("Dry run. Re-run with --apply to write these changes.");
  process.exit(0);
}
const changed = await reorderRotation(supabase, round.id, ordered.map((row) => row.member_id));
console.log(`Updated ${changed} rows.`);
